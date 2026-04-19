// Synthetic fixture in the style of obfuscator.io output:
// - A global string array holding every literal used in the program
// - A small accessor function indexing into it with a constant offset
// - Control-flow-flattening around the actual logic
//
// Running strings.js + flatten.js + constants.js against this file should
// recover an immediately-readable version of the original code.

var _0x2f3a = [
  "log", "info", "warn", "error",
  "Hello, world!", "fingerprint", "token",
  "navigator", "userAgent", "platform",
  "split", "join", "length"
];

function _0x4b5c(index, offset) {
  return _0x2f3a[index - offset];
}

(function () {
  var order = "3|0|1|2".split("|");
  var i = 0;
  while (true) {
    switch (order[i++]) {
      case "0":
        var message = _0x4b5c(4, 0);
        continue;
      case "1":
        var tag = [_0x4b5c(5, 0), _0x4b5c(6, 0)][_0x4b5c(11, 0)](":");
        continue;
      case "2":
        console[_0x4b5c(0, 0)](tag, message, ua);
        continue;
      case "3":
        var ua = "" + _0x4b5c(7, 0) + "." + _0x4b5c(8, 0);
        continue;
    }
    break;
  }
})();
