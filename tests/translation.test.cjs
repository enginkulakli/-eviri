const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../Ps5AltyaziTV/js", name), "utf8");

function setup() {
  const callbacks = new Map();
  const nodes = new Map();
  const timers = new Map();
  const sockets = [];
  const hdmi = [];
  let now = 0;
  let timerId = 0;
  const node = (id) => {
    const classes = new Set();
    if (!nodes.has(id)) nodes.set(id, {
      classList: { add: (value) => classes.add(value), remove: (value) => classes.delete(value), contains: (value) => classes.has(value) },
      tagName: id === "tabletIp" || id === "tabletPort" ? "INPUT" : "BUTTON", offsetWidth: 100,
      textContent: "", value: "", style: {}, ownerDocument: document, offsetHeight: 28,
      clientWidth: 1920, clientHeight: 1080, children: [],
      appendChild(child) { this.children.push(child); if (!this.value && child.value) this.value = child.value; },
      removeChild(child) { this.children = this.children.filter((item) => item !== child); },
      addEventListener(event, callback) { callbacks.set(id + ":" + event, callback); },
      focus() { document.activeElement = this; },
      blur() { document.activeElement = null; const event = callbacks.get(id + ":blur"); if (event) event(); },
    });
    return nodes.get(id);
  };
  const document = {
    hidden: false, getElementById: node,
    querySelectorAll: () => (node("setup").classList.contains("hidden") ? [] : ["hdmiSelect", "tabletIp", "tabletPort", "connect"].map(node)),
    createElement: () => ({ textContent: "", style: {}, offsetHeight: 28 }),
    addEventListener: (event, callback) => callbacks.set(event, callback),
  };
  const tizen = {
    systeminfo: { getPropertyValue: (key, receive) => receive({ connected: [{ type: "HDMI", number: 1 }] }) },
    tvwindow: {
      setSource: (source, success) => { hdmi.push(source.number); success(); },
      show: (success, error, region, plane, placement) => { hdmi.push(plane, placement, Array.from(region)); success(); },
    },
  };
  const window = {
    tizen,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem() {}, setItem() {} },
    addEventListener: (event, fn) => callbacks.set(event, fn),
  };
  function WebSocket() {
    this.sent = [];
    this.send = (message) => this.sent.push(JSON.parse(message));
    this.close = () => { this.closed = true; };
    sockets.push(this);
  }
  const context = vm.createContext({ tizen, window, document, WebSocket });
  vm.runInContext(read("text-overlay.js"), context);
  vm.runInContext(read("app.js"), context);
  callbacks.get("load")();
  function advance(ms) {
    const limit = now + ms;
    while (true) {
      const item = [...timers].filter(([, info]) => info.at <= limit).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) break;
      timers.delete(item[0]);
      now = item[1].at;
      item[1].fn();
    }
    now = limit;
  }
  node("tabletIp").value = "192.168.1.10";
  node("tabletPort").value = "8787";
  callbacks.get("connect:click")();
  const socket = sockets[0];
  socket.onopen();
  const receive = (message) => socket.onmessage({ data: JSON.stringify(message) });
  return { node, document, callbacks, advance, socket, receive, hdmi };
}

const block = (id, x, y, ttlMs) => ({ id, x, y, ttlMs, text: "Metin " + id, w: .1, h: .1 });
const message = (blocks, frameWidth = 1280, frameHeight = 720) => ({ type: "overlay", frameWidth, frameHeight, blocks });

test("preserves HDMI behind the web layer and negotiates both refresh and overlays", () => {
  const app = setup();
  app.advance(500);
  assert.deepEqual(app.hdmi, [1, "MAIN", "BEHIND", ["0%", "0%", "100%", "100%"]]);
  assert.deepEqual(app.socket.sent, [
    { type: "hello", subtitleVersion: 2 }, { type: "hello", subtitleVersion: 3 },
  ]);
  app.receive({ text: "Altyazı", ttlMs: 1000 });
  app.advance(600);
  app.receive({ type: "refresh", ttlMs: 1000 });
  app.advance(600);
  assert.equal(app.node("subtitle").textContent, "Altyazı");
  app.advance(400);
  assert.equal(app.node("subtitle").textContent, "");
});

test("tracks independent expiry, replacement, and stale socket messages", () => {
  const app = setup();
  const layer = app.node("textOverlay");
  app.receive(message([block("1", .1, .1, 300), block("2", .4, .7, 1000)]));
  assert.equal(layer.children.length, 2);
  const second = layer.children[1];
  app.advance(310);
  assert.deepEqual(layer.children, [second]);
  app.receive(message([{ ...block("2", .5, .7, 1000), text: "<b>Metin</b>" }]));
  assert.equal(layer.children[0], second);
  assert.equal(second.textContent, "<b>Metin</b>");
  app.receive(message([]));
  assert.equal(layer.children.length, 0);
  app.receive({ text: "Altyazı modu" });
  assert.equal(app.node("subtitle").textContent, "Altyazı modu");
  app.receive(message([block("new", .5, .3, 1000)]));
  app.socket.onclose();
  assert.equal(layer.children.length, 0);
  app.receive(message([block("stale", .5, .3, 1000)]));
  assert.equal(layer.children.length, 0);
});

test("maps source aspect ratio, fits edges, and keeps boxes on a resize", () => {
  const app = setup();
  const layer = app.node("textOverlay");
  app.receive(message([block("4:3", 0, .9, 1800)], 640, 480));
  const first = layer.children[0];
  assert.equal(first.style.left, "240px");
  assert(Number.parseFloat(first.style.top) + first.offsetHeight <= 1080);
  app.node("overlayFit").value = "stretch";
  app.node("subtitleStyle").value = "backplate";
  app.node("subtitleSize").value = "58";
  app.callbacks.get("overlayFit:change")();
  assert.equal(first.style.left, "0px");
  assert.equal(first.className, "text-box backplate");
  layer.clientWidth = 960;
  layer.clientHeight = 540;
  app.callbacks.get("resize")();
  assert(Number.parseFloat(first.style.top) + first.offsetHeight <= 540);
  app.receive(message([block("bad", -1, 0, 1000)]));
  assert.equal(layer.children[0], first);
  app.document.hidden = true;
  app.callbacks.get("visibilitychange")();
  assert.equal(layer.children.length, 0);
});

test("remote shows settings without opening the keyboard and Back closes editing first", () => {
  const app = setup();
  const press = (keyCode) => app.callbacks.get("keydown")({keyCode, preventDefault() {}});
  assert(app.node("showPanel").classList.contains("hidden"));
  press(10009);
  assert.equal(app.document.activeElement, app.node("hdmiSelect"));
  press(40);
  assert.equal(app.document.activeElement, app.node("tabletIp"));
  assert.equal(app.node("tabletIp").readOnly, true);
  press(13);
  assert.equal(app.node("tabletIp").readOnly, false);
  press(40);
  assert.equal(app.document.activeElement, app.node("tabletIp"));
  press(10009);
  assert.equal(app.node("tabletIp").readOnly, true);
  assert.equal(app.node("setup").classList.contains("hidden"), false);
  press(40);
  assert.equal(app.document.activeElement, app.node("tabletPort"));
  assert.equal(app.node("tabletPort").readOnly, true);
  press(10009);
  assert(app.node("setup").classList.contains("hidden"));
});
