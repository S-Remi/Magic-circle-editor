import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/geometry.js';
const { point, outline, renderArtwork, outlinePoints, fitToSector, snapPosition, snapAngle, createDocument, validateDocument } = globalThis.CircleGeometry;
const layer = { id: 'test', strokeMode: 'custom', crescentDepth: 55, arcAngle: 90, hideOverlap: false, mergeOverlap: false, mode: 'shape', type: 'circle', divisions: 6, width: 1, x: 0, y: -100, rx: 50, ry: 30, rotation: 0, phase: 0, sides: 6, sharpness: 2, start: 0, end: 75, color: '#d6ba7d', clip: false, visible: true };

test('freehand fitting preserves endpoints and approximates curved strokes with few cubics', () => {
  const points = Array.from({ length: 301 }, (_, i) => [i - 150, 55 * Math.sin(i / 35) - 120]);
  const fitted = { ...layer, ...globalThis.CircleGeometry.fitFreehand(points) };
  assert.ok(fitted.curves.length < points.length / 2);
  assert.deepEqual(point(fitted, 0), points[0]);
  assert.ok(Math.hypot(...point(fitted, 1).map((n, k) => n - points.at(-1)[k])) < 1e-10);
  const samples = Array.from({ length: 4001 }, (_, i) => point(fitted, i / 4000));
  for (const p of points) assert.ok(Math.min(...samples.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))) < 1.6);
  assert.match(outline(fitted), /^M.*C/);
  assert.doesNotMatch(outline(fitted), /[LZ]|NaN|Infinity/);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(createDocument([fitted])))).layers[0], fitted);
});

test('freehand handles taps, straight lines, duplicates, reversals and closed strokes', () => {
  const fit = globalThis.CircleGeometry.fitFreehand;
  assert.equal(fit([[0, 0], [0, 0]]), null);
  assert.equal(fit([[0, 0]]), null);
  for (const points of [
    [[0, 0], [100, 100]], [[0, 0], [0, 0], [0, -100]],
    [[0, 0], [100, 0], [0, 0]],
    Array.from({ length: 101 }, (_, i) => [100 * Math.sin(i * Math.PI / 50), 100 * Math.cos(i * Math.PI / 50)])
  ]) {
    const fitted = { ...layer, ...fit(points) };
    assert.doesNotMatch(outline(fitted), /NaN|Infinity|Z/);
    assert.doesNotThrow(() => validateDocument(createDocument([fitted])));
    for (const t of [0, 1]) assert.ok(Math.hypot(...point(fitted, t).map((n, k) => n - points[t ? points.length - 1 : 0][k])) < 1e-8);
  }
});

test('freehand keeps repeats, clipping and stroke-only overlap through export', () => {
  const curve = { ...layer, ...globalThis.CircleGeometry.fitFreehand([[0, -100], [30, -150], [0, -200]]), divisions: 8, phase: 17, clip: true };
  const svg = renderArtwork([curve]);
  assert.equal((svg.match(/<g transform="rotate/g) || []).length, 8);
  assert.equal((svg.match(/clip-path=/g) || []).length, 8);
  assert.match(svg, /rotate\(17\)/);
  assert.match(svg, /C/);
  const masked = renderArtwork([{ ...layer, hideOverlap: true }, { ...curve, id: 'upper' }]);
  assert.match(masked, /<g fill="none" stroke="black"/);
  assert.doesNotMatch(outline({ ...curve, rotation: 45, rx: 80, ry: 60, x: 50 }), /NaN/);
});

test('freehand rejects malformed and excessive control point data', () => {
  const curve = { ...layer, ...globalThis.CircleGeometry.fitFreehand([[0, 0], [10, 20]]) };
  for (const curves of [undefined, [], [[0, 0]], Array(5).fill([0, 0]), Array(3076).fill([0, 0]), [[0, 0], [0, 0], [0, Infinity], [0, 0]], [[0, 0], [0, 0], [5, 0], [0, 0]], [[0, 0], [0, 0], ['1', 0], [0, 0]]]) {
    assert.throws(() => validateDocument(createDocument([{ ...curve, curves }])));
  }
  assert.throws(() => validateDocument(createDocument([{ ...layer, curves: curve.curves }])));
});

test('smoothing removes mouse jitter while retaining the broad curve and endpoints', () => {
  const points = Array.from({ length: 401 }, (_, i) => [i - 200, 60 * Math.sin(i / 65) + 4 * Math.sin(i * 1.9) * Math.sin(i * Math.PI / 400)]);
  const raw = globalThis.CircleGeometry.fitFreehand(points);
  const fitted = { ...layer, ...globalThis.CircleGeometry.fitFreehand(points, 2.5, 10) };
  assert.ok(fitted.curves.length < raw.curves.length / 4);
  let error = 0;
  for (let i = 0; i <= 1000; i++) {
    const [x, y] = point(fitted, i / 1000);
    error += (y - 60 * Math.sin((x + 200) / 65)) ** 2;
  }
  assert.ok(Math.sqrt(error / 1001) < 1.5);
  for (const t of [0, 1]) assert.ok(Math.hypot(...point(fitted, t).map((n, k) => n - points[t ? 400 : 0][k])) < 1e-8);
  assert.doesNotThrow(() => validateDocument(createDocument([fitted])));
});

test('smoothing is independent of extra samples during a slow part of a stroke', () => {
  const points = Array.from({ length: 81 }, (_, i) => [i * 3, 40 * Math.sin(i / 15)]);
  const dense = points.flatMap((p, i) => i > 10 && i < 60 ? Array.from({ length: 10 }, (_, j) => p.map((n, k) => n + (points[i + 1][k] - n) * j / 10)) : [p]);
  const a = { ...layer, ...globalThis.CircleGeometry.fitFreehand(points, 2.5, 10) };
  const b = { ...layer, ...globalThis.CircleGeometry.fitFreehand(dense, 2.5, 10) };
  assert.equal(a.curves.length, b.curves.length);
  for (let i = 0; i <= 100; i++) assert.ok(Math.hypot(...point(a, i / 100).map((n, k) => n - point(b, i / 100)[k])) < 1e-8);
});
test('directional overlap persists both directions and rejects unknown modes', () => {
  for (const mergeOverlap of [false, true, 'clockwise', 'counterclockwise']) {
    const doc = createDocument([{ ...layer, mergeOverlap }]);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
  for (const mergeOverlap of [null, 0, 'true', 'false', 'invalid', {}, []]) {
    assert.throws(() => validateDocument(createDocument([{ ...layer, mergeOverlap }])));
  }
});
test('directional boundaries stay connected in dense overlaps and at the seam', () => {
  for (const mergeOverlap of ['clockwise', 'counterclockwise']) {
    for (const divisions of [2, 3, 4, 6, 8]) for (const y of [0, -30, -60, -100, -134.3]) {
      const input = { ...layer, mergeOverlap, divisions, y, rx: 100, phase: 23 };
      const path = globalThis.CircleGeometry.mergedOutline(input, true);
      const edges = segments(path);
      assert.ok(edges.length > 0);
      const endpoints = edges.flatMap(([ax, ay, bx, by]) => [[ax, ay], [bx, by]]);
      const buckets = new Map();
      const cell = .001;
      for (const p of endpoints) {
        const key = p.map(n => Math.floor(n / cell)).join(',');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }
      for (const p of endpoints) {
        let degree = 0;
        const [cx, cy] = p.map(n => Math.floor(n / cell));
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          for (const q of buckets.get([cx + dx, cy + dy].join(',')) || []) {
            if (Math.hypot(p[0] - q[0], p[1] - q[1]) < .00003) degree++;
          }
        }
        assert.ok(degree >= 2, JSON.stringify({ mergeOverlap, divisions, y, dangling: p }));
      }
    }
  }
});
test('directional overlap repeats the same silhouette around the full ring at every density', () => {
  for (const mergeOverlap of ['clockwise', 'counterclockwise']) {
    for (const divisions of [3, 4, 6, 8]) for (const y of [-30, -60, -100, -134.3]) {
      const input = { ...layer, mergeOverlap, divisions, y, rx: 100, phase: 23 };
      const edges = segments(globalThis.CircleGeometry.mergedOutline(input, true));
      const lengths = Array(divisions).fill(0);
      for (const [ax, ay, bx, by] of edges) {
        const angle = ((Math.atan2(ay + by, ax + bx) * 180 / Math.PI - input.phase + 90) % 360 + 360) % 360;
        lengths[Math.floor(angle * divisions / 360) % divisions] += Math.hypot(bx - ax, by - ay);
      }
      assert.ok(Math.max(...lengths) - Math.min(...lengths) < .002,
        JSON.stringify({ mergeOverlap, divisions, y, lengths }));
      // Every sampled boundary midpoint must remain on a boundary after one
      // repetition. Equal length alone could hide differently shaped sectors.
      const angle = 2 * Math.PI / divisions, cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = 0; i < edges.length; i += 19) {
        const [ax, ay, bx, by] = edges[i], x = (ax + bx) / 2, py = (ay + by) / 2;
        const px = x * cos - py * sin, qy = x * sin + py * cos;
        assert.ok(edges.some(([cx, cy, dx, dy]) => {
          const vx = dx - cx, vy = dy - cy, length2 = vx * vx + vy * vy;
          const t = Math.max(0, Math.min(1, ((px - cx) * vx + (qy - cy) * vy) / length2));
          return Math.hypot(px - cx - t * vx, qy - cy - t * vy) < .00003;
        }), JSON.stringify({ mergeOverlap, divisions, y, missing: [px, qy] }));
      }
    }
  }
});
test('offset leaf overlaps have no exposed rear tips or isolated triangular outlines', () => {
  for (const mergeOverlap of ['clockwise', 'counterclockwise']) for (const phase of [0, 23, 180]) {
    // Reproduction supplied with the reported protruding tip and six triangles.
    const input = { ...layer, type: 'leaf', x: 13.9, y: -44.8, rx: 45.5, ry: 110.3,
      divisions: 6, rotation: 0, width: 1.5, phase, mergeOverlap };
    const edges = segments(globalThis.CircleGeometry.mergedOutline(input, true));
    const nodes = [], buckets = new Map(), cell = .001;
    const nodeAt = (x, y) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const node of buckets.get([cx + dx, cy + dy].join(',')) || []) {
          if (Math.hypot(node.x - x, node.y - y) < .00003) return node;
        }
      }
      const node = { x, y, adjacent: new Set() }, key = [cx, cy].join(',');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(node); nodes.push(node);
      return node;
    };
    for (const [ax, ay, bx, by] of edges) {
      const a = nodeAt(ax, ay), b = nodeAt(bx, by);
      if (a !== b) { a.adjacent.add(b); b.adjacent.add(a); }
    }
    assert.ok(nodes.length > 0);
    for (const node of nodes) assert.ok(node.adjacent.size >= 2,
      JSON.stringify({ mergeOverlap, phase, dangling: [node.x, node.y] }));
    const visited = new Set(), pending = [nodes[0]];
    while (pending.length) {
      const node = pending.pop();
      if (visited.has(node)) continue;
      visited.add(node); pending.push(...node.adjacent);
    }
    assert.equal(visited.size, nodes.length, `${mergeOverlap}/${phase}: isolated interior outlines`);
  }
});
test('directional rendering shares boundaries with selection and composes with upper masks', () => {
  const input = { ...layer, mergeOverlap: 'clockwise', divisions: 6, rx: 100, y: -60 };
  const path = globalThis.CircleGeometry.mergedOutline(input, true);
  const svg = renderArtwork([input, { ...layer, id: 'upper' }]);
  assert.ok(svg.includes(path));
  assert.doesNotMatch(svg, /same-overlap/);
  assert.match(renderArtwork([{ ...input, hideOverlap: true }, { ...layer, id: 'upper' }]), /mask="url\(#artwork-overlap-0\)"/);
  const highlight = renderArtwork([input], 'selection', { id: input.id, color: '#006a9c', width: 8 });
  assert.ok(highlight.includes(path));
  assert.notEqual(renderArtwork([input]), renderArtwork([{ ...input, mergeOverlap: 'counterclockwise' }]));
  assert.notEqual(renderArtwork([input]), renderArtwork([{ ...input, mergeOverlap: true }]));
  for (const patch of [{ divisions: 1 }, { clip: true }, { mode: 'ruler', type: 'curve' }]) {
    assert.match(renderArtwork([{ ...input, ...patch }]), /href="#artwork-outline-0"/);
  }
  assert.doesNotMatch(renderArtwork([{ ...input, visible: false }]), /<path/);
});
test('circle points use a shared radius and apply translation and rotation', () => {
  assert.deepEqual(point(layer, 0).map(Math.round), [0, -150]);
  assert.deepEqual(point({ ...layer, rotation: 90 }, 0).map(Math.round), [50, -100]);
});
test('ruler range wraps across the top without closing', () => {
  const path = outline({ ...layer, mode: 'ruler', type: 'curve', start: 75, end: 25 });
  assert.ok(path.startsWith('M-50.000 -100.000'));
  assert.ok(path.endsWith('L50.000 -100.000'));
  assert.ok(!path.endsWith('Z'));
  assert.equal(outline({ ...layer, mode: 'ruler', type: 'curve', start: 25, end: 25 }), '');
});
test('each repetition is clipped before rotation; hidden layers are omitted', () => {
  const svg = renderArtwork([{ ...layer, clip: true }, { ...layer, visible: false }]);
  assert.equal((svg.match(/clip-path=/g) || []).length, 6);
  assert.equal((svg.match(/transform="rotate/g) || []).length, 6);
  assert.ok(!renderArtwork([{ ...layer, clip: true, divisions: 1 }]).includes('clip-path='));
});
test('selection overlays have independent SVG definition IDs', () => {
  const selected = { ...layer, clip: true };
  const artwork = renderArtwork([selected]);
  const highlight = renderArtwork([selected], 'selection-line');
  const ids = [...(artwork + highlight).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(highlight.includes('href="#selection-line-outline-0"'));
  assert.ok(highlight.includes('url(#selection-line-sector-0)'));
});
test('data round-trips and rejects unsafe or unbounded inputs', () => {
  const data = { ...createDocument(), layers: [layer] };
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(data))), data);
  for (const patch of [{ divisions: 999 }, { divisions: 1.5 }, { rx: NaN }, { color: 'url(https://invalid)' }, { type: '__proto__' }, { visible: 'yes' }]) {
    assert.throws(() => validateDocument({ ...createDocument(), layers: [{ ...layer, ...patch }] }));
  }
  assert.throws(() => validateDocument({ ...createDocument(), layers: [layer, layer] }));
  assert.throws(() => validateDocument({ version: 2, layers: [] }));
});
test('fit places circles tangent to sector edges including stroke width', () => {
  const input = { ...layer, rx: 100, y: -160, width: 2 };
  const result = fitToSector(input);
  assert.equal(result.x, 0);
  assert.deepEqual(Object.keys(result).sort(), ['x', 'y']);
  assert.ok(Math.abs(result.y + 202.004) < .001);
});
test('fit keeps rendered outlines and strokes inside every sector and canvas', () => {
  for (const type of ['circle', 'ellipse', 'leaf', 'drop', 'heart', 'crescent', 'fan', 'polygon', 'star', 'pointed']) {
    for (const divisions of [1, 2, 3, 7, 64]) {
      const input = { ...layer, type, divisions, rx: 6, ry: 10, rotation: 37, x: 230, y: 100, width: 4 };
      const patch = fitToSector(input);
      assert.ok(patch, `${type}/${divisions}`);
      const fitted = { ...input, ...patch };
      validateDocument({ ...createDocument(), layers: [fitted] });
      assert.equal(fitted.rx, input.rx); assert.equal(fitted.ry, input.ry);
      const half = Math.PI / divisions;
      for (const [x, localY] of outlinePoints(fitted)) {
        const y = localY + fitted.y;
        assert.ok(Math.hypot(x, y) + fitted.width / 2 <= 400, `${type}/${divisions} canvas`);
        if (divisions > 1) assert.ok(Math.abs(x) * Math.cos(half) + y * Math.sin(half) + fitted.width / 2 <= 0, `${type}/${divisions} sector`);
      }
    }
  }
});
test('unfit dimensions report failure without shrinking or mutating the layer', () => {
  const oversized = { ...layer, rx: 300, ry: 220, divisions: 12 };
  const original = { ...oversized };
  assert.equal(fitToSector(oversized), null);
  assert.deepEqual(oversized, original);
  assert.equal(fitToSector({ ...layer, type: 'ellipse', divisions: 64, rx: 380, ry: 1 }), null);
});
test('move snapping aligns center, sector axis and outline edge, leaving distant positions alone', () => {
  assert.deepEqual(snapPosition(layer, 3, -4, 8), { x: 0, y: 0, label: '中心に吸着' });
  assert.equal(snapPosition(layer, 3, -180, 8).x, 0);
  const snapped = snapPosition(layer, 2, -104, 8);
  assert.ok(Math.abs(snapped.y + 101.004) < .001);
  const untouched = snapPosition(layer, 60, -250, 8);
  assert.equal(untouched.x, 60); assert.equal(untouched.y, -250);
});
test('angle snapping handles division angles, 15 degree increments, negatives and wraparound', () => {
  assert.equal(snapAngle(46, 7).angle, 45);
  assert.ok(Math.abs(snapAngle(52, 7).angle - 360 / 7) < 1e-10);
  assert.equal(snapAngle(-89, 6).angle, -90);
  assert.equal(snapAngle(179, 6).angle, -180);
  assert.equal(snapAngle(7, 6).snapped, false);
});
test('leaf has two tips and parabolic sides, with file support', () => {
  const leaf = { ...layer, type: 'leaf', x: 0, y: 0, rx: 40, ry: 100 };
  for (const [t, expected] of [[0, [0, -100]], [.25, [40, 0]], [.5, [0, 100]], [.75, [-40, 0]]]) {
    point(leaf, t).forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9));
  }
  for (const t of [.1, .2, .6, .9]) {
    const [x, y] = point(leaf, t);
    assert.ok(Math.abs(Math.abs(x) / leaf.rx + (y / leaf.ry) ** 2 - 1) < 1e-9);
  }
  assert.ok(outline(leaf).endsWith(' Z'));
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [leaf] }).layers[0], leaf);
});

test('line rulers have exact endpoints, reversible ranges and no closing edge', () => {
  const ruler = { ...layer, type: 'line', mode: 'ruler', start: 0, end: 100 };
  assert.equal(outline(ruler), 'M-50.000 -100.000 L50.000 -100.000');
  assert.equal(outline({ ...ruler, start: 100, end: 0 }), 'M50.000 -100.000 L-50.000 -100.000');
  assert.deepEqual(outlinePoints(ruler), [[-50, 0], [50, 0]]);
  assert.deepEqual(point({ ...ruler, rotation: 90 }, 1).map(Math.round), [0, -50]);
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [ruler] }).layers[0], ruler);
});

test('overlap masks use only visible upper layers and follow ordering and sector clipping', () => {
  const lower = { ...layer, hideOverlap: true };
  const upper = { ...layer, id: 'upper', clip: true };
  const svg = renderArtwork([lower, upper]);
  const mask = svg.match(/<mask[^>]*>[\s\S]*?<\/mask>/)[0];
  assert.ok(mask.includes('fill="black"'));
  assert.ok(mask.includes('href="#artwork-outline-1"'));
  assert.ok(mask.includes('clip-path="url(#artwork-sector-1)"'));
  assert.ok(!mask.includes('href="#artwork-outline-0"'));
  for (const layers of [[upper, lower], [lower, { ...upper, visible: false }], [{ ...lower, hideOverlap: false }, upper]]) {
    assert.ok(!renderArtwork(layers).includes('<mask'));
  }
  const selected = renderArtwork([lower, upper], 'selection', { id: lower.id, color: '#00a2cf', width: 5 });
  assert.ok(selected.includes('mask="url(#selection-overlap-0)"'));
  assert.ok(selected.includes('stroke="#00a2cf"'));
  const rulerMask = renderArtwork([lower, { ...upper, type: 'line', mode: 'ruler' }]).match(/<mask[^>]*>[\s\S]*?<\/mask>/)[0];
  assert.ok(rulerMask.includes('fill="none" stroke="black"'));
});

const segments = path => [...path.matchAll(/M([\d.e+-]+) ([\d.e+-]+) L([\d.e+-]+) ([\d.e+-]+)/g)].map(m => m.slice(1).map(Number));
test('merged circles retain the exterior and remove both interior arcs', () => {
  const input = { ...layer, x: 0, y: -30, rx: 50, divisions: 2, mergeOverlap: true };
  const edges = segments(globalThis.CircleGeometry.mergedOutline(input));
  assert.ok(edges.length > 500);
  for (const [ax, ay, bx, by] of edges) {
    const x = (ax + bx) / 2, y = (ay + by) / 2;
    assert.ok(Math.hypot(x, y - 30) >= 49.999 && Math.hypot(x, y + 30) >= 49.999);
  }
  assert.ok(edges.some(e => e[1] < -79.99));
  assert.ok(edges.some(e => e[1] > 79.99));
});

test('merging keeps coincident outlines and disjoint copies', () => {
  const identical = segments(globalThis.CircleGeometry.mergedOutline({ ...layer, x: 0, y: 0, rx: 50, divisions: 4 }));
  assert.ok(identical.length >= 720);
  assert.ok(identical.every(([ax, ay]) => Math.abs(Math.hypot(ax, ay) - 50) < .001));
  const separate = segments(globalThis.CircleGeometry.mergedOutline({ ...layer, x: 0, y: -100, rx: 20, divisions: 2 }));
  assert.equal(separate.length, 1440);
});

test('merged polygons remove a shared interior edge without losing exterior collinear edges', () => {
  const input = { ...layer, type: 'polygon', sides: 4, rx: 50, ry: 50, rotation: 45, divisions: 2, x: 0, y: -50 / Math.sqrt(2) };
  const edges = segments(globalThis.CircleGeometry.mergedOutline(input));
  assert.equal(edges.length, 6);
  assert.ok(!edges.some(([, ay, , by]) => Math.abs(ay) < .001 && Math.abs(by) < .001));
});

test('merge setting validates, persists and composes with upper masks and clipping', () => {
  const input = { ...layer, mergeOverlap: true, hideOverlap: true };
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [input] }).layers[0], input);
  assert.throws(() => validateDocument({ ...createDocument(), layers: [{ ...layer, mergeOverlap: 'yes' }] }));
  const upper = { ...layer, id: 'upper' };
  const merged = renderArtwork([input, upper]);
  assert.ok(merged.includes('mask="url(#artwork-overlap-0)"'));
  assert.ok(!merged.includes('href="#artwork-outline-0"'));
  assert.ok(renderArtwork([{ ...input, clip: true }]).includes('clip-path='));
  assert.ok(renderArtwork([{ ...input, mode: 'ruler', type: 'line' }]).includes('href="#artwork-outline-0"'));
});

test('regular polygons have equal radii and edges regardless of stored vertical radius', () => {
  for (const sides of [3, 4, 5, 6, 13, 32]) {
    const input = { ...layer, type: 'polygon', sides, rx: 80, ry: 17, rotation: 37, x: 23, y: -45 };
    const vertices = Array.from({ length: sides }, (_, i) => point(input, i / sides));
    for (let i = 0; i < sides; i++) {
      const a = vertices[i], b = vertices[(i + 1) % sides];
      assert.ok(Math.abs(Math.hypot(a[0] - input.x, a[1] - input.y) - 80) < 1e-9);
      assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - 160 * Math.sin(Math.PI / sides)) < 1e-9);
    }
    assert.equal(outline(input), outline({ ...input, ry: 300 }));
  }
});

test('global stroke and background settings round-trip and reject invalid values', () => {
  const data = { ...createDocument(), layers: [layer], globalColor: '#123456', globalWidth: 3.25, backgroundColor: '#abcdef' };
  assert.deepEqual(validateDocument(data), data);
  for (const patch of [{ globalColor: 'red' }, { backgroundColor: 'url(bad)' }, { globalWidth: 0 }, { globalWidth: 21 }, { globalWidth: '2' }, { globalWidth: NaN }]) {
    assert.throws(() => validateDocument({ ...data, ...patch }));
  }
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [] }), { ...createDocument(), layers: [] });
});

test('default strokes follow globals while custom strokes retain independent values', () => {
  const doc = { globalColor: '#abcdef', globalWidth: 7 };
  const inherited = { ...layer, strokeMode: 'default' }, custom = { ...layer, strokeMode: 'custom' };
  assert.equal(globalThis.CircleGeometry.resolveStroke(inherited, doc).color, '#abcdef');
  assert.equal(globalThis.CircleGeometry.resolveStroke(inherited, doc).width, 7);
  assert.deepEqual(globalThis.CircleGeometry.resolveStroke(custom, doc), custom);
  assert.equal(inherited.width, 1);
  const data = { ...createDocument(), layers: [custom], ...doc };
  assert.deepEqual(validateDocument(data), data);
  assert.throws(() => validateDocument({ ...data, layers: [{ ...custom, strokeMode: 'invalid' }] }));
  const svg = renderArtwork([inherited, { ...custom, id: 'custom' }].map(l => globalThis.CircleGeometry.resolveStroke(l, doc)));
  assert.ok(svg.includes('stroke="#abcdef" stroke-width="7"'));
  assert.ok(svg.includes('stroke="#d6ba7d" stroke-width="1"'));
});

test('drop and heart are closed symmetric shapes with distinct tips and supported persistence', () => {
  for (const type of ['drop', 'heart']) {
    const input = { ...layer, type, x: 0, y: 0, rx: 60, ry: 100, rotation: 0 };
    assert.ok(outline(input).endsWith(' Z'));
    assert.deepEqual(validateDocument({ ...createDocument(), layers: [input] }).layers[0], input);
    for (const t of [.1, .25, .4]) {
      const a = point(input, t), b = point(input, 1 - t);
      assert.ok(Math.abs(a[0] + b[0]) < 1e-9);
      assert.ok(Math.abs(a[1] - b[1]) < 1e-9);
    }
    for (const [x, y] of outlinePoints(input)) {
      assert.ok(Math.abs(x) <= 60.00001 && Math.abs(y) <= 100.00001);
    }
    const rotated = point({ ...input, rotation: 90, x: 20, y: 30 }, .25), original = point(input, .25);
    assert.ok(Math.abs(rotated[0] - (20 - original[1])) < 1e-9);
    assert.ok(Math.abs(rotated[1] - (30 + original[0])) < 1e-9);
    assert.ok(globalThis.CircleGeometry.mergedOutline({ ...input, y: -30, divisions: 3 }).length > 0);
  }
  const drop = { ...layer, type: 'drop', x: 0, y: 0, rx: 60, ry: 100 };
  assert.deepEqual(point(drop, 0), [0, -100]);
  const heart = { ...drop, type: 'heart' };
  assert.ok(point(heart, .1)[1] < point(heart, 0)[1]);
  assert.ok(Math.abs(point(heart, .5)[1] - 100) < 1e-9);
});

test('crescent has shared tips and a depth-controlled inner arc', () => {
  const l = { ...layer, type: 'crescent', rx: 100, ry: 80, x: 0, y: 0, crescentDepth: 55 };
  assert.ok(outline(l).endsWith(' Z'));
  assert.ok(Math.abs(point(l, 0)[0] - 50) < 1e-9);
  assert.ok(Math.abs(point(l, .5)[1] - 40 * Math.sqrt(3)) < 1e-9);
  assert.ok(Math.abs(point(l, .25)[0] + 100) < 1e-9);
  assert.ok(point({ ...l, crescentDepth: 90 }, .75)[0] < point(l, .75)[0]);
  assert.ok(Math.hypot(...point(l, 1).map((n, i) => n - point(l, 0)[i])) < 1e-9);
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [l] }).layers[0], l);
});

test('fan includes exact radial corners and becomes a seamless circle at 360 degrees', () => {
  const l = { ...layer, type: 'fan', rx: 100, x: 0, y: 0, arcAngle: 90 };
  assert.ok(Math.hypot(...point(l, 0)) < 1e-9);
  assert.ok(Math.abs(point(l, .25)[0] + Math.sqrt(5000)) < 1e-9);
  assert.ok(Math.abs(point(l, .75)[0] - Math.sqrt(5000)) < 1e-9);
  for (const angle of [1, 90, 180, 270, 359]) {
    const shape = { ...l, arcAngle: angle };
    assert.ok(outline(shape).endsWith(' Z'));
    assert.ok(outlinePoints(shape).every(p => Math.hypot(...p) <= 100.00001));
  }
  assert.equal(outline({ ...l, arcAngle: 360 }), outline({ ...l, type: 'circle' }));
  assert.deepEqual(validateDocument({ ...createDocument(), layers: [l] }).layers[0], l);
});

test('new shape parameters reject invalid values and invalidate merged geometry', () => {
  for (const patch of [{ arcAngle: 0 }, { arcAngle: 361 }, { arcAngle: null }, { crescentDepth: -1 }, { crescentDepth: 96 }, { crescentDepth: '55' }]) {
    assert.throws(() => validateDocument({ ...createDocument(), layers: [{ ...layer, ...patch }] }));
  }
  for (const [type, key, a, b] of [['fan', 'arcAngle', 45, 120], ['crescent', 'crescentDepth', 20, 80]]) {
    const l = { ...layer, type, mergeOverlap: true, divisions: 2, rx: 30, ry: 30 };
    assert.notEqual(renderArtwork([{ ...l, [key]: a }]), renderArtwork([{ ...l, [key]: b }]));
  }
});

test('shape switches reset geometry while preserving placement and drawing settings', () => {
  const original = { ...layer, rx: 100, ry: 5, sides: 19, sharpness: .2, crescentDepth: 91, arcAngle: 305, rotation: 47, phase: 23, hideOverlap: true, mergeOverlap: true, strokeMode: 'custom' };
  const ratios = { circle: 1, ellipse: 1.4, leaf: 1.6, drop: 1.4, heart: 1.2, crescent: 1, fan: 1, polygon: 1, star: 1, pointed: 1.5 };
  for (const [type, ratio] of Object.entries(ratios)) {
    const updated = { ...original, ...globalThis.CircleGeometry.shapeDefaults(original, type) };
    assert.equal(updated.rx, 100);
    assert.equal(updated.ry, 100 * ratio);
    assert.equal(updated.sides, type === 'polygon' ? 6 : 5);
    assert.equal(updated.crescentDepth, 55);
    assert.equal(updated.arcAngle, 90);
    assert.ok(Math.abs(updated.sharpness - (type === 'star' ? 1.527864045 : 2.5)) < 1e-8);
    for (const key of ['x', 'y', 'rotation', 'phase', 'divisions', 'width', 'color', 'strokeMode', 'hideOverlap', 'mergeOverlap']) assert.equal(updated[key], original[key]);
    assert.deepEqual(validateDocument({ ...createDocument(), layers: [updated] }).layers[0], updated);
    const large = { ...original, ...globalThis.CircleGeometry.shapeDefaults({ ...original, rx: 380 }, type) };
    assert.ok(large.rx <= 380 && large.ry <= 380);
    assert.ok(Math.abs(large.ry / large.rx - ratio) < 1e-9);
  }
  assert.equal(original.ry, 5);
});

test('current documents require every setting and reject unsupported fields and ruler kinds', () => {
  const document = createDocument([layer]);
  assert.deepEqual(validateDocument(document), document);
  for (const key of Object.keys(document)) {
    const incomplete = { ...document }; delete incomplete[key];
    assert.throws(() => validateDocument(incomplete), key);
  }
  for (const key of Object.keys(layer)) {
    const incomplete = { ...layer }; delete incomplete[key];
    assert.throws(() => validateDocument(createDocument([incomplete])), key);
  }
  for (const type of Object.keys(globalThis.CircleGeometry.TYPES)) {
    assert.throws(() => validateDocument(createDocument([{ ...layer, type, mode: 'ruler' }])));
  }
  for (const type of ['line', 'curve']) {
    const ruler = { ...layer, type, mode: 'ruler' };
    assert.deepEqual(validateDocument(createDocument([ruler])).layers[0], ruler);
  }
  assert.throws(() => validateDocument({ ...document, unknown: true }));
  assert.throws(() => validateDocument(createDocument([{ ...layer, unknown: true }])));
  const empty = createDocument(); empty.layers.push(layer);
  assert.equal(createDocument().layers.length, 0);
});
