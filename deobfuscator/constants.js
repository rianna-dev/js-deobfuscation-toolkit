const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const fs = require('fs');

// Constant folding pass.
//
// Run after the string-array decoder — once literals are inlined, the
// original obfuscator output is littered with expressions that now have
// statically knowable values:
//
//   "nav" + "igator"          -> "navigator"
//   2 + 3 * 4                 -> 14
//   "hello".length            -> 5
//   !0                        -> true
//   typeof "x"                -> "string"
//
// We repeat until the AST stops changing, since each fold can unlock more.

function foldBinary(node) {
  const l = node.left;
  const r = node.right;

  if (t.isStringLiteral(l) && t.isStringLiteral(r) && node.operator === '+') {
    return t.stringLiteral(l.value + r.value);
  }

  if (t.isNumericLiteral(l) && t.isNumericLiteral(r)) {
    const ops = {
      '+':  (a, b) => a + b,
      '-':  (a, b) => a - b,
      '*':  (a, b) => a * b,
      '/':  (a, b) => a / b,
      '%':  (a, b) => a % b,
      '**': (a, b) => a ** b,
      '|':  (a, b) => (a | b) >>> 0,
      '&':  (a, b) => (a & b) >>> 0,
      '^':  (a, b) => (a ^ b) >>> 0,
      '<<': (a, b) => (a << b) >>> 0,
      '>>': (a, b) => a >> b,
    };
    const fn = ops[node.operator];
    if (!fn) return null;
    const result = fn(l.value, r.value);
    if (Number.isFinite(result)) return t.numericLiteral(result);
  }

  return null;
}

function foldUnary(node) {
  const arg = node.argument;

  if (node.operator === '-' && t.isNumericLiteral(arg)) {
    return t.numericLiteral(-arg.value);
  }
  if (node.operator === '!' && t.isNumericLiteral(arg)) {
    return t.booleanLiteral(!arg.value);
  }
  if (node.operator === '!' && t.isBooleanLiteral(arg)) {
    return t.booleanLiteral(!arg.value);
  }
  if (node.operator === '!' && t.isStringLiteral(arg)) {
    return t.booleanLiteral(!arg.value);
  }
  if (node.operator === 'typeof') {
    if (t.isStringLiteral(arg)) return t.stringLiteral('string');
    if (t.isNumericLiteral(arg)) return t.stringLiteral('number');
    if (t.isBooleanLiteral(arg)) return t.stringLiteral('boolean');
  }
  if (node.operator === 'void' && t.isNumericLiteral(arg)) {
    return t.identifier('undefined');
  }

  return null;
}

function foldMember(node) {
  // "abc".length
  if (
    t.isStringLiteral(node.object) &&
    !node.computed &&
    t.isIdentifier(node.property, { name: 'length' })
  ) {
    return t.numericLiteral(node.object.value.length);
  }
  // "abc"[0] or "abc"["0"]
  if (t.isStringLiteral(node.object) && node.computed) {
    const p = node.property;
    if (t.isNumericLiteral(p)) {
      const ch = node.object.value[p.value];
      if (typeof ch === 'string') return t.stringLiteral(ch);
    }
    if (t.isStringLiteral(p)) {
      if (p.value === 'length') return t.numericLiteral(node.object.value.length);
    }
  }
  return null;
}

function fold(source) {
  const ast = parser.parse(source, { errorRecovery: true });
  let totalReplaced = 0;

  for (let pass = 0; pass < 10; pass++) {
    let changedThisPass = 0;
    traverse(ast, {
      BinaryExpression(path) {
        const out = foldBinary(path.node);
        if (out) { path.replaceWith(out); changedThisPass++; }
      },
      UnaryExpression(path) {
        const out = foldUnary(path.node);
        if (out) { path.replaceWith(out); changedThisPass++; }
      },
      MemberExpression(path) {
        const out = foldMember(path.node);
        if (out) { path.replaceWith(out); changedThisPass++; }
      },
    });
    totalReplaced += changedThisPass;
    if (changedThisPass === 0) break;
  }

  process.stderr.write(`constants: folded ${totalReplaced} expression(s)\n`);
  return generate(ast, { compact: false }).code;
}

if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node deobfuscator/constants.js <file.js>');
    process.exit(1);
  }
  process.stdout.write(fold(fs.readFileSync(input, 'utf8')));
}

module.exports = { fold };
