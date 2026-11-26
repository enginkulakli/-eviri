(function (root) {
  "use strict";
  var ID = /^[0-9a-f]{32}$/;
  var PROOF = /^[0-9a-f]{64}$/;

  function randomId() {
    var bytes = root.crypto.getRandomValues(new Uint8Array(16));
    return Array.prototype.map.call(bytes, function (value) { return ("0" + value.toString(16)).slice(-2); }).join("");
  }

  function numberIp(value) {
    var parts = String(value || "").split(".");
    if (parts.length !== 4 || !parts.every(function (item) { return /^(0|[1-9][0-9]{0,2})$/.test(item) && Number(item) < 256; })) return null;
    return parts.reduce(function (sum, item) { return sum * 256 + Number(item); }, 0);
  }

  function privateIp(value) {
    return value !== null && ((value >>> 24) === 10 || (value >>> 20) === 0xac1 ||
      (value >>> 16) === 0xc0a8 || (value >>> 16) === 0xa9fe);
  }

  function targets(ip, mask, previous) {
    var address = numberIp(ip), netmask = numberIp(mask);
    if (!privateIp(address) || netmask === null) return [];
    var hosts = (~netmask) >>> 0;
    if (hosts < 3 || (hosts & (hosts + 1)) !== 0) return [];
    // Bound even very wide network masks to the TV's local /24.
    var range = Math.min(hosts, 255);
    var network = (address & ~range) >>> 0;
    var output = [], preferred = numberIp(previous);
    var realNetwork = (address & netmask) >>> 0;
    if (privateIp(preferred) && preferred !== address && preferred > realNetwork && preferred < realNetwork + hosts) output.push(previous);
    for (var value = network + 1; value < network + range; value++) {
      if (value !== address && value !== preferred) {
        output.push([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join("."));
      }
    }
    return output;
  }

  function keyBytes(key) {
    return key.match(/../g).map(function (byte) { return parseInt(byte, 16); });
  }

  function sign(key, role, exchange) { return root.sha256.hmac(keyBytes(key), "ps5-discovery-v1|" + role + "|" + exchange); }
  function matches(proof, expected) {
    if (typeof proof !== "string" || !PROOF.test(proof)) return false;
    var different = 0;
    for (var i = 0; i < proof.length; i++) different |= proof.charCodeAt(i) ^ expected.charCodeAt(i);
    return different === 0;
  }

  function readNetwork(done) {
    var system = root.tizen && root.tizen.systeminfo;
    if (!system) return done(null);
    var kinds = ["ETHERNET_NETWORK", "WIFI_NETWORK"];
    function next() {
      if (!kinds.length) return done(null);
      try {
        system.getPropertyValue(kinds.shift(), function (value) {
          if (value && privateIp(numberIp(value.ipAddress)) && numberIp(value.subnetMask) !== null) done(value);
          else next();
        }, next);
      } catch (_) { next(); }
    }
    next();
  }

  root.Ps5DeviceDiscovery = function (options) {
    var active = null;
    var saved = null;
    var deviceId = null;
    try {
      saved = JSON.parse(options.read("deviceDiscoveryPair") || "null");
      if (!saved || typeof saved.serverId !== "string" || !ID.test(saved.serverId) ||
          typeof saved.key !== "string" || !ID.test(saved.key)) saved = null;
      deviceId = options.read("deviceDiscoveryId");
    } catch (_) {}
    function stop() {
      var previous = active;
      active = null;
      if (previous) previous.probes.slice().forEach(function (probe) { probe(); });
    }
    this.saved = function () { return Boolean(saved); };
    this.stop = stop;
    this.search = function (enroll) {
      stop();
      if (!enroll && !saved) return false;
      if (!root.crypto || !root.crypto.getRandomValues || !root.sha256 || !root.sha256.hmac) {
        options.status("Güvenli keşif bu TV’de kullanılamıyor. IP ve portu elle girin.");
        return false;
      }
      if (!ID.test(deviceId || "")) {
        deviceId = randomId();
        options.write("deviceDiscoveryId", deviceId);
      }
      var key = enroll ? randomId() : saved.key;
      var run = { probes: [], pending: 0, next: 0 };
      active = run;
      var code = enroll ? key.match(/.{1,4}/g).join("-").toUpperCase() : "";
      options.status(enroll ? "TV " + deviceId.slice(0, 6).toUpperCase() + " · Kod " + code : "Eşleştirilmiş cihaz aranıyor…");
      readNetwork(function (network) {
        if (active !== run) return;
        var ips = network ? targets(network.ipAddress, network.subnetMask, options.read("tabletIp")) : [];
        function pump() {
          if (run !== active) return;
          while (run.pending < 24 && run.next < ips.length && run === active) probe(ips[run.next++]);
          if (run.pending === 0 && run === active) {
            stop();
            options.status("Otomatik bağlantı bulunamadı. Çeviri sunucusunu kontrol edin veya IP ve portu elle girin.");
            options.failed(enroll);
          }
        }
        function probe(ip) {
          var socket;
          try { socket = new root.WebSocket("ws://" + ip + ":8790/ps5-discovery"); } catch (_) { return; }
          run.pending++;
          var nonce = randomId(), exchange = "", host = null, port = null, serverId = null;
          var timer = null, complete = false;
          function finish() {
            if (complete) return;
            complete = true;
            root.clearTimeout(timer);
            run.pending--;
            run.probes.splice(run.probes.indexOf(finish), 1);
            socket.onclose = socket.onerror = socket.onmessage = socket.onopen = null;
            try { socket.close(); } catch (_) {}
            if (active === run) root.setTimeout(pump, 0);
          }
          run.probes.push(finish);
          timer = root.setTimeout(finish, 750);
          socket.onclose = socket.onerror = finish;
          socket.onopen = function () {
            if (run !== active) return finish();
            socket.send(JSON.stringify({ type: "discover", version: 1, tvId: deviceId, nonce: nonce, pair: enroll }));
          };
          socket.onmessage = function (event) {
            if (run !== active || typeof event.data !== "string" || event.data.length > 1024) return finish();
            var message;
            try { message = JSON.parse(event.data); } catch (_) { return finish(); }
            if (!message) return finish();
            if (enroll && message.type === "pending" && !exchange) {
              root.clearTimeout(timer);
              timer = root.setTimeout(finish, 70000);
              return;
            }
            if (message.type === "challenge" && !exchange) {
              serverId = message.serverId;
              host = message.host;
              port = message.port;
              if (typeof serverId !== "string" || !ID.test(serverId) ||
                  typeof message.nonce !== "string" || !ID.test(message.nonce) || host !== ip ||
                  (!enroll && serverId !== saved.serverId) || typeof port !== "number" ||
                  port % 1 !== 0 || port < 1024 || port > 65535) return finish();
              exchange = [serverId, deviceId, nonce, message.nonce, host, port].join("|");
              if (!matches(message.proof, sign(key, "server", exchange))) return finish();
              socket.send(JSON.stringify({ type: "authenticate", proof: sign(key, "tv", exchange) }));
              return;
            }
            if (message.type === "accepted" && exchange && matches(message.proof, sign(key, "accepted", exchange))) {
              if (enroll) {
                saved = { serverId: serverId, key: key };
                options.write("deviceDiscoveryPair", JSON.stringify(saved));
              }
              stop();
              options.connected(host, port);
            } else finish();
          };
        }
        pump();
      });
      return true;
    };
  };
}(window));
