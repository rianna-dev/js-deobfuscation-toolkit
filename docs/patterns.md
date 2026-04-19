# Obfuscation patterns seen in the wild

Rough notes on the recurring shapes you see when reading modern JavaScript
obfuscator output. Useful when triaging a new payload — most of the work
is recognising "oh, I've seen this one before" and applying the
corresponding undo pass. Written from memory as I encounter variants, so
some entries are more detailed than others.

## 1. String-array / accessor indirection

Every literal string is replaced with a call to a tiny accessor that
indexes into a global array:

```js
var _arr = ["log", "info", "warn"];
function _get(i, k) { return _arr[i - k]; }
console[_get(5, 5)]("hi");  //  -> console.log("hi")
```

The offset `k` is constant but randomised per call site, so static grep
for a specific index gives nothing. The accessor is usually wrapped in
one or more IIFEs that shuffle the array at load time:

```js
(function (arr, n) {
  while (--n) arr.push(arr.shift());
})(_arr, 0x7d);
```

**Undo.** Rebuild `_arr`, the shuffling IIFE, and the accessor inside an
isolated `vm` context. Every call to the accessor with constant
arguments can then be folded to its literal statically.

**Variant.** Encrypted string arrays — every entry is base64 / XOR / RC4
and the accessor decrypts on demand. The key is baked in, often in an
IIFE near the declaration. Same undo strategy: evaluate the decoder in
`vm`, snapshot the decoded array, substitute.

## 2. Control-flow flattening

Linear code becomes a dispatcher-driven state machine:

```js
var order = "3|0|2|1".split("|"), i = 0;
while (true) {
  switch (order[i++]) {
    case "0": A; continue;
    case "1": B; continue;
    case "2": C; continue;
    case "3": D; continue;
  }
  break;
}
```

The dispatch order is encoded in the split literal. Variants I've hit:

- Order array built via `.reverse()`, `.sort()`, or mutations during the loop.
- Switch keys are numbers, hex, or obfuscated literals that resolve via
  the string array (so you can only read them after pass 1).
- Dispatcher variable and counter declared separately, sometimes hoisted
  from an outer function.
- Nested flattening — each `case` body itself contains another flattened
  block. Apply the pass repeatedly until nothing changes.

**Undo.** Recover the dispatch order, inline case bodies in that order,
strip the trailing `continue` / `break`.

## 3. Dead-code injection and opaque predicates

Never-taken branches scattered through the code:

```js
if ("abc" === "cba") { importantCode(); }
if (!!-0x1) noop();
```

Predicates depend on identifiers the obfuscator fully controls, so the
branch is always same-taken.

**Undo.** Constant-fold binary / unary expressions, then drop branches
whose test folds to a literal.

## 4. Anti-debug traps

A small set recurs:

- `debugger;` inside a tight `setInterval` — devtools open freezes the
  page and cancels script execution.
- Timing trap: `const t = performance.now(); debugger; if
  (performance.now() - t > 100) abort();`.
- `Function.prototype.toString` override to hide native-code markers and
  detect tampering.
- Console method traps: `Object.defineProperty(console, 'log', { get()
  { report(); return noop; } })`.

**Undo (when sandboxing).** Stub `debugger` to a no-op, clamp
`performance.now()` delta to zero, don't touch `Function.prototype
.toString`, intercept `defineProperty` on `console`.

## 5. Integrity / tamper checks

Self-hash of the script body compared to a hard-coded value. Modifying
any byte of the source — including whitespace — invalidates the hash and
the script aborts or reports upstream.

```js
(function check(fn) {
  var s = fn.toString();
  if (hash(s) !== 0x7A8F1C) return abort();
  setTimeout(function () { check(check); }, 4000);
})(check);
```

**Undo.** Don't edit the source text. Transform on the AST and
regenerate — regenerator output typically matches the original hash only
if you match whitespace and quoting exactly, so either leave the check
bypassed via patch, or identify and null out the comparison node.

## 6. Proxy-function dispatch

A single function call wraps every call site of every method on a hidden
object:

```js
var _methods = {
  a: function (x, y) { return x + y; },
  b: function (x)    { return x * 2; },
};
function _proxy(key /*, ...args */) {
  return _methods[key].apply(null, [].slice.call(arguments, 1));
}
// callers
_proxy('a', 1, 2);
_proxy('b', 10);
```

Flattens the static call graph — analysers lose track of who calls what.

**Undo.** Identify the method table + proxy function, rewrite each proxy
call back to the direct method invocation.

## 7. Scope-walking variable aliasing

The same local variable referenced through a chain of reassignments so
that a single identifier grep gives nothing:

```js
var a = navigator;
var b = a;
var c = b.userAgent;
```

Obfuscator generates this around every interesting API access.

**Undo.** Propagate constant / single-assignment identifiers, then dead-
code eliminate the intermediates.

---

## Order of passes

For a fresh payload this order usually holds:

1. Identify and extract the string-array loader (array + shuffle IIFE +
   decoder if encrypted), evaluate in `vm`, snapshot.
2. Replace constant-argument accessor calls with their literals.
3. Constant-fold binary / unary / member expressions.
4. Unflatten CFG dispatchers.
5. Eliminate dead branches whose test is a literal.
6. Propagate simple aliasing assignments.
7. Repeat 3–6 until the AST stops changing. Each pass exposes material
   the next pass can consume.
8. Rename the `_0x*` hex identifiers to `var1`, `var2`, ... for
   legibility.

After step 8 the code is usually readable straight through, and you can
start reversing the actual logic (fingerprinting, token derivation,
anti-debug hooks) rather than the obfuscation layer.
