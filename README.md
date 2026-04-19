# js-deobfuscation-toolkit

Personal research notes and helper scripts for analyzing heavily obfuscated
JavaScript — the kind used in anti-bot products, packed web challenges, and
CTF reversing tasks. Work-in-progress, updated as I encounter new obfuscation
patterns.

## Contents

- `deobfuscator/strings.js` — string array / accessor decoder. Finds the
  array literal plus accessor function pair commonly emitted by
  `obfuscator.io` and similar tools, then statically replaces every
  accessor call with the resolved literal.
- `deobfuscator/flatten.js` — AST-based control-flow flattening reverser.
  Detects the `while (true) { switch (order[i++]) { ... } break; }` shape,
  recovers the dispatch order from the split literal, and inlines the case
  bodies back into a linear block.
- `sandbox/executor.js` — minimal Node.js sandbox for running obfuscated
  payloads offline. Uses `vm` with stubbed browser globals (`window`,
  `navigator`, `document`, `localStorage`, basic DOM shapes) so scripts
  that expect a browser environment don't immediately throw on startup.

## Why

Modern client-side protection scripts stack several layers of obfuscation:
identifier renaming, string encryption, control-flow flattening, opaque
predicates, anti-debug traps. Reading them top-down is pointless — you
reverse them by simplifying the AST pass by pass until the control flow is
legible again.

This repo is the set of small tools I keep rewriting for myself. Nothing
fancy, just habits written down.

## Usage

```bash
npm install
node deobfuscator/strings.js  path/to/obfuscated.js  > step1.js
node deobfuscator/flatten.js  step1.js               > step2.js
node sandbox/executor.js      step2.js
```

## References

- Babel plugin handbook — https://github.com/jamiebuilds/babel-handbook
- `restringer`, `webcrack` — more mature open-source deobfuscators worth
  studying before writing your own
- `obfuscator.io` — common commercial obfuscator; good training target
  because it exposes most of the classic transforms (string array,
  control-flow flattening, dead-code injection)

## Status

Rough. Heuristics over principles — each pass bails out rather than guessing
when the input doesn't match the expected shape. Add new shapes as you run
into them.
