(function () {
  "use strict";
  var socket = null, hdmiSources = [], subtitleTimer = null;
  var retryTimer = null, retryDelay = 1000, endpoint = null;
  var editing = null;
  var preferences = { subtitleSize: "34", subtitlePosition: "7", subtitleStyle: "outline", overlayFit: "contain" };
  function byId(id) { return document.getElementById(id); }
  function status(message) { byId("platformStatus").textContent = message; }
  function connection(message) { byId("connectionStatus").textContent = message; }

  function registerRemoteKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        ["Return", "Exit"].forEach(function (key) {
          try { tizen.tvinputdevice.registerKey(key); } catch (_) {}
        });
      }
    } catch (_) {}
  }

  function focusableItems() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '#setup button, #setup input, #setup select, #showPanel'
    )).filter(function (el) {
      return el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled;
    });
  }

  function finishEdit(input) {
    if (editing !== input) return;
    editing = null;
    input.readOnly = true;
    input.blur();
  }

  function showSettings(open) {
    var panel = byId("setup"), button = byId("showPanel");
    if (editing) finishEdit(editing);
    if (open) {
      panel.classList.remove("hidden");
      button.classList.remove("hidden");
      byId("hdmiSelect").focus();
    } else {
      panel.classList.add("hidden");
      button.classList.add("hidden");
    }
  }

  function handleRemote(event) {
    var key = event.key || "";
    var code = event.keyCode || event.which;
    var back = key === "Back" || key === "Escape" || code === 10009 || code === 27;
    var confirm = key === "Enter" || code === 13;
    if (editing) {
      if (back || confirm || code === 65376 || code === 65385) {
        var input = editing;
        finishEdit(input);
        input.focus();
        event.preventDefault();
      }
      return;
    }
    // Use left and right to change a selection and up and down to move focus.
    if (document.activeElement && document.activeElement.tagName === "SELECT" && (code === 37 || code === 39)) {
      var select = document.activeElement;
      if (!select.options.length) return;
      select.selectedIndex = (select.selectedIndex + (code === 39 ? 1 : -1) + select.options.length) % select.options.length;
      var change = document.createEvent("Event");
      change.initEvent("change", true, false);
      select.dispatchEvent(change);
      event.preventDefault();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowRight" || code === 40 || code === 39) {
      var items = focusableItems();
      if (!items.length) return;
      var index = items.indexOf(document.activeElement);
      items[(index + 1 + items.length) % items.length].focus();
      event.preventDefault();
    } else if (key === "ArrowUp" || key === "ArrowLeft" || code === 38 || code === 37) {
      var itemsUp = focusableItems();
      if (!itemsUp.length) return;
      var indexUp = itemsUp.indexOf(document.activeElement);
      if (indexUp < 0) indexUp = 0;
      itemsUp[(indexUp - 1 + itemsUp.length) % itemsUp.length].focus();
      event.preventDefault();
    } else if (confirm) {
      var active = document.activeElement;
      if (active && active.tagName === "BUTTON") {
        active.click();
        event.preventDefault();
      } else if (active && (active === byId("tabletIp") || active === byId("tabletPort"))) {
        active.blur();
        editing = active;
        active.readOnly = false;
        active.focus();
        event.preventDefault();
      }
    } else if (back || key === "Return") {
      showSettings(byId("setup").classList.contains("hidden"));
      event.preventDefault();
    }
  }

  function loadSources() {
    if (!window.tizen || !tizen.systeminfo || !tizen.tvwindow) { status("Bu TV'de Samsung TVWindow API bulunamadı."); return; }
    try {
      tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
        hdmiSources = (info.connected || []).filter(function (source) { return source.type === "HDMI"; });
        var select = byId("hdmiSelect"); select.innerHTML = "";
        hdmiSources.forEach(function (source) {
          var option = document.createElement("option"); option.value = String(source.number);
          option.textContent = "HDMI " + source.number; select.appendChild(option);
        });
        if (hdmiSources.length) window.setTimeout(startHdmi, 500);
        status(hdmiSources.length ? "TVWindow hazır. " + hdmiSources.length + " HDMI girişi bulundu." : "Bağlı HDMI bulunamadı. PS5 açık ve TV'ye bağlı olsun.");
      }, function (error) { status("HDMI girişleri okunamadı: " + error.message); });
    } catch (error) { status("TVWindow başlatma hatası: " + error.message); }
  }

  function startHdmi() {
    var number = Number(byId("hdmiSelect").value);
    var source = hdmiSources.filter(function (item) { return item.number === number; })[0];
    if (!source) { status("Önce geçerli bir HDMI girişi seç."); return; }
    try {
      status("HDMI " + number + " seçiliyor…");
      tizen.tvwindow.setSource(source, function () {
        status("HDMI görüntü katmanı açılıyor…");
        tizen.tvwindow.show(function () { status("HDMI " + number + " görüntüsü uygulamaya alındı."); },
          function (error) { status("HDMI görüntüsü açılamadı: " + error.message); },
          ["0%", "0%", "100%", "100%"], "MAIN", "BEHIND");
      }, function (error) { status("HDMI kaynağı seçilemedi: " + error.message); }, "MAIN");
    } catch (error) { status("TVWindow hatası: " + error.message); }
  }

  function clearSubtitle() {
    window.clearTimeout(subtitleTimer);
    subtitleTimer = null;
    byId("subtitle").textContent = "";
  }

  function handleSubtitle(data) {
    if (!data) return;
    if (data.type === "overlay") {
      if (overlay.update(data)) clearSubtitle();
      return;
    }
    if (data.type === "refresh") {
      if (!byId("subtitle").textContent) return;
    } else {
      if (typeof data.text !== "string") return;
      if (!data.text) { clearSubtitle(); return; }
      byId("subtitle").textContent = data.text;
    }
    var ttl = typeof data.ttlMs === "number" && isFinite(data.ttlMs)
      ? Math.max(1, Math.min(15000, data.ttlMs)) : 2000;
    window.clearTimeout(subtitleTimer);
    subtitleTimer = window.setTimeout(clearSubtitle, ttl);
  }

  function retryConnection() {
    if (retryTimer !== null || !endpoint || document.hidden) return;
    retryTimer = window.setTimeout(function () {
      retryTimer = null;
      openTabletSocket();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  }

  function openTabletSocket() {
    if (!endpoint || socket) return;
    var current;
    try {
      current = new WebSocket(endpoint);
    } catch (_) {
      connection("WebSocket adresi açılamadı.");
      return;
    }
    socket = current;
    connection("Bağlanıyor…");
    current.onopen = function () {
      if (socket !== current) return;
      retryDelay = 1000;
      connection("Cihaza bağlandı.");
      showSettings(false);
      // Legacy tablet servers ignore incoming messages.
      current.send('{"type":"hello","subtitleVersion":2}');
      current.send('{"type":"hello","subtitleVersion":3}');
    };
    current.onmessage = function (event) {
      if (socket !== current || document.hidden) return;
      try { handleSubtitle(JSON.parse(event.data)); } catch (_) {}
    };
    current.onerror = function () {
      if (socket !== current) return;
      clearSubtitle();
      overlay.clear();
      connection("Bağlantı hatası. Tablet uygulamasını ve portu kontrol et.");
      try { current.close(); } catch (_) {}
    };
    current.onclose = function () {
      if (socket !== current) return;
      socket = null;
      clearSubtitle();
      overlay.clear();
      connection("Bağlantı kesildi. Yeniden bağlanılıyor…");
      retryConnection();
    };
  }

  function closeTabletSocket() {
    window.clearTimeout(retryTimer);
    retryTimer = null;
    var previous = socket;
    socket = null;
    if (previous) { try { previous.close(); } catch (_) {} }
    clearSubtitle();
    overlay.clear();
  }

  function savePreference(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  function readPreference(key, fallback) {
    try { return window.localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }

  function connectTablet() {
    var ip = byId("tabletIp").value.trim(), port = Number(byId("tabletPort").value.trim() || "8787");
    var parts = ip.split(".");
    if (parts.length !== 4 || !parts.every(function (part) { return /^\d{1,3}$/.test(part) && Number(part) <= 255; })) {
      connection("Geçerli bir tablet IPv4 adresi gir.");
      return;
    }
    if (port < 1024 || port > 65535 || port % 1 !== 0) { connection("Port 1024–65535 arasında olmalı."); return; }
    savePreference("tabletIp", ip);
    savePreference("tabletPort", String(port));
    closeTabletSocket();
    endpoint = "ws://" + parts.map(Number).join(".") + ":" + port;
    retryDelay = 1000;
    openTabletSocket();
  }

  function applyAppearance() {
    var subtitle = byId("subtitle");
    subtitle.style.fontSize = byId("subtitleSize").value + "px";
    subtitle.style.bottom = byId("subtitlePosition").value + "%";
    subtitle.className = byId("subtitleStyle").value;
    overlay.appearance(Number(byId("subtitleSize").value), byId("subtitleStyle").value, byId("overlayFit").value);
  }

  var overlay;

  function init() {
    overlay = new window.Ps5TextOverlay(byId("textOverlay"), window);
    window.addEventListener("resize", function () { overlay.layout(); });
    registerRemoteKeys();
    document.addEventListener("keydown", handleRemote, true);
    byId("startHdmi").addEventListener("click", startHdmi);
    byId("connect").addEventListener("click", connectTablet);
    byId("hidePanel").addEventListener("click", function () { showSettings(false); });
    byId("showPanel").addEventListener("click", function () { showSettings(true); });
    ["tabletIp", "tabletPort"].forEach(function (id) {
      var input = byId(id);
      input.readOnly = true;
      input.addEventListener("blur", function () { if (editing === input) { editing = null; input.readOnly = true; } });
    });
    Object.keys(preferences).forEach(function (key) {
      var select = byId(key);
      select.value = readPreference(key, preferences[key]);
      if (!select.value) select.value = preferences[key];
      select.addEventListener("change", function () {
        savePreference(key, select.value);
        applyAppearance();
      });
    });
    var savedIp = readPreference("tabletIp", "");
    if (savedIp) {
      byId("tabletIp").value = savedIp;
      byId("tabletPort").value = readPreference("tabletPort", "8787");
      connectTablet();
    }
    applyAppearance();
    loadSources();
    window.setTimeout(function () { if (!byId("setup").classList.contains("hidden")) byId("hdmiSelect").focus(); }, 300);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { closeTabletSocket(); return; }
    if (!hdmiSources.length) loadSources();
    openTabletSocket();
  });
  window.addEventListener("load", init);
}());
