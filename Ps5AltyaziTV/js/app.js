(function () {
  "use strict";
  var socket = null, hdmiSources = [], subtitleTimer = null;
  var retryTimer = null, retryDelay = 1000, endpoint = null;
  var editing = null, discovery = null, automatic = false, enrolling = false;
  var userSettings = false, backDown = false, connectionTimer = null, heartbeatTimer = null;
  var heartbeatSupported = false, lastReply = 0;
  var preferences = { subtitleSize: "34", subtitlePosition: "7", subtitleStyle: "outline", overlayFit: "contain" };
  function byId(id) { return document.getElementById(id); }
  function status(message) { byId("platformStatus").textContent = message; }
  function connection(message) { byId("connectionStatus").textContent = message; }

  // Back and the navigation keys are mandatory Samsung remote keys.
  function isBack(event) {
    var code = event.keyCode || event.which;
    return event.key === "Back" || event.key === "Return" || event.key === "Escape" || code === 10009 || code === 27;
  }

  function consume(event) {
    event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
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
      var details = byId("overlayStatus");
      if (details && overlay && overlay.diagnostics) {
        var stats = overlay.diagnostics();
        details.textContent = stats.grid ? "Tam ekran · yoğun sahne düzeni" :
          stats.moved || stats.smaller ? "Tam ekran · " + stats.moved + " kutu kaydırıldı, " + stats.smaller + " kutu küçültüldü." : "";
      }
      panel.classList.remove("hidden");
      button.classList.remove("hidden");
      byId("hdmiSelect").focus();
    } else {
      panel.classList.add("hidden");
      button.classList.add("hidden");
    }
  }

  function toggleSettings(open) {
    userSettings = open;
    showSettings(open);
  }

  function handleRemote(event) {
    var key = event.key || "";
    var code = event.keyCode || event.which;
    if (isBack(event)) {
      consume(event);
      if (backDown || event.repeat) return;
      backDown = true;
      if (editing) {
        var field = editing;
        finishEdit(field);
        field.focus();
      } else toggleSettings(byId("setup").classList.contains("hidden"));
      return;
    }
    var confirm = key === "Enter" || code === 13;
    if (editing) {
      if (confirm || code === 65376 || code === 65385) {
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
    if (retryTimer !== null || (!endpoint && !automatic) || document.hidden || enrolling) return;
    retryTimer = window.setTimeout(function () {
      retryTimer = null;
      if (automatic) searchSavedDevice();
      else openTabletSocket();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  }

  function searchSavedDevice() {
    if (!discovery || !discovery.search(false)) {
      connection("Kayıtlı cihaz aranamadı. IP ve portu elle girebilirsiniz.");
      return false;
    }
    return true;
  }

  function connectionFailed(current, message) {
    if (socket !== current) return;
    closeTabletSocket();
    if (automatic) endpoint = null;
    connection(message);
    retryConnection();
  }

  function openTabletSocket() {
    if (!endpoint || socket) return;
    var current;
    try {
      current = new WebSocket(endpoint);
    } catch (_) {
      connection("WebSocket adresi açılamadı.");
      retryConnection();
      return;
    }
    socket = current;
    connection("Bağlanıyor…");
    connectionTimer = window.setTimeout(function () {
      connectionFailed(current, "Bağlantı zaman aşımına uğradı. Yeniden deneniyor…");
    }, 5000);
    function heartbeat() {
      if (socket !== current) return;
      if (heartbeatSupported && Date.now() - lastReply >= 15000) {
        connectionFailed(current, "Cihaz yanıt vermiyor. Yeniden aranıyor…");
        return;
      }
      try { current.send('{"type":"ping"}'); }
      catch (_) { connectionFailed(current, "Bağlantı kesildi. Yeniden deneniyor…"); return; }
      heartbeatTimer = window.setTimeout(heartbeat, 5000);
    }
    current.onopen = function () {
      if (socket !== current) return;
      window.clearTimeout(connectionTimer);
      retryDelay = 1000;
      connection("Cihaza bağlandı.");
      if (!userSettings) showSettings(false);
      try {
        current.send('{"type":"hello","subtitleVersion":2}');
        current.send('{"type":"hello","subtitleVersion":3}');
      } catch (_) { connectionFailed(current, "Bağlantı kesildi. Yeniden deneniyor…"); return; }
      heartbeatTimer = window.setTimeout(heartbeat, 5000);
    };
    current.onmessage = function (event) {
      if (socket !== current || document.hidden) return;
      try {
        var data = JSON.parse(event.data);
        if (data && data.type === "pong") heartbeatSupported = true;
        lastReply = Date.now();
        handleSubtitle(data);
      } catch (_) {}
    };
    current.onerror = current.onclose = function () {
      connectionFailed(current, "Bağlantı kesildi. Yeniden deneniyor…");
    };
  }

  function closeTabletSocket() {
    window.clearTimeout(retryTimer);
    window.clearTimeout(connectionTimer);
    window.clearTimeout(heartbeatTimer);
    retryTimer = null;
    heartbeatSupported = false;
    lastReply = 0;
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

  function connectTablet(manual) {
    var ip = byId("tabletIp").value.trim(), port = Number(byId("tabletPort").value.trim() || "8787");
    var parts = ip.split(".");
    if (parts.length !== 4 || !parts.every(function (part) { return /^\d{1,3}$/.test(part) && Number(part) <= 255; })) {
      connection("Geçerli bir tablet IPv4 adresi gir.");
      return;
    }
    if (port < 1024 || port > 65535 || port % 1 !== 0) { connection("Port 1024–65535 arasında olmalı."); return; }
    if (manual) {
      automatic = !!(discovery && discovery.saved());
      enrolling = false;
      if (discovery) discovery.stop();
      byId("discoveryStatus").textContent = "";
    }
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
    document.addEventListener("keydown", handleRemote, true);
    document.addEventListener("keyup", function (event) {
      if (isBack(event)) { backDown = false; consume(event); }
    }, true);
    byId("startHdmi").addEventListener("click", startHdmi);
    byId("connect").addEventListener("click", function () { connectTablet(true); });
    if (window.Ps5DeviceDiscovery) {
      discovery = new window.Ps5DeviceDiscovery({
        read: function (key) { return readPreference(key, ""); },
        write: savePreference,
        status: function (message) { byId("discoveryStatus").textContent = message; },
        failed: function () {
          enrolling = false;
          if (automatic && !socket) {
            connection("Kayıtlı cihaz bulunamadı. Sunucuyu kontrol edin veya IP ve portu elle girin.");
            retryConnection();
          }
        },
        connected: function (ip, port) {
          automatic = true;
          enrolling = false;
          byId("discoveryStatus").textContent = "Cihaz eşleştirildi.";
          byId("tabletIp").value = ip;
          byId("tabletPort").value = String(port);
          connectTablet(false);
        }
      });
      byId("discoverDevice").addEventListener("click", function () {
        if (discovery.saved()) {
          automatic = true;
          closeTabletSocket();
          endpoint = null;
          searchSavedDevice();
        } else beginPairing();
      });
      var pairButton = byId("pairDevice");
      if (pairButton) pairButton.addEventListener("click", beginPairing);
      function beginPairing() {
        window.clearTimeout(retryTimer);
        retryTimer = null;
        enrolling = true;
        if (!discovery.search(true)) {
          enrolling = false;
          if (automatic && !socket) retryConnection();
        }
      }
    }
    byId("hidePanel").addEventListener("click", function () { toggleSettings(false); });
    byId("showPanel").addEventListener("click", function () { toggleSettings(true); });
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
    }
    automatic = !!(discovery && discovery.saved());
    if (automatic) searchSavedDevice();
    else if (savedIp) connectTablet(false);
    applyAppearance();
    loadSources();
    window.setTimeout(function () { if (!byId("setup").classList.contains("hidden")) byId("hdmiSelect").focus(); }, 300);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      backDown = false;
      enrolling = false;
      if (discovery) discovery.stop();
      closeTabletSocket();
      return;
    }
    if (!hdmiSources.length) loadSources();
    if (automatic) searchSavedDevice();
    else openTabletSocket();
  });
  window.addEventListener("load", init);
}());
