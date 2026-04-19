const vm = require('vm');
const fs = require('fs');

// Minimal Node sandbox for running obfuscated JS offline.
//
// Stubs the globals that browser-only scripts tend to read on startup
// (window, navigator, document, storage, location, timers) so parsing
// doesn't immediately throw and you can observe what the payload does
// next.
//
// Not a security boundary — `vm` is not a hardened sandbox. Run
// untrusted code in a real isolated process if you need isolation.

function makeBrowserStubs() {
  const navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows)',
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webdriver: false,
    plugins: { length: 0 },
    mimeTypes: { length: 0 },
    vendor: 'Google Inc.',
    cookieEnabled: true,
  };

  const screen = {
    width: 1920, height: 1080,
    availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24,
  };

  const document = {
    cookie: '',
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    documentElement: { clientWidth: 1920, clientHeight: 1080 },
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
      getContext: () => null,
    }),
    createEvent: () => ({ initEvent: () => {} }),
    getElementsByTagName: () => [],
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const location = {
    href: 'https://example.com/',
    origin: 'https://example.com',
    hostname: 'example.com',
    host: 'example.com',
    pathname: '/',
    protocol: 'https:',
    port: '',
    search: '',
    hash: '',
  };

  const makeStorage = () => {
    const data = Object.create(null);
    return {
      getItem: k => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: k => { delete data[k]; },
      clear: () => { for (const k of Object.keys(data)) delete data[k]; },
      key: i => Object.keys(data)[i] ?? null,
      get length() { return Object.keys(data).length; },
    };
  };

  const window = {
    navigator, screen, document, location,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    innerWidth: 1920, innerHeight: 1040,
    outerWidth: 1920, outerHeight: 1080,
    devicePixelRatio: 1,
    performance: { now: () => Date.now(), timing: {}, timeOrigin: Date.now() },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask: queueMicrotask ?? (cb => Promise.resolve().then(cb)),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    crypto: {
      getRandomValues: arr => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    },
  };

  window.self = window;
  window.top = window;
  window.parent = window;
  window.window = window;
  window.globalThis = window;

  return window;
}

function run(source, { timeoutMs = 5000, extraGlobals = {} } = {}) {
  const ctx = vm.createContext({
    ...makeBrowserStubs(),
    ...extraGlobals,
    console,
  });
  const script = new vm.Script(source, { filename: 'payload.js' });
  return script.runInContext(ctx, { timeout: timeoutMs });
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node sandbox/executor.js <file.js>');
    process.exit(1);
  }
  try {
    run(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('payload threw:', e.message);
    process.exit(1);
  }
}

module.exports = { run, makeBrowserStubs };
