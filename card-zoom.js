// Zoom and pan for the card frame. One transformed layer carries the image and every overlay,
// so light, hit areas and hotspots stay registered at any scale.
// Ctrl/⌘ + wheel, pinch, double tap or double click (2× at that point), drag, and + − 0 / arrows.
export function createZoom(frame, layer, { min = 1, max = 3, onChange } = {}) {
  let z = 1, x = 0, y = 0, moved = false, lastTap = null, pinch = null, drag = null;
  const pointers = new Map();
  const local = event => { const r = frame.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  function apply() {
    const w = frame.clientWidth, h = frame.clientHeight;
    x = Math.min(0, Math.max(w - w * z, x)); y = Math.min(0, Math.max(h - h * z, y));
    layer.style.transform = z === 1 ? '' : `translate(${x}px, ${y}px) scale(${z})`;
    frame.style.setProperty('--zoom', String(z));
    frame.dataset.zoomed = String(z > 1.001);
    onChange?.(z);
  }
  function zoomTo(next, px = frame.clientWidth / 2, py = frame.clientHeight / 2) {
    next = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    x = px - (px - x) * (next / z); y = py - (py - y) * (next / z); z = next;
    if (z === 1) { x = 0; y = 0; }
    apply();
  }
  function reset() { z = 1; x = 0; y = 0; apply(); }

  frame.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const [px, py] = local(event);
    zoomTo(z * Math.exp(-event.deltaY * 0.0025), px, py);
  }, { passive: false });

  frame.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, local(event)); moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: distance(a, b) || 1, z, mid: middle(a, b) }; drag = null;
    } else if (pointers.size === 1 && z > 1) {
      drag = { start: local(event), x, y, mouse: event.pointerType === 'mouse' };
    }
  });
  frame.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event); pointers.set(event.pointerId, point);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], m = middle(a, b);
      zoomTo(pinch.z * distance(a, b) / pinch.d, m[0], m[1]);
      x += m[0] - pinch.mid[0]; y += m[1] - pinch.mid[1]; pinch.mid = m; apply(); moved = true;
    } else if (drag) {
      const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
      // Capture only once this is really a drag, so a plain click still reaches the word under it.
      if (!moved && Math.hypot(dx, dy) > 5) { moved = true; if (drag.mouse) frame.setPointerCapture(event.pointerId); }
      if (moved) { x = drag.x + dx; y = drag.y + dy; apply(); }
    }
  });
  const release = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) drag = null;
    if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    if (event.type !== 'pointerup' || moved) { lastTap = null; return; }
    const now = performance.now(), point = local(event);
    if (lastTap && now - lastTap.t < 320 && distance(point, lastTap.p) < 30) {
      if (z > 1.01) reset(); else zoomTo(2, point[0], point[1]);
      lastTap = null;
    } else lastTap = { t: now, p: point };
  };
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  // A drag or pinch is not a choice on the card.
  frame.addEventListener('click', event => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
  frame.addEventListener('dblclick', event => event.preventDefault());

  frame.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = 48;
    if (event.key === '+' || event.key === '=') zoomTo(z + 0.5);
    else if (event.key === '-' || event.key === '_') zoomTo(z - 0.5);
    else if (event.key === '0') reset();
    else if (z > 1 && event.key === 'ArrowLeft') { x += step; apply(); }
    else if (z > 1 && event.key === 'ArrowRight') { x -= step; apply(); }
    else if (z > 1 && event.key === 'ArrowUp') { y += step; apply(); }
    else if (z > 1 && event.key === 'ArrowDown') { y -= step; apply(); }
    else return;
    event.preventDefault(); event.stopPropagation();
  });
  addEventListener('resize', () => apply());

  return {
    zoomTo, reset,
    zoomBy(delta) { zoomTo(z + delta); },
    get z() { return z; }
  };
}
