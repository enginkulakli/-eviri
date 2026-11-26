/* global window */
(function (root) {
  "use strict";
  function number(value) { return typeof value === "number" && isFinite(value); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  root.Ps5TextOverlay = function (layer, clock) {
    var boxes = Object.create(null);
    var frameWidth = 16, frameHeight = 9;
    var size = 34, style = "outline", fit = "contain";
    var counts = { moved: 0, smaller: 0, grid: false };

    function remove(id) {
      var box = boxes[id];
      if (!box) return;
      clock.clearTimeout(box.timer);
      layer.removeChild(box.element);
      delete boxes[id];
    }

    function measure(box, area, fontSize, widthHint) {
      var element = box.element, bounds = box.bounds;
      var readableWidth = Math.max(5, Math.min(24, element.textContent.length)) * fontSize * 0.55 + fontSize;
      var width = Math.min(area.w, Math.max(widthHint, readableWidth));
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

    function position(rect, area, placed, nearby) {
      var gap = 2;
      var xs = [rect.x], ys = [rect.y];
      placed.forEach(function (other) {
        if (!nearby) xs.push(other.x - rect.w - gap, other.x + other.w + gap);
        if (!nearby || (other.x < rect.x + rect.w + gap && other.x + other.w + gap > rect.x)) {
          ys.push(other.y - rect.h - gap, other.y + other.h + gap);
        }
      });
      if (!nearby) {
        xs.push(area.x, area.x + area.w - rect.w);
        ys.push(area.y, area.y + area.h - rect.h);
      }
      var best = null, score = Infinity;
      xs.forEach(function (x) {
        if (x < area.x - .01 || x + rect.w > area.x + area.w + .01) return;
        ys.forEach(function (y) {
          if ((nearby && Math.abs(y - rect.y) > area.h * .04) || y < area.y - .01 || y + rect.h > area.y + area.h + .01) return;
          var distance = Math.abs(y - rect.y) + Math.abs(x - rect.x) * 1.3;
          if (distance >= score) return;
          var blocked = placed.some(function (other) {
            return x < other.x + other.w + gap - .01 && x + rect.w + gap > other.x + .01 &&
              y < other.y + other.h + gap - .01 && y + rect.h + gap > other.y + .01;
          });
          if (!blocked) { best = { x: x, y: y }; score = distance; }
        });
      });
      return best;
    }

    function layout() {
      var area = videoArea(), placed = [];
      counts = { moved: 0, smaller: 0, grid: false };
      if (!area.w || !area.h) return;
      var ids = Object.keys(boxes).sort(function (a, b) {
        var first = boxes[a].bounds, second = boxes[b].bounds;
        return Number(second.text.length > 60) - Number(first.text.length > 60) ||
          first.y - second.y || first.x - second.x || (a < b ? -1 : 1);
      });
      var font = Math.max(16, size * .72), small = Math.max(14, font * .80);
      for (var i = 0; i < ids.length; i++) {
        var box = boxes[ids[i]], width = box.bounds.w * area.w;
        var rect = measure(box, area, font, width);
        var best = position(rect, area, placed, true);
        if (!best) {
          var wide = box.bounds.text.length > 60 ? Math.max(width, area.w * .24) : width * .85;
          rect = measure(box, area, small, wide);
          best = position(rect, area, placed, true) || position(rect, area, placed, false);
          if (!best) break;
          counts.smaller++;
        }
        if (rect.x !== best.x || rect.y !== best.y) counts.moved++;
        rect.x = best.x;
        rect.y = best.y;
        rect.element.style.left = rect.x + "px";
        rect.element.style.top = rect.y + "px";
        rect.element.style.visibility = "visible";
        placed.push(rect);
      }
      if (i === ids.length) return;
      // Only an overfull scene needs a grid. Keep every box accessible and avoid
      // layering unreadable text over another box when no free rectangle exists.
      counts.grid = true;
      ids.sort(function (a, b) { return boxes[a].bounds.y - boxes[b].bounds.y || boxes[a].bounds.x - boxes[b].bounds.x; });
      var columns = Math.min(ids.length, Math.max(1, Math.ceil(Math.sqrt(ids.length * area.w / area.h))));
      var cellWidth = area.w / columns, cellHeight = area.h / Math.ceil(ids.length / columns);
      ids.forEach(function (id, index) {
        var element = boxes[id].element, css = element.style;
        element.className = "text-box " + style;
        css.fontSize = small + "px";
        css.width = Math.max(1, cellWidth - 2) + "px";
        css.maxHeight = Math.max(1, cellHeight - 2) + "px";
        css.left = area.x + (index % columns) * cellWidth + "px";
        css.top = area.y + Math.floor(index / columns) * cellHeight + "px";
        css.visibility = "visible";
      });
    }

    this.diagnostics = function () { return counts; };

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
    this.clear = function () { Object.keys(boxes).forEach(remove); counts = { moved: 0, smaller: 0, grid: false }; };
  };
}(window));
