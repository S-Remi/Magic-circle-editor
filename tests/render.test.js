import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import '../web/geometry.js';

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'magic-circle-render-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Match the standalone download workflow, without package.json or dependencies.
  for (const name of ['geometry.js', 'render.mjs']) copyFileSync(new URL(`../web/${name}`, import.meta.url), join(dir, name));
  return {
    read: name => readFileSync(join(dir, name), 'utf8'),
    files: () => readdirSync(dir),
    run(recipe, ...args) {
      writeFileSync(join(dir, 'recipe.json'), JSON.stringify(recipe));
      return spawnSync(process.execPath, ['render.mjs', 'recipe.json', ...args], { cwd: dir, encoding: 'utf8' });
    }
  };
}

test('CLI writes editable freehand cubics with rotational copies', t => {
  const w = workspace(t);
  const curves = [[0, -1], [1, -1], [-1, 1], [0, 1]];
  const result = w.run([{ type: 'freehand', curves, divisions: 8, y: -120, rx: 30, ry: 60 }]);
  assert.equal(result.status, 0, result.stderr);
  const doc = globalThis.CircleGeometry.validateDocument(JSON.parse(w.read('magic-circle.json')));
  assert.equal(doc.layers[0].mode, 'freehand');
  assert.deepEqual(doc.layers[0].curves, curves);
  const svg = w.read('magic-circle.svg');
  assert.match(svg, /d="M0.000 -180.000 C30.000 -180.000 -30.000 -60.000 0.000 -60.000"/);
  assert.equal((svg.match(/<g transform="rotate/g) || []).length, 8);
});

test('standalone CLI creates editor-compatible JSON and SVG from a short recipe', t => {
  const w = workspace(t);
  const result = w.run([{ type: 'circle', rx: 320 }, { type: 'crescent', y: -220, rx: 30, divisions: 8 }, { type: 'star', rx: 100 }]);
  assert.equal(result.status, 0, result.stderr);
  const doc = JSON.parse(w.read('magic-circle.json'));
  assert.deepEqual(globalThis.CircleGeometry.validateDocument(doc), doc);
  assert.equal(doc.layers.length, 3);
  assert.equal(new Set(doc.layers.map(layer => layer.id)).size, 3);
  assert.equal(doc.layers[1].ry, 30);
  assert.equal(doc.layers[2].sides, 5);
  const svg = w.read('magic-circle.svg');
  assert.match(svg, /xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink"/);
  assert.match(svg, /width="2048" height="2048"/);
  assert.match(svg, /<rect[^>]+fill="#ffffff"/);
  assert.match(svg, /href="#artwork-outline-1" xlink:href="#artwork-outline-1"/);
});

test('settings preserve explicit geometry, infer rulers and apply custom strokes', t => {
  const w = workspace(t);
  const result = w.run({
    size: 1024, transparent: true, globalColor: '#123456', globalWidth: 2, backgroundColor: '#abcdef',
    layers: [
      { type: 'ellipse', rx: 30, ry: 80, hideOverlap: true },
      { type: 'line', color: '#ff0000' },
      { type: 'leaf', width: 4, divisions: 3, mergeOverlap: true },
      { type: 'star', color: '#00ff00', strokeMode: 'default', clip: true, divisions: 3 }
    ]
  }, 'custom');
  assert.equal(result.status, 0, result.stderr);
  const doc = globalThis.CircleGeometry.validateDocument(JSON.parse(w.read('custom.json')));
  assert.equal(doc.layers[0].ry, 80);
  assert.equal(doc.layers[1].mode, 'ruler');
  assert.equal(doc.layers[1].strokeMode, 'custom');
  assert.equal(doc.layers[1].width, 2);
  assert.equal(doc.layers[2].color, '#123456');
  assert.equal(doc.layers[3].strokeMode, 'default');
  const svg = w.read('custom.svg');
  assert.match(svg, /width="1024" height="1024"/);
  assert.doesNotMatch(svg, /fill="#abcdef"/);
  assert.match(svg, /stroke="#ff0000" stroke-width="2"/);
  assert.match(svg, /stroke="#123456" stroke-width="4"/);
  assert.doesNotMatch(svg, /stroke="#00ff00"/);
  assert.match(svg, /<mask/);
  assert.match(svg, /clip-path=/);
});

test('CLI exports directional overlap on a transparent background and preserves settings', t => {
  const w = workspace(t);
  for (const mergeOverlap of ['clockwise', 'counterclockwise']) {
    const result = w.run({ transparent: true, layers: [{ type: 'circle', y: -60, rx: 90, divisions: 4, mergeOverlap }] });
    assert.equal(result.status, 0, result.stderr);
    const doc = globalThis.CircleGeometry.validateDocument(JSON.parse(w.read('magic-circle.json')));
    assert.equal(doc.layers[0].mergeOverlap, mergeOverlap);
    const svg = w.read('magic-circle.svg');
    assert.ok(svg.includes(globalThis.CircleGeometry.mergedOutline(doc.layers[0], true)));
    assert.doesNotMatch(svg, /same-overlap/);
    assert.doesNotMatch(svg.replace(/<mask\b.*?<\/mask>/g, ''), /<rect/);
  }
});

test('invalid recipes fail without producing output files', t => {
  const w = workspace(t);
  for (const recipe of [null, {}, [null], [{ type: 'unknown' }], [{ rx: -1 }], [{ colour: '#000000' }],
    [{ color: 'url(https://invalid)' }], [{ id: 'same' }, { id: 'same' }],
    { layers: [], size: 0 }, { layers: [], transparent: 'true' }, { layers: [], globalColor: null },
    { layers: [], unexpected: true }, Array.from({ length: 81 }, () => ({}))]) {
    const result = w.run(recipe);
    assert.equal(result.status, 1, JSON.stringify(recipe));
    assert.ok(result.stderr.trim());
    assert.deepEqual(w.files().sort(), ['geometry.js', 'recipe.json', 'render.mjs']);
  }
});

test('CLI refuses to overwrite the input recipe', t => {
  const w = workspace(t);
  const recipe = [{ type: 'star' }];
  assert.equal(w.run(recipe, 'recipe').status, 1);
  assert.deepEqual(JSON.parse(w.read('recipe.json')), recipe);
  assert.ok(!w.files().includes('recipe.svg'));
});
