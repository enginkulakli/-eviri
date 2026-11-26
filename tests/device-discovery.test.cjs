const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHmac, webcrypto } = require("node:crypto");
const test = require("node:test");
const vm = require("node:vm");

const serverId = "fedcba9876543210fedcba9876543210";
const secret = (value, role, seq) => createHmac("sha256", Buffer.from(value, "hex"))
  .update("ps5-discovery-v1|" + role + "|" + seq).digest("hex");

function network({ wrongFirst = false } = {}) {
  const settings = new Map([["tabletIp", "192.168.1.3"]]);
  const statuses = [];
  const contacts = [];
  const connections = [];
  const failures = [];
  let serverAddress = "192.168.1.3", serverKey;
  let timerId = 0, now = 0;
  const timers = new Map();
  const queue = (fn, delay = 0) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; };
  const root = {
    crypto: webcrypto,
    setTimeout: queue,
    clearTimeout: (id) => timers.delete(id),
    tizen: { systeminfo: { getPropertyValue(_name, done) { done({ ipAddress: "192.168.1.2", subnetMask: "255.255.255.248" }); } } },
    WebSocket: function (url) {
      const host = new URL(url).hostname;
      contacts.push(host);
      let closed = false, seq, key;
      const receive = (packet) => queue(() => { if (!closed && this.onmessage) this.onmessage({ data: JSON.stringify(packet) }); });
      this.close = () => { closed = true; };
      this.send = (text) => {
        const msg = JSON.parse(text);
        if (msg.type === "discover") {
          const code = statuses.at(-1).split("Kod ")[1];
          key = msg.pair ? code.replace(/-/g, "").toLowerCase() : serverKey;
          if (wrongFirst || host !== serverAddress) key = "f".repeat(32);
          const nonce = "0".repeat(32);
          seq = [serverId, msg.tvId, msg.nonce, nonce, host, 8787].join("|");
          if (msg.pair) receive({type: "pending"});
          receive({type: "challenge", serverId, nonce, host, port: 8787, proof: secret(key, "server", seq)});
        } else {
          assert.equal(msg.proof, secret(key, "tv", seq));
          serverKey = key;
          receive({type: "accepted", proof: secret(key, "accepted", seq)});
        }
      };
      queue(() => {
        if (!closed && (host === serverAddress || (host === "192.168.1.3" && serverKey))) this.onopen();
        else if (!closed) this.onerror();
      });
    },
  };
  const context = vm.createContext({window: root});
  for (const file of ["vendor/sha256.min.js", "device-discovery.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../Ps5AltyaziTV/js", file), "utf8"), context);
  }
  const start = () => new root.Ps5DeviceDiscovery({
    read: (key) => settings.get(key),
    write: (key, value) => settings.set(key, value),
    status: (value) => statuses.push(value),
    failed: (enroll) => failures.push(enroll),
    connected: (host, port) => connections.push([host, port]),
  });
  const run = () => {
    for (let i = 0; timers.size && i < 100; i++) {
      const [id, {fn, at}] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id);
      now = at;
      fn();
    }
    assert.equal(timers.size, 0);
  };
  return { contacts, connections, failures, start, run, move: (address) => { serverAddress = address; } };
}

test("pairs with mutual proofs, reloads the saved identity, and finds a changed Android address", () => {
  const lan = network();
  const discovery = lan.start();
  assert.equal(discovery.search(false), false);
  assert.equal(discovery.search(true), true);
  lan.run();
  assert.deepEqual(lan.connections, [["192.168.1.3", 8787]]);
  assert.equal(lan.contacts[0], "192.168.1.3");
  assert(lan.contacts.every(host => /^192\.168\.1\.[1-6]$/.test(host)));
  lan.move("192.168.1.5");
  const restarted = lan.start();
  assert.equal(restarted.saved(), true);
  restarted.search(false);
  lan.run();
  assert.deepEqual(lan.connections, [["192.168.1.3", 8787], ["192.168.1.5", 8787]]);
  assert.deepEqual(lan.failures, []);
});

test("rejects a peer without the pairing code and leaves manual connection available", () => {
  const lan = network({ wrongFirst: true });
  const discovery = lan.start();
  discovery.search(true);
  lan.run();
  assert.equal(discovery.saved(), false);
  assert.deepEqual(lan.failures, [true]);
  assert.deepEqual(lan.connections, []);
});
