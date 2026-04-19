# samples/

Small synthetic fixtures used by the test suite.

- `obfuscated.js` — hand-written in the style of `obfuscator.io` output:
  a large string-array + accessor function, every literal dereferenced
  through the accessor with a per-call constant offset, and the main
  logic wrapped in a classic `while(true){switch}` CFG-flatten
  dispatcher.

This is intentionally minimal so the pipeline's behaviour is legible in
a diff: the tests check that the string-array accessor calls disappear,
the dispatcher collapses into a linear block, and the constant-folding
pass simplifies what's left into readable literals.

Real payloads from production protection scripts are obviously bigger
and dirtier, but they follow the same shapes. If the tests go green on
these fixtures and fail on a new real payload, the pattern it uses is
something the current passes don't recognise — add the shape and move
on.
