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
  if (layer.mode === 'freehand') {
    const count = (layer.curves.length - 1) / 3;
    const at = Math.max(0, Math.min(1, t)) * count, index = Math.min(count - 1, Math.floor(at));
    const p = cubicPoint(layer.curves.slice(index * 3, index * 3 + 4), at - index);
    x = p[0] * layer.rx; y = p[1] * layer.ry;
  } else if (layer.type === 'line') {
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
  if (layer.mode === 'freehand') {
    if (layer.curves.every(p => p[0] === layer.curves[0][0] && p[1] === layer.curves[0][1])) return '';
    const a = layer.rotation * Math.PI / 180;
    return layer.curves.map(([px, py], i) => {
      const x = px * layer.rx, y = py * layer.ry;
      return `${i === 0 ? 'M' : i % 3 === 1 ? 'C' : ''}${(x * Math.cos(a) - y * Math.sin(a) + layer.x).toFixed(3)} ${(x * Math.sin(a) + y * Math.cos(a) + layer.y).toFixed(3)}`;
    }).join(' ');
  }
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
  // Control hulls conservatively bound Bezier curves for fitting and snapping.
  if (layer.mode === 'freehand') {
    const a = layer.rotation * Math.PI / 180;
    return layer.curves.map(([x, y]) => [x * layer.rx * Math.cos(a) - y * layer.ry * Math.sin(a), x * layer.rx * Math.sin(a) + y * layer.ry * Math.cos(a)]);
  }
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
  const layerKeys = ['id', 'type', 'mode', 'color', 'strokeMode', 'visible', 'clip', 'hideOverlap', 'mergeOverlap', 'curves', ...Object.keys(LIMITS)];
  const layers = data.layers.map(raw => {
    if (!raw || Object.keys(raw).some(key => !layerKeys.includes(key)) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || raw.id.length > 100 || !['shape', 'ruler', 'freehand'].includes(raw.mode) || !(raw.mode === 'freehand' ? raw.type === 'freehand' : Object.hasOwn(raw.mode === 'shape' ? TYPES : RULER_TYPES, raw.type)) || !isColor(raw.color) || !['default', 'custom'].includes(raw.strokeMode) || ['visible', 'clip', 'hideOverlap'].some(key => typeof raw[key] !== 'boolean')) throw new Error('レイヤーの形式が正しくありません。');
    if (raw.mode === 'freehand') {
      if (!Array.isArray(raw.curves) || raw.curves.length < 4 || raw.curves.length > 3073 || raw.curves.length % 3 !== 1 || raw.curves.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || Math.abs(n) > 4))) throw new Error('自由曲線の形式が正しくありません。');
    } else if (Object.hasOwn(raw, 'curves')) throw new Error('自由曲線以外に制御点は指定できません。');
    if (![false, true, 'clockwise', 'counterclockwise'].includes(raw.mergeOverlap)) throw new Error('同レイヤーとの重なりの設定が正しくありません。');
    ids.add(raw.id);
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max || (['sides', 'divisions'].includes(key) && !Number.isInteger(raw[key]))) throw new Error('数値が有効範囲を超えています。');
    }
    return { ...raw };
  });
  return { version: 1, globalColor: data.globalColor, globalWidth: data.globalWidth, backgroundColor: data.backgroundColor, layers };
}

function cubicPoint(p, t) {
  const u = 1 - t;
  return [0, 1].map(k => u ** 3 * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t ** 3 * p[3][k]);
}
// Uniform arc-length samples make smoothing independent of pointer speed.
// Reflected endpoints keep the stroke ends fixed without flattening their tangent.
function smoothStroke(input, radius) {
  const lengths = [0];
  for (let i = 1; i < input.length; i++) lengths.push(lengths.at(-1) + Math.hypot(input[i][0] - input[i - 1][0], input[i][1] - input[i - 1][1]));
  const length = lengths.at(-1);
  if (!length || input.length < 3) return input;
  const count = Math.max(2, Math.min(1024, Math.ceil(length / 2))), step = length / count;
  let index = 1;
  const samples = Array.from({ length: count + 1 }, (_, i) => {
    const distance = i * step;
    while (index < input.length - 1 && lengths[index] < distance) index++;
    const t = (distance - lengths[index - 1]) / (lengths[index] - lengths[index - 1]);
    return input[index - 1].map((n, k) => n + (input[index][k] - n) * t);
  });
  const sigma = Math.min(radius, length / 8), reach = Math.min(count, Math.ceil(3 * sigma / step));
  const weights = Array.from({ length: reach + 1 }, (_, i) => Math.exp(-.5 * (i * step / sigma) ** 2));
  return samples.map((p, i) => {
    if (i === 0 || i === count) return input[i === 0 ? 0 : input.length - 1];
    const sum = [0, 0]; let total = 0;
    for (let offset = -reach; offset <= reach; offset++) {
      const j = i + offset, weight = weights[Math.abs(offset)];
      const q = j < 0 ? samples[-j].map((n, k) => 2 * samples[0][k] - n)
        : j > count ? samples[2 * count - j].map((n, k) => 2 * samples[count][k] - n) : samples[j];
      sum[0] += q[0] * weight; sum[1] += q[1] * weight; total += weight;
    }
    return sum.map(n => n / total);
  });
}
// Chord-parameterized least-squares cubics; split at the largest error.
// Shared endpoint tangents keep adjacent segments smooth without dependencies.
function fitFreehand(input, tolerance = 1.5, smoothing = 0) {
  let points = input.filter((p, i) => i === 0 || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) > .001);
  if (points.length < 2) return null;
  if (smoothing > 0) points = smoothStroke(points, smoothing);
  const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const tangents = points.map((p, i) => unit(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]));
  const curves = [points[0]];
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop(), a = points[first], b = points[last], left = tangents[first], right = tangents[last];
    const times = [0];
    for (let i = first + 1; i <= last; i++) times.push(times.at(-1) + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const length = times.at(-1);
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i] / length, u = 1 - t, b1 = 3 * u * u * t, b2 = 3 * u * t * t;
      times[i] = t;
      for (let k = 0; k < 2; k++) {
        const v0 = left[k] * b1, v1 = -right[k] * b2;
        const residual = points[first + i][k] - a[k] * (u ** 3 + b1) - b[k] * (t ** 3 + b2);
        c00 += v0 * v0; c01 += v0 * v1; c11 += v1 * v1; x0 += v0 * residual; x1 += v1 * residual;
      }
    }
    const det = c00 * c11 - c01 * c01;
    let alpha = det > 1e-10 ? (x0 * c11 - x1 * c01) / det : length / 3;
    let beta = det > 1e-10 ? (x1 * c00 - x0 * c01) / det : length / 3;
    if (alpha < .001 || beta < .001 || alpha > length || beta > length) alpha = beta = length / 3;
    const segment = [a, a.map((n, k) => n + left[k] * alpha), b.map((n, k) => n - right[k] * beta), b];
    let error = tolerance, split = -1;
    for (let i = 1; i < times.length - 1; i++) {
      const q = cubicPoint(segment, times[i]);
      const distance = Math.hypot(q[0] - points[first + i][0], q[1] - points[first + i][1]);
      if (distance > error) { error = distance; split = first + i; }
    }
    if (split !== -1) pending.push([split, last], [first, split]);
    else curves.push(...segment.slice(1));
  }
  const xs = curves.map(p => p[0]), ys = curves.map(p => p[1]);
  const x = Math.max(-400, Math.min(400, (Math.min(...xs) + Math.max(...xs)) / 2));
  const y = Math.max(-400, Math.min(400, (Math.min(...ys) + Math.max(...ys)) / 2));
  const rx = Math.max(1, Math.min(380, (Math.max(...xs) - Math.min(...xs)) / 2));
  const ry = Math.max(1, Math.min(380, (Math.max(...ys) - Math.min(...ys)) / 2));
  return { mode: 'freehand', type: 'freehand', x, y, rx, ry, rotation: 0, curves: curves.map(p => [(p[0] - x) / rx, (p[1] - y) / ry]) };
}

globalThis.CircleGeometry = Object.freeze({ TYPES, RULER_TYPES, LIMITS, SHAPE_DEFAULTS, shapeDefaults, point, outline, sector, mergedOutline, resolveStroke, renderArtwork, outlinePoints, fitToSector, snapPosition, snapAngle, createDocument, validateDocument, fitFreehand });
})();
