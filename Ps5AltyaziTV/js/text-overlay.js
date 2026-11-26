/* global window */
(function (root) {
  "use strict";
  function number(value) { return typeof value === "number" && isFinite(value); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  root.Ps5TextOverlay = function (layer, clock) {
    var boxes = Object.create(null);
    var frameWidth = 16, frameHeight = 9;
    var size = 34, style = "outline", fit = "contain";

    function remove(id) {
      var box = boxes[id];
      if (!box) return;
      clock.clearTimeout(box.timer);
      layer.removeChild(box.element);
      delete boxes[id];
    }

    function layoutBox(box, area) {
      var element = box.element, bounds = box.bounds;
      var fontSize = Math.max(16, size * 0.72);
      var readableWidth = Math.max(5, Math.min(24, element.textContent.length)) * fontSize * 0.55 + fontSize;
      var width = Math.min(area.w, Math.max(bounds.w * area.w, readableWidth));
      var centerX = area.x + (bounds.x + bounds.w / 2) * area.w;
      var top = area.y + bounds.y * area.h;
      element.className = "text-box " + style;
      element.style.fontSize = fontSize + "px";
      element.style.width = width + "px";
      element.style.maxHeight = area.h + "px";
      element.style.left = clamp(centerX - width / 2, area.x, area.x + area.w - width) + "px";
      var height = element.offsetHeight;
      return { element: element, x: parseFloat(element.style.left), y: clamp(top, area.y, area.y + area.h - height),
        w: width, h: height };
    }

    function videoArea() {
      var width = layer.clientWidth, height = layer.clientHeight;
      var w = width, h = height;
      if (fit === "contain") {
        var scale = Math.min(width / frameWidth, height / frameHeight);
        w = frameWidth * scale;
        h = frameHeight * scale;
      }
      return {x: (width - w) / 2, y: (height - h) / 2, w: w, h: h};
    }

    function layout() {
      var area = videoArea(), placed = [];
      if (!area.w || !area.h) return;
      Object.keys(boxes).sort(function (a, b) {
        var first = boxes[a].bounds, second = boxes[b].bounds;
        return Number(second.text.length > 60) - Number(first.text.length > 60) ||
          first.y - second.y || first.x - second.x || (a < b ? -1 : 1);
      }).forEach(function (id) {
        var rect = layoutBox(boxes[id], area), best = null;
        var candidates = [rect.y], gap = 2;
        placed.forEach(function (other) {
          if (other.x < rect.x + rect.w + gap && other.x + other.w + gap > rect.x) {
            candidates.push(other.y - rect.h - gap, other.y + other.h + gap);
          }
        });
        candidates.sort(function (a, b) { return Math.abs(a - rect.y) - Math.abs(b - rect.y); });
        for (var i = 0; i < candidates.length; i++) {
          var y = candidates[i];
          if (Math.abs(y - rect.y) > area.h * .04 || y < area.y || y + rect.h > area.y + area.h + .01) continue;
          var blocked = placed.some(function (other) {
            return rect.x < other.x + other.w + gap && rect.x + rect.w + gap > other.x &&
              y < other.y + other.h + gap - .01 && y + rect.h + gap > other.y + .01;
          });
          if (!blocked) { best = y; break; }
        }
        rect.element.style.visibility = best === null ? "hidden" : "visible";
        if (best !== null) {
          rect.y = best;
          rect.element.style.top = best + "px";
          placed.push(rect);
        }
      });
    }

    function valid(block) {
      return block && typeof block.id === "string" && block.id.length <= 40 &&
        typeof block.text === "string" && block.text.length > 0 && block.text.length <= 1200 &&
        number(block.x) && number(block.y) && number(block.w) && number(block.h) && number(block.ttlMs) &&
        block.x >= 0 && block.y >= 0 && block.w > 0 && block.h > 0 &&
        block.x + block.w <= 1.000001 && block.y + block.h <= 1.000001 && block.ttlMs > 0;
    }

    this.update = function (message) {
      if (!Array.isArray(message.blocks) || message.blocks.length > 24 ||
          !number(message.frameWidth) || !number(message.frameHeight) ||
          message.frameWidth <= 0 || message.frameHeight <= 0 || !message.blocks.every(valid)) return false;
      var resized = frameWidth !== message.frameWidth || frameHeight !== message.frameHeight;
      frameWidth = message.frameWidth;
      frameHeight = message.frameHeight;
      var seen = Object.create(null), needsLayout = resized;
      message.blocks.forEach(function (block) {
        var box = boxes[block.id];
        var changed = !box || resized || box.bounds.x !== block.x || box.bounds.y !== block.y ||
          box.bounds.w !== block.w || box.bounds.h !== block.h;
        if (!box) {
          box = {element: layer.ownerDocument.createElement("div"), timer: null};
          boxes[block.id] = box;
          layer.appendChild(box.element);
        }
        if (box.element.textContent !== block.text) {
          box.element.textContent = block.text;
          changed = true;
        }
        box.bounds = block;
        if (changed) needsLayout = true;
        seen[block.id] = true;
        clock.clearTimeout(box.timer);
        box.timer = clock.setTimeout(function () { remove(block.id); layout(); }, clamp(block.ttlMs, 1, 15000));
      });
      Object.keys(boxes).forEach(function (id) { if (!seen[id]) { remove(id); needsLayout = true; } });
      if (needsLayout) layout();
      return message.blocks.length > 0;
    };
    this.appearance = function (fontSize, appearance, mode) {
      size = fontSize || 34;
      style = appearance;
      fit = mode;
      layout();
    };
    this.layout = layout;
    this.clear = function () { Object.keys(boxes).forEach(remove); };
  };
}(window));
