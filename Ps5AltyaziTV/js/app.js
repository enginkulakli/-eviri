(function () {
  "use strict";
  var socket = null, hdmiSources = [];
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

  function handleRemote(event) {
    var key = event.key || "";
    var code = event.keyCode || event.which;
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
    } else if (key === "Enter" || key === "Return" || code === 13) {
      var active = document.activeElement;
      if (active && active.tagName === "BUTTON") {
        active.click();
        event.preventDefault();
      }
    } else if (key === "Back" || key === "Escape" || code === 10009 || code === 27) {
      if (!byId("setup").classList.contains("hidden")) {
        byId("setup").classList.add("hidden");
      } else {
        byId("setup").classList.remove("hidden");
        byId("showPanel").focus();
      }
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
        status(hdmiSources.length ? "TVWindow hazır. " + hdmiSources.length + " HDMI girişi bulundu." : "Bağlı HDMI bulunamadı. PS5 açık ve TV'ye bağlı olsun.");
      }, function (error) { status("HDMI girişleri okunamadı: " + error.message); });
    } catch (error) { status("TVWindow başlatma hatası: " + error.message); }
  }

  function startHdmi() {
    var number = Number(byId("hdmiSelect").value);
    var source = hdmiSources.filter(function (item) { return item.number === number; })[0];
    if (!source) { status("Önce geçerli bir HDMI girişi seç."); return; }
    try {
      tizen.tvwindow.setSource(source, function () {
        tizen.tvwindow.show(function () { status("HDMI " + number + " görüntüsü uygulamaya alındı."); },
          function (error) { status("HDMI görüntüsü açılamadı: " + error.message); },
          ["0%", "0%", "100%", "100%"], "MAIN", "BEHIND");
      }, function (error) { status("HDMI kaynağı seçilemedi: " + error.message); }, "MAIN");
    } catch (error) { status("TVWindow hatası: " + error.message); }
  }

  function connectTablet() {
    var ip = byId("tabletIp").value.trim(), port = Number(byId("tabletPort").value) || 8787;
    if (!ip) { connection("Tablet IP adresini gir."); return; }
    if (socket) { try { socket.close(); } catch (_) {} }
    try {
      socket = new WebSocket("ws://" + ip + ":" + port);
      socket.onopen = function () { connection("Tablete bağlandı."); };
      socket.onmessage = function (event) {
        try { var data = JSON.parse(event.data); byId("subtitle").textContent = data.text || ""; } catch (_) {}
      };
      socket.onerror = function () { connection("Bağlantı hatası. Tablet uygulamasını ve portu kontrol et."); };
      socket.onclose = function () { connection("Bağlantı kesildi."); };
      connection("Bağlanıyor…");
    } catch (error) { connection("WebSocket hatası: " + error.message); }
  }

  function init() {
    registerRemoteKeys();
    document.addEventListener("keydown", handleRemote, true);
    byId("startHdmi").addEventListener("click", startHdmi);
    byId("connect").addEventListener("click", connectTablet);
    byId("hidePanel").addEventListener("click", function () { byId("setup").classList.add("hidden"); byId("showPanel").focus(); });
    byId("showPanel").addEventListener("click", function () { byId("setup").classList.remove("hidden"); byId("hdmiSelect").focus(); });
    loadSources();
    window.setTimeout(function () { byId("hdmiSelect").focus(); }, 300);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !hdmiSources.length) loadSources(); });
  window.addEventListener("load", init);
}());
