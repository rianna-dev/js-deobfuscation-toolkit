const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { decode }    = require('../deobfuscator/strings');
const { unflatten } = require('../deobfuscator/flatten');
const { fold }      = require('../deobfuscator/constants');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const fixture = read('samples/obfuscated.js');

test('strings: accessor calls collapse to string literals', () => {
  const out = decode(fixture);
  assert.ok(out.includes('"Hello, world!"'),
    'expected decoded literal "Hello, world!" in output');
  // accessor declaration still exists; we only care that no numeric-arg
  // call sites remain — they all should have folded into literals.
  assert.ok(!/_0x4b5c\s*\(\s*\d+\s*,\s*\d+\s*\)/.test(out),
    'expected no numeric-argument accessor calls to remain');
});

test('flatten: while-switch dispatcher is inlined in order', () => {
  const decoded = decode(fixture);
  const flat = unflatten(decoded);
  assert.ok(!/switch\s*\(/.test(flat), 'switch statement should be gone');
  assert.ok(!/while\s*\(\s*true\s*\)/.test(flat), 'while(true) should be gone');

  // Dispatch order is "3|0|1|2", so the ua assignment (case "3")
  // must appear before the message assignment (case "0").
  const uaIdx = flat.indexOf('var ua');
  const msgIdx = flat.indexOf('var message');
  assert.ok(uaIdx !== -1 && msgIdx !== -1, 'both decls should be present');
  assert.ok(uaIdx < msgIdx,
    'ua (case 3) must appear before message (case 0) given order 3|0|1|2');
});

test('constants: folds string concatenation across multiple passes', () => {
  const src = 'var x = "a" + "b" + "c" + "d";';
  const out = fold(src);
  assert.match(out, /"abcd"/);
});

test('constants: folds numeric arithmetic with precedence', () => {
  const out = fold('var n = 2 + 3 * 4;');
  assert.match(out, /\b14\b/);
});

test('constants: folds string length and indexed access', () => {
  assert.match(fold('var n = "hello".length;'),  /\b5\b/);
  assert.match(fold('var c = "abc"[1];'),        /"b"/);
});

test('constants: folds typeof on literals', () => {
  assert.match(fold('var t = typeof "x";'), /"string"/);
  assert.match(fold('var t = typeof 1;'),   /"number"/);
});

test('full pipeline: obfuscated fixture ends up readable', () => {
  const decoded = decode(fixture);
  const flat    = unflatten(decoded);
  const folded  = fold(flat);

  // After all three passes the string "navigator.userAgent" should exist
  // as a single folded literal rather than "" + "navigator" + "." + "userAgent".
  assert.match(folded, /"navigator\.userAgent"/);
  assert.ok(folded.includes('"Hello, world!"'));
  assert.ok(!/switch/.test(folded));
});
