// Plays one simulated run off the main thread. sim.js starts it and names the scripts to load:
// the same ones the page runs, here with a page that does nothing.

self.window = self;

function stubNode() {
  return {
    hidden: false, textContent: '', innerHTML: '', className: '', title: '', width: 0, height: 0, scrollTop: 0,
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, dataset: {},
    appendChild(child) { return child; }, append() {}, addEventListener() {}, setAttribute() {}, blur() {},
    setPointerCapture() {}, querySelectorAll: () => [], querySelector: () => null,
    getBoundingClientRect: () => ({ width: 960, height: 560 }),
    // A canvas context that accepts any call and any property.
    getContext: () => new Proxy({}, {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: (target, key, value) => { target[key] = value; return true; },
    }),
  };
}

self.document = {
  getElementById: stubNode, createElement: stubNode, addEventListener() {}, querySelectorAll: () => [],
  hidden: false, scripts: [],
};
self.Theme = { palette: () => new Proxy({}, { get: () => '#000' }) };
self.requestAnimationFrame = () => 0;

self.onmessage = e => {
  try {
    importScripts(...e.data.scripts);
    self.postMessage({ result: simRun(e.data.job) });
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err) });
  }
};
