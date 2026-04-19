const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const fs = require('fs');

// Undoes the classic control-flow-flattening shape:
//
//   var order = "3|0|2|1".split("|"), i = 0;
//   while (true) {
//     switch (order[i++]) {
//       case "0": A; continue;
//       case "1": B; continue;
//       case "2": C; continue;
//       case "3": D; continue;
//     }
//     break;
//   }
//
// We recover the dispatch order from the split literal, pull each case
// body out of the switch, strip the trailing continue/break, and emit the
// cases as a linear block in dispatch order.

function parseSplitCall(node) {
  if (!t.isCallExpression(node)) return null;
  const callee = node.callee;
  if (!t.isMemberExpression(callee)) return null;

  const propOk =
    (t.isIdentifier(callee.property, { name: 'split' }) && !callee.computed) ||
    (t.isStringLiteral(callee.property, { value: 'split' }) && callee.computed);
  if (!propOk) return null;

  if (!t.isStringLiteral(callee.object)) return null;
  const sep = node.arguments[0];
  if (!t.isStringLiteral(sep)) return null;
  return callee.object.value.split(sep.value);
}

function findDispatcher(whileNode) {
  if (!t.isBooleanLiteral(whileNode.test, { value: true })) return null;
  if (!t.isBlockStatement(whileNode.body)) return null;
  const stmts = whileNode.body.body;

  const sw = stmts.find(s => t.isSwitchStatement(s));
  if (!sw) return null;
  if (!stmts.some(s => t.isBreakStatement(s))) return null;

  const disc = sw.discriminant;
  if (!t.isMemberExpression(disc)) return null;
  if (!t.isIdentifier(disc.object)) return null;
  return { orderVar: disc.object.name, switchStmt: sw };
}

function stripTerminators(stmts) {
  const out = [];
  for (const s of stmts) {
    if (t.isContinueStatement(s)) continue;
    if (t.isBreakStatement(s)) continue;
    out.push(s);
  }
  return out;
}

function unflatten(source) {
  const ast = parser.parse(source, { errorRecovery: true });
  let unflattened = 0;

  traverse(ast, {
    WhileStatement(path) {
      const disp = findDispatcher(path.node);
      if (!disp) return;

      const binding = path.scope.getBinding(disp.orderVar);
      if (!binding || !t.isVariableDeclarator(binding.path.node)) return;

      const order = parseSplitCall(binding.path.node.init);
      if (!order) return;

      const cases = new Map();
      for (const c of disp.switchStmt.cases) {
        if (!c.test || !t.isStringLiteral(c.test)) continue;
        cases.set(c.test.value, stripTerminators(c.consequent));
      }

      const linear = [];
      for (const key of order) {
        const body = cases.get(key);
        if (!body) return; // incomplete match — leave the while alone
        linear.push(...body);
      }

      path.replaceWithMultiple(linear);
      unflattened++;
    },
  });

  process.stderr.write(`flatten: unflattened ${unflattened} dispatcher(s)\n`);
  return generate(ast, { compact: false }).code;
}

if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node deobfuscator/flatten.js <file.js>');
    process.exit(1);
  }
  process.stdout.write(unflatten(fs.readFileSync(input, 'utf8')));
}

module.exports = { unflatten };
