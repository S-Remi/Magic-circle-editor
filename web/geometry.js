(() => {
'use strict';
const TYPES = { circle: '円', ellipse: '楕円', leaf: '葉形楕円', drop: '水滴', heart: 'ハート', crescent: '三日月', fan: '扇形', polygon: '正多角形', star: '星形', pointed: 'ダイヤ/尖り楕円' };
const RULER_TYPES = { line: '直線', curve: '曲線' };
const SHAPE_DEFAULTS = { crescentDepth: 55, arcAngle: 90 };
const LIMITS = { crescentDepth: [0, 95], arcAngle: [1, 360], divisions: [1, 64], width: [.25, 20], x: [-400, 400], y: [-400, 400], rx: [1, 380], ry: [1, 380], rotation: [-360, 360], phase: [-360, 360], sides: [3, 32], sharpness: [.15, 4], start: [0, 100], end: [0, 100] };
const SHAPE_PRESETS = Object.freeze({
  circle: { ratio: 1 }, ellipse: { ratio: 1.4 }, leaf: { ratio: 1.6 },
  drop: { ratio: 1.4 }, heart: { ratio: 1.2 }, crescent: { ratio: 1 },
  fan: { ratio: 1 }, polygon: { ratio: 1 }, star: { ratio: 1 }, pointed: { ratio: 1.5 }
});
function shapeDefaults(layer, type) {
  if (!Object.hasOwn(SHAPE_PRESETS, type)) throw new Error('図形の種類が正しくありません。');
  const ratio = SHAPE_PRESETS[type].ratio;
  // Keep the current scale unless the recommended aspect ratio exceeds the size limit.
  const rx = Math.min(layer.rx, LIMITS.ry[1] / ratio);
  return { type, rx, ry: rx * ratio, sides: type === 'polygon' ? 6 : 5,
    sharpness: type === 'star' ? 4 * (3 - Math.sqrt(5)) / 2 : 2.5, ...SHAPE_DEFAULTS };
}
function point(layer, t) {
  const angle = t * Math.PI * 2 - Math.PI / 2;
  let x, y;
  if (layer.type === 'line') {
    x = (2 * t - 1) * layer.rx; y = 0;
  } else if (layer.type === 'polygon' || layer.type === 'star') {
    const count = layer.sides * (layer.type === 'star' ? 2 : 1);
    const at = ((t % 1 + 1) % 1) * count, index = Math.floor(at), fraction = at - index;
    const vertex = i => {
      const a = i / count * Math.PI * 2 - Math.PI / 2;
      const r = layer.type === 'star' && i % 2 ? Math.min(.95, Math.max(.08, layer.sharpness / 4)) : 1;
      return [Math.cos(a) * layer.rx * r, Math.sin(a) * (layer.type === 'polygon' ? layer.rx : layer.ry) * r];
    };
    const a = vertex(index), b = vertex(index + 1);
    x = a[0] + (b[0] - a[0]) * fraction; y = a[1] + (b[1] - a[1]) * fraction;
  } else if (layer.type === 'crescent') {
    const u = ((t % 1 + 1) % 1);
    if (u <= .5) {
      const a = -Math.PI / 3 - u * 8 * Math.PI / 3;
      x = Math.cos(a) * layer.rx; y = Math.sin(a) * layer.ry;
    } else {
      const a = (u - .5) * 2 * Math.PI;
      x = (.5 - 1.5 * layer.crescentDepth / 100 * Math.sin(a)) * layer.rx;
      y = Math.sqrt(3) / 2 * Math.cos(a) * layer.ry;
    }
  } else if (layer.type === 'fan') {
    const sweep = layer.arcAngle * Math.PI / 180;
    if (sweep === 2 * Math.PI) {
      x = Math.cos(angle) * layer.rx; y = Math.sin(angle) * layer.rx;
    } else {
      const u = ((t % 1 + 1) % 1);
      const a = -Math.PI / 2 + (u < .25 ? -.5 : u > .75 ? .5 : (u - .25) * 2 - .5) * sweep;
      const radius = layer.rx * (u < .25 ? u * 4 : u > .75 ? (1 - u) * 4 : 1);
      x = Math.cos(a) * radius; y = Math.sin(a) * radius;
    }
  } else if (layer.type === 'drop') {
    const u = ((t % 1 + 1) % 1) * Math.PI * 2;
    x = Math.sin(u) * Math.sin(u / 2) * (3 * Math.sqrt(3) / 4) * layer.rx;
    y = -Math.cos(u) * layer.ry;
  } else if (layer.type === 'heart') {
    const u = t * Math.PI * 2;
    x = Math.sin(u) ** 3 * layer.rx;
    y = -(13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) / 17 * layer.ry;
  } else if (layer.type === 'leaf') {
    // Two parabolic sides meet at the top and bottom tips.
    x = Math.sign(Math.cos(angle)) * Math.cos(angle) ** 2 * layer.rx;
    y = Math.sin(angle) * layer.ry;
  } else {
    const power = layer.type === 'pointed' ? layer.sharpness : 1;
    x = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** power * layer.rx;
    y = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** power * (layer.type === 'circle' ? layer.rx : layer.ry);
  }
  const r = layer.rotation * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r) + layer.x, x * Math.sin(r) + y * Math.cos(r) + layer.y];
}
function outline(layer, full = false) {
  const start = full || layer.mode === 'shape' ? 0 : layer.start / 100;
  let end = full || layer.mode === 'shape' ? 1 : layer.end / 100;
  if (end < start && layer.type !== 'line') end += 1;
  if (end === start) return '';
  const times = [start, end];
  const steps = layer.type === 'line' ? 1 : layer.type === 'polygon' ? layer.sides : layer.type === 'star' ? layer.sides * 2 : 720;
  for (let i = Math.floor(start * steps) + 1; i < end * steps; i++) times.push(i / steps);
  if (layer.type !== 'line') times.sort((a, b) => a - b);
  return times.map((t, i) => `${i ? 'L' : 'M'}${point(layer, t).map(n => n.toFixed(3)).join(' ')}`).join(' ') + (end - start >= 1 && layer.type !== 'line' ? ' Z' : '');
}
function sector(divisions) {
  if (divisions === 1) return '';
  const half = Math.PI / divisions, r = 1600;
  return `M0 0 L${-Math.sin(half) * r} ${-Math.cos(half) * r} A${r} ${r} 0 0 1 ${Math.sin(half) * r} ${-Math.cos(half) * r} Z`;
}
// Split edges at crossings, then trace union or visible-surface boundaries.
// A spatial grid bounds intersection work; horizontal buckets speed up inside tests.
function mergedOutline(layer, stacked = false) {
  const cell = 32, epsilon = 1e-5, polygons = [], seen = new Set(), grid = new Map();
  const source = outlinePoints(layer).map(([x, y]) => [x + layer.x, y + layer.y]);
  for (let copy = 0; copy < layer.divisions; copy++) {
    const direction = stacked && layer.mergeOverlap === 'counterclockwise' ? -1 : 1;
    const angle = (layer.phase + direction * copy * 360 / layer.divisions) * Math.PI / 180;
    const points = source.map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
    const key = points.map(p => p.map(n => n.toFixed(5)).join(',')).sort().join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    const polygon = { copy, bounds, rows: new Map(), edges: [] };
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length], edge = { a, b, polygon };
      polygon.edges.push(edge);
      for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
        if (!polygon.rows.has(y)) polygon.rows.set(y, []);
        polygon.rows.get(y).push(edge);
        for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
          const key = `${x},${y}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(edge);
        }
      }
    });
    polygons.push(polygon);
  }
  const contains = (polygon, x, y) => {
    const [left, top, right, bottom] = polygon.bounds;
    if (x < left || x > right || y < top || y > bottom) return false;
    let result = false;
    for (const { a, b } of polygon.rows.get(Math.floor(y / cell)) || []) {
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) result = !result;
    }
    return result;
  };
  const surface = (x, y) => {
    if (!stacked) return polygons.some(polygon => contains(polygon, x, y));
    const covering = polygons.filter(polygon => contains(polygon, x, y));
    if (layer.divisions <= 2) return covering.at(-1)?.copy ?? -1;
    if (!covering.length) return -1;
    // Fully shared areas have no meaningful front copy in a circular order.
    if (covering.length === polygons.length) return 'center';
    // The end of each covered run sits above its preceding neighbours,
    // including the last/first seam. Never privilege the initial copy.
    const covered = new Set(covering.map(p => p.copy));
    const ends = covering.filter(p => !covered.has((p.copy + 1) % layer.divisions));
    if (ends.length === 1) return ends[0].copy;
    // Long rear tips can form disconnected runs even for convex leaves.
    // Prefer the end facing this point. A wrapped directional angle jumps at
    // zero and can incorrectly expose an opposite tip as a separate triangle.
    const direction = layer.mergeOverlap === 'counterclockwise' ? -1 : 1;
    const a = Math.atan2(y, x) * 180 / Math.PI;
    ends.sort((p, q) => {
      const rank = copy => -Math.cos((direction * (a - layer.phase - Math.atan2(layer.y, layer.x) * 180 / Math.PI) - copy * 360 / layer.divisions) * Math.PI / 180);
      return rank(p.copy) - rank(q.copy);
    });
    return ends[0]?.copy ?? 'center';
  };
  const paths = [], emitted = new Set();
  for (const polygon of polygons) for (const edge of polygon.edges) {
    const { a, b } = edge, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < epsilon) continue;
    const candidates = new Set(), cuts = [0, 1];
    for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
        for (const other of grid.get(`${x},${y}`) || []) if (other.polygon !== polygon) candidates.add(other);
      }
    }
    for (const { a: c, b: d } of candidates) {
      const ex = d[0] - c[0], ey = d[1] - c[1], cx = c[0] - a[0], cy = c[1] - a[1], cross = dx * ey - dy * ex;
      if (Math.abs(cross) > 1e-10) {
        const t = (cx * ey - cy * ex) / cross, u = (cx * dy - cy * dx) / cross;
        if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
      } else if (Math.abs(cx * dy - cy * dx) < epsilon * length) {
        for (const p of [c, d]) {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length);
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const from = cuts[i - 1], to = cuts[i];
      if ((to - from) * length < epsilon) continue;
      const t = (from + to) / 2, x = a[0] + t * dx, y = a[1] + t * dy;
      const nx = -dy / length * epsilon, ny = dx / length * epsilon;
      // Trace boundaries between visible regions, including where the front
      // surface changes at a triple overlap. Masking original strokes alone
      // loses those connecting edges and leaves dangling line ends.
      if (surface(x + nx, y + ny) === surface(x - nx, y - ny)) continue;
      const start = [a[0] + from * dx, a[1] + from * dy].map(n => n.toFixed(5)).join(' ');
      const end = [a[0] + to * dx, a[1] + to * dy].map(n => n.toFixed(5)).join(' ');
      const key = [start, end].sort().join('|');
      if (!emitted.has(key)) { emitted.add(key); paths.push(`M${start} L${end}`); }
    }
  }
  return paths.join(' ');
}
const mergeCache = new Map();
function mergedPath(layer) {
  const key = JSON.stringify(['type', 'x', 'y', 'rx', 'ry', 'rotation', 'phase', 'sides', 'sharpness', 'divisions', 'crescentDepth', 'arcAngle', 'mergeOverlap'].map(k => layer[k]));
  if (!mergeCache.has(key)) {
    if (mergeCache.size >= 80) mergeCache.delete(mergeCache.keys().next().value);
    mergeCache.set(key, mergedOutline(layer, ['clockwise', 'counterclockwise'].includes(layer.mergeOverlap)));
  }
  return mergeCache.get(key);
}
function resolveStroke(layer, document) {
  return layer.strokeMode === 'default' ? { ...layer, color: document.globalColor, width: document.globalWidth } : layer;
}
function renderArtwork(layers, prefix = 'artwork', selection = null) {
  const visible = layers.filter(l => l.visible);
  const repeat = (l, index, content) => Array.from({ length: l.divisions }, (_, i) => `<g transform="rotate(${l.phase + i * 360 / l.divisions})"><g${l.clip && l.divisions > 1 ? ` clip-path="url(#${prefix}-sector-${index})"` : ''}>${content}</g></g>`).join('');
  const defs = visible.map((l, index) => `<path id="${prefix}-outline-${index}" d="${outline(l)}"/>${l.clip && l.divisions > 1 ? `<clipPath id="${prefix}-sector-${index}"><path d="${sector(l.divisions)}"/></clipPath>` : ''}`).join('');
  const artwork = visible.map((l, index) => {
    if (selection && l.id !== selection.id) return '';
    const upper = l.hideOverlap ? visible.slice(index + 1) : [];
    const mask = upper.length ? `<mask id="${prefix}-overlap-${index}" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800" style="mask-type:luminance"><rect x="-400" y="-400" width="800" height="800" fill="white"/>${upper.map((top, offset) => `<g fill="${top.mode === 'shape' ? 'black' : 'none'}" stroke="black" stroke-width="${top.width}" stroke-linejoin="round" stroke-linecap="round">${repeat(top, index + 1 + offset, `<use href="#${prefix}-outline-${index + 1 + offset}" xlink:href="#${prefix}-outline-${index + 1 + offset}"/>`)}</g>`).join('')}</mask>` : '';
    const sameOverlap = l.mergeOverlap && l.mode === 'shape' && l.divisions > 1 && !l.clip;
    const content = sameOverlap ? `<path d="${mergedPath(l)}"/>` : repeat(l, index, `<use href="#${prefix}-outline-${index}" xlink:href="#${prefix}-outline-${index}"/>`);
    return `${mask}<g${mask ? ` mask="url(#${prefix}-overlap-${index})"` : ''} fill="none" stroke="${selection?.color || l.color}" stroke-width="${selection?.width ?? l.width}" stroke-linejoin="round" stroke-linecap="round">${content}</g>`;
  }).join('');
  return `<defs>${defs}</defs>${artwork}`;
}
// Use the same vertices as the rendered outline, including exact polygon corners.
function outlinePoints(layer) {
  if (layer.type === 'line') return [point({ ...layer, x: 0, y: 0 }, 0), point({ ...layer, x: 0, y: 0 }, 1)];
  const count = layer.type === 'polygon' ? layer.sides : layer.type === 'star' ? layer.sides * 2 : 720;
  const centered = { ...layer, x: 0, y: 0 };
  return Array.from({ length: count }, (_, i) => point(centered, i / count));
}
function fitToSector(layer) {
  const points = outlinePoints(layer), margin = layer.width / 2 + .002, radius = 400 - margin;
  const sin = Math.sin(Math.PI / layer.divisions), cos = Math.cos(Math.PI / layer.divisions);
  function bounds() {
    let low = 0, high = 400;
    for (const [x, y] of points) {
      if (layer.divisions === 1) { if (Math.hypot(x, y) > radius) return null; continue; }
      if (Math.abs(x) > radius) return null;
      const reach = Math.sqrt(radius * radius - x * x);
      low = Math.max(low, y + (Math.abs(x) * cos + margin) / sin, y - reach);
      high = Math.min(high, y + reach);
    }
    return low <= high ? [low, high] : null;
  }
  const interval = bounds();
  if (!interval) return null;
  const distance = layer.divisions === 1 ? 0 : Math.max(interval[0], Math.min(interval[1], Math.hypot(layer.x, layer.y)));
  return { x: 0, y: -distance };
}
function snapPosition(layer, x, y, tolerance, points = outlinePoints(layer)) {
  let label = '';
  if (Math.hypot(x, y) <= tolerance) return { x: 0, y: 0, label: '中心に吸着' };
  if (Math.abs(x) <= tolerance) { x = 0; label = '区画の中心線に吸着'; }
  if (Math.abs(y) <= tolerance) { y = 0; label = '中心の横軸に吸着'; }
  if (layer.divisions > 1 && y < 0) {
    const sin = Math.sin(Math.PI / layer.divisions), cos = Math.cos(Math.PI / layer.divisions), margin = layer.width / 2 + .002;
    const supports = [-1, 1].map(sign => Math.max(...points.map(([px, py]) => sign * cos * px + sin * py)) + margin);
    if (x === 0) {
      const target = -Math.max(...supports) / sin;
      if (Math.abs(y - target) <= tolerance) { y = target; label = '区画の境界に吸着'; }
    } else {
      const candidates = [-1, 1].map((sign, i) => ({ sign, gap: sign * cos * x + sin * y + supports[i] }));
      candidates.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
      const best = candidates[0];
      if (Math.abs(best.gap) <= tolerance) { x -= best.gap * best.sign * cos; y -= best.gap * sin; label = '区画の境界に吸着'; }
    }
  }
  if (Math.abs(x) > 400 || Math.abs(y) > 400) return { x: layer.x, y: layer.y, label: '' };
  return { x, y, label };
}
function snapAngle(angle, divisions, tolerance = 3) {
  const wrap = n => ((n + 180) % 360 + 360) % 360 - 180;
  const candidates = [15, 180 / divisions].map(step => {
    const target = Math.round(angle / step) * step;
    return { angle: wrap(target), distance: Math.abs(wrap(angle - target)) };
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].distance <= tolerance ? { angle: candidates[0].angle, snapped: true } : { angle, snapped: false };
}
function createDocument(layers = []) {
  return { version: 1, globalColor: '#000000', globalWidth: 1.5, backgroundColor: '#ffffff', layers };
}
function validateDocument(data) {
  const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const documentKeys = ['version', 'globalColor', 'globalWidth', 'backgroundColor', 'layers'];
  if (!data || data.version !== 1 || Object.keys(data).some(key => !documentKeys.includes(key)) || !Array.isArray(data.layers) || data.layers.length > 80) throw new Error('対応していないデータ形式です。');
  if (!isColor(data.globalColor) || !isColor(data.backgroundColor)) throw new Error('全体の色の形式が正しくありません。');
  if (!Number.isFinite(data.globalWidth) || data.globalWidth < LIMITS.width[0] || data.globalWidth > LIMITS.width[1]) throw new Error('全体の太さが有効範囲を超えています。');
  const ids = new Set();
  const layerKeys = ['id', 'type', 'mode', 'color', 'strokeMode', 'visible', 'clip', 'hideOverlap', 'mergeOverlap', ...Object.keys(LIMITS)];
  const layers = data.layers.map(raw => {
    if (!raw || Object.keys(raw).some(key => !layerKeys.includes(key)) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || raw.id.length > 100 || !['shape', 'ruler'].includes(raw.mode) || !Object.hasOwn(raw.mode === 'shape' ? TYPES : RULER_TYPES, raw.type) || !isColor(raw.color) || !['default', 'custom'].includes(raw.strokeMode) || ['visible', 'clip', 'hideOverlap'].some(key => typeof raw[key] !== 'boolean')) throw new Error('レイヤーの形式が正しくありません。');
    if (![false, true, 'clockwise', 'counterclockwise'].includes(raw.mergeOverlap)) throw new Error('同レイヤーとの重なりの設定が正しくありません。');
    ids.add(raw.id);
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max || (['sides', 'divisions'].includes(key) && !Number.isInteger(raw[key]))) throw new Error('数値が有効範囲を超えています。');
    }
    return { ...raw };
  });
  return { version: 1, globalColor: data.globalColor, globalWidth: data.globalWidth, backgroundColor: data.backgroundColor, layers };
}

globalThis.CircleGeometry = Object.freeze({ TYPES, RULER_TYPES, LIMITS, SHAPE_DEFAULTS, shapeDefaults, point, outline, sector, mergedOutline, resolveStroke, renderArtwork, outlinePoints, fitToSector, snapPosition, snapAngle, createDocument, validateDocument });
})();
