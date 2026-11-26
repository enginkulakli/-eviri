const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../Ps5AltyaziTV/js", name), "utf8");

function setup({ paired = false, autoManual = true } = {}) {
  const callbacks = new Map();
  const nodes = new Map();
  const timers = new Map();
  const sockets = [];
  const hdmi = [];
  const preferences = new Map(paired ? [["tabletIp", "192.168.1.15"], ["tabletPort", "8787"], ["deviceDiscoveryAuto", "0"]] : []);
  const searches = [];
  let found = null;
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
    localStorage: { getItem: (key) => preferences.get(key), setItem: (key, value) => preferences.set(key, value) },
    addEventListener: (event, fn) => callbacks.set(event, fn),
  };
  if (paired) window.Ps5DeviceDiscovery = function (options) {
    this.saved = () => true;
    this.stop = () => {};
    this.search = (enroll) => { searches.push(enroll); found = options.connected; return true; };
  };
  function WebSocket(url) {
    this.url = url;
    this.sent = [];
    this.send = (message) => this.sent.push(JSON.parse(message));
    this.close = () => { this.closed = true; };
    sockets.push(this);
  }
  const context = vm.createContext({ tizen, window, document, WebSocket, Date: {now: () => now} });
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
  if (autoManual) {
    node("tabletIp").value = "192.168.1.10";
    node("tabletPort").value = "8787";
    callbacks.get("connect:click")();
    sockets[0].onopen();
  }
  const socket = sockets[0];
  const receive = (message, target = socket) => target.onmessage({ data: JSON.stringify(message) });
  return { node, document, callbacks, advance, socket, sockets, receive, hdmi, preferences, searches,
    authenticate: (ip, port) => found(ip, port) };
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
  const press = (keyCode) => {
    const event = {keyCode, preventDefault() {}};
    app.callbacks.get("keydown")(event);
    app.callbacks.get("keyup")(event);
  };
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

test("relayout uses real element height and avoids overlapping phone captions", () => {
  const app = setup();
  const layer = app.node("textOverlay");
  app.receive(message([block("a", .35, .4, 800), block("b", .36, .41, 1200)]));
  const [a, b] = layer.children;
  assert.equal(a.style.visibility, "visible");
  assert.equal(b.style.visibility, "visible");
  const topA = parseFloat(a.style.top), topB = parseFloat(b.style.top);
  assert(topB >= topA + a.offsetHeight || topA >= topB + b.offsetHeight);
  app.receive(message([block("a", .35, .4, 1200), block("b", .36, .41, 1200)]));
  assert.equal(layer.children[0], a);
  assert.equal(layer.children[1], b);
  assert.equal(parseFloat(b.style.top), topB);
});

test("held Back is consumed once and a reconnect leaves explicitly opened settings visible", () => {
  const app = setup();
  let consumed = 0;
  const key = {keyCode: 10009, preventDefault() {}, stopImmediatePropagation() { consumed++; }};
  app.socket.onerror();
  app.callbacks.get("keydown")(key);
  app.callbacks.get("keydown")({...key, repeat: true});
  app.callbacks.get("keydown")(key);
  assert.equal(app.node("setup").classList.contains("hidden"), false);
  assert.equal(consumed, 3);
  app.advance(1000);
  const replacement = app.sockets[1];
  replacement.onopen();
  assert.equal(app.node("setup").classList.contains("hidden"), false);
  app.callbacks.get("keyup")(key);
  app.callbacks.get("keydown")(key);
  assert.equal(app.node("setup").classList.contains("hidden"), true);
});

test("dense translations stay visible and have non-intersecting rectangles", () => {
  const app = setup();
  const layer = app.node("textOverlay");
  app.receive(message(Array.from({length: 6}, (_, i) => ({ ...block(String(i), .35, .4, 1500), text: "Görünen ileti " + i }))));
  assert.equal(layer.children.length, 6);
  const bounds = layer.children.map(box => {
    assert.equal(box.style.visibility, "visible");
    return {x: parseFloat(box.style.left), y: parseFloat(box.style.top), w: parseFloat(box.style.width), h: box.offsetHeight};
  });
  bounds.forEach((a, i) => bounds.slice(i + 1).forEach(b => {
    assert(a.x + a.w <= b.x + .01 || b.x + b.w <= a.x + .01 || a.y + a.h <= b.y + .01 || b.y + b.h <= a.y + .01);
  }));
});

test("migrates the old manual flag, retries authenticated discovery and saves the new IP", () => {
  const app = setup({paired: true, autoManual: false});
  assert.deepEqual(app.searches, [false]);
  assert.equal(app.sockets.length, 0);
  app.authenticate("192.168.1.20", 8787);
  assert.equal(app.sockets[0].url, "ws://192.168.1.20:8787");
  app.sockets[0].onopen();
  app.sockets[0].onclose();
  app.advance(1000);
  assert.deepEqual(app.searches, [false, false]);
  assert.equal(app.sockets.length, 1);
  app.authenticate("192.168.1.25", 9100);
  assert.equal(app.sockets[1].url, "ws://192.168.1.25:9100");
  assert.equal(app.preferences.get("tabletIp"), "192.168.1.25");
  assert.equal(app.preferences.get("tabletPort"), "9100");
  app.callbacks.get("connect:click")();
  app.advance(6000);
  assert.deepEqual(app.searches, [false, false, false]);
});

test("a half-open connection with negotiated pong returns to discovery", () => {
  const app = setup({paired: true, autoManual: false});
  app.authenticate("192.168.1.20", 8787);
  const live = app.sockets[0];
  live.onopen();
  app.advance(5000);
  assert.equal(live.sent.at(-1).type, "ping");
  app.receive({type: "pong"}, live);
  app.advance(16000);
  assert(live.closed);
  assert.deepEqual(app.searches, [false, false]);
});
