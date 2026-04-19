const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const { Script, createContext } = require('vm');
const fs = require('fs');

// Heuristic string-array decoder.
//
// Target shape (typical obfuscator.io output):
//
//   var _arr = ["foo", "bar", "baz"];
//   function _get(i, k) { return _arr[i - k]; }
//   _get(3, 0);              // -> "baz"
//
// We find the largest all-string array in the program, find a function
// whose sole return reads that array, evaluate both in an isolated vm
// context, then fold every constant-argument call site to its literal.

function findStringArray(ast) {
  let winner = null;
  traverse(ast, {
    VariableDeclarator(path) {
      const init = path.node.init;
      if (!t.isArrayExpression(init)) return;
      if (init.elements.length < 10) return;
      if (!init.elements.every(e => e && t.isStringLiteral(e))) return;
      if (winner && init.elements.length <= winner.size) return;
      winner = {
        name: path.node.id.name,
        size: init.elements.length,
        node: path.node,
      };
    },
  });
  return winner;
}

function findAccessor(ast, arrayName) {
  let result = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      const body = path.node.body.body;
      if (body.length !== 1) return;
      if (!t.isReturnStatement(body[0])) return;
      let touchesArr = false;
      path.traverse({
        Identifier(ip) {
          if (ip.node.name === arrayName) touchesArr = true;
        },
      });
      if (touchesArr) result = path.node;
    },
  });
  return result;
}

function buildDecoder(arrDeclarator, accessorFn) {
  const arrDecl = t.variableDeclaration('var', [arrDeclarator]);
  const code =
    generate(arrDecl).code + '\n' +
    generate(accessorFn).code + '\n' +
    `module.exports = ${accessorFn.id.name};`;
  const ctx = createContext({ module: { exports: null } });
  new Script(code).runInContext(ctx, { timeout: 1000 });
  return ctx.module.exports;
}

function decode(source) {
  const ast = parser.parse(source, { errorRecovery: true });

  const arr = findStringArray(ast);
  if (!arr) throw new Error('no string array found');

  const accessorFn = findAccessor(ast, arr.name);
  if (!accessorFn) throw new Error(`no accessor found for ${arr.name}`);

  const decoder = buildDecoder(
    t.variableDeclarator(t.identifier(arr.name), arr.node.init),
    accessorFn
  );
  const accessorName = accessorFn.id.name;

  let replaced = 0;
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: accessorName })) return;
      const args = path.node.arguments;
      if (!args.every(a => t.isNumericLiteral(a) || t.isStringLiteral(a))) return;
      try {
        const value = decoder(...args.map(a => a.value));
        if (typeof value === 'string') {
          path.replaceWith(t.stringLiteral(value));
          replaced++;
        }
      } catch {
        // leave the call untouched if the decoder throws
      }
    },
  });

  process.stderr.write(`strings: replaced ${replaced} call sites\n`);
  return generate(ast, { compact: false, jsescOption: { minimal: true } }).code;
}

if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node deobfuscator/strings.js <file.js>');
    process.exit(1);
  }
  process.stdout.write(decode(fs.readFileSync(input, 'utf8')));
}

module.exports = { decode };
