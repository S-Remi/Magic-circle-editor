import './geometry.js';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const G = globalThis.CircleGeometry;
const maxBytes = 1024 * 1024;
const usage = '使い方: node render.mjs recipe.json [出力名（拡張子なし、既定: magic-circle）]';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function render(recipe) {
  const settings = Array.isArray(recipe) ? { layers: recipe } : recipe;
  const keys = ['layers', 'size', 'transparent', 'globalColor', 'globalWidth', 'backgroundColor'];
  if (!isObject(settings) || Object.keys(settings).some(key => !keys.includes(key)) || !Array.isArray(settings.layers)) {
    throw new Error('レシピは図形の配列、または layers 配列を含む設定オブジェクトにしてください。');
  }
  if (settings.layers.length > 80) throw new Error('レイヤーは80個までです。');
  const { size = 2048, transparent = false } = settings;
  if (!Number.isInteger(size) || size < 1 || size > 4096) throw new Error('size は1〜4096の整数にしてください。');
  if (typeof transparent !== 'boolean') throw new Error('transparent は true または false にしてください。');
  const layers = settings.layers.map((spec, index) => {
    try {
      if (!isObject(spec)) throw new Error('図形はオブジェクトで指定してください。');
      const type = spec.type === undefined ? 'circle' : spec.type;
      const mode = type === 'text' ? 'text' : type === 'freehand' ? 'freehand' : Object.hasOwn(G.RULER_TYPES, type) ? 'ruler' : 'shape';
      const layer = {
        id: randomUUID(), mode, type,
        strokeMode: Object.hasOwn(spec, 'color') || Object.hasOwn(spec, 'width') ? 'custom' : 'default',
        color: settings.globalColor ?? '#000000', width: settings.globalWidth ?? 1.5, visible: true,
        clip: false, hideOverlap: false, mergeOverlap: false,
        x: 0, y: 0, rx: 100, ry: 100, rotation: 0, phase: 0,
        divisions: 1, sides: 5, sharpness: 2.5, start: 0, end: 75,
        ...G.SHAPE_DEFAULTS
      };
      if (mode === 'shape') Object.assign(layer, G.shapeDefaults({ ...layer, ...spec }, type));
      if (mode === 'text') Object.assign(layer, G.TEXT_DEFAULTS, { rx: 310, ry: 310 });
      Object.assign(layer, spec);
      G.validateDocument(G.createDocument([layer]));
      return layer;
    } catch (error) {
      throw new Error(`layers[${index}]: ${error.message}`);
    }
  });
  const doc = G.createDocument(layers);
  for (const key of ['globalColor', 'globalWidth', 'backgroundColor']) {
    if (Object.hasOwn(settings, key)) doc[key] = settings[key];
  }
  G.validateDocument(doc);
  const json = JSON.stringify(doc, null, 2) + '\n';
  if (Buffer.byteLength(json) > maxBytes) throw new Error('編集用JSONがエディターの読み込み上限1MBを超えています。');
  const background = transparent ? '' : `<rect x="-400" y="-400" width="800" height="800" fill="${doc.backgroundColor}"/>`;
  const artwork = G.renderArtwork(doc.layers.map(layer => G.resolveStroke(layer, doc)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="-400 -400 800 800">${background}${artwork}</svg>\n`;
  return { json, svg };
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
  } else {
    if (args.length < 1 || args.length > 2) throw new Error(usage);
    const [input, output = 'magic-circle'] = args;
    const files = [`${output}.json`, `${output}.svg`];
    if (files.some(file => resolve(file) === resolve(input))) throw new Error('入力レシピと出力先は別の名前にしてください。');
    if (statSync(input).size > maxBytes) throw new Error('レシピの上限は1MBです。');
    const { json, svg } = render(JSON.parse(readFileSync(input, 'utf8')));
    writeFileSync(files[0], json);
    writeFileSync(files[1], svg);
    console.log(`生成しました: ${files.join(', ')}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
