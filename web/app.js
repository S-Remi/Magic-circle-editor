(() => {
'use strict';
const { TYPES, fitFreehand, LIMITS, SHAPE_DEFAULTS, shapeDefaults, resolveStroke, point, sector, renderArtwork, outlinePoints, fitToSector, snapPosition, snapAngle, createDocument, validateDocument } = globalThis.CircleGeometry;
const $ = id => document.getElementById(id);
const KEY = 'magic-circle-editor-v1';
const icons = { freehand: '〰', circle: '○', ellipse: '⬭', leaf: '❧', drop: '♢', heart: '♡', crescent: '☾', fan: '◔', polygon: '⬡', star: '✧', pointed: '◇' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const base = (overrides = {}) => ({ id: crypto.randomUUID(), mode: 'shape', strokeMode: 'default', type: 'circle', divisions: 1, width: 1.5, x: 0, y: 0, rx: 290, ry: 130, rotation: 0, phase: 0, sides: 5, sharpness: 2.5, start: 0, end: 75, color: '#000000', clip: false, hideOverlap: false, mergeOverlap: false, visible: true, ...SHAPE_DEFAULTS, ...overrides });
const example = () => createDocument([
  base({ rx: 342, ry: 342, strokeMode: 'custom', width: 2.5 }),
  base({ rx: 333, ry: 333, strokeMode: 'custom', width: .75 }),
  // Eight fan-shaped panels form the outer band; the inner ring masks their spokes.
  base({ type: 'fan', rx: 322, ry: 322, arcAngle: 32, divisions: 8, hideOverlap: true }),
  base({ rx: 276, ry: 276 }),
  // A slim diamond and two beads sit inside each outer panel.
  base({ type: 'pointed', y: -299, rx: 7, ry: 14, sharpness: 2, divisions: 8 }),
  base({ y: -299, rx: 4, ry: 4, divisions: 8, phase: -8 }),
  base({ y: -299, rx: 4, ry: 4, divisions: 8, phase: 8 }),
  base({ type: 'drop', y: -303, rx: 11, ry: 20, divisions: 8, phase: 22.5 }),
  base({ type: 'crescent', y: -234, rx: 28, ry: 38, rotation: 90, crescentDepth: 65, divisions: 8 }),
  base({ type: 'polygon', y: -246, rx: 7, ry: 7, sides: 4, divisions: 8, phase: 22.5 }),
  base({ rx: 209, ry: 209, strokeMode: 'custom', width: .75 }),
  base({ type: 'heart', y: -168, rx: 27, ry: 34, rotation: 180, divisions: 8 }),
  base({ type: 'pointed', y: -164, rx: 8, ry: 25, sharpness: 2.5, divisions: 8, phase: 22.5 }),
  // Merge the leaves into one rosette, leaving breathing room around the central seal.
  base({ type: 'leaf', y: -69, rx: 34, ry: 69, divisions: 8, mergeOverlap: true }),
  base({ type: 'leaf', y: -58, rx: 24, ry: 58, divisions: 8, mergeOverlap: true, strokeMode: 'custom', width: .75 }),
  base({ rx: 49, ry: 49, strokeMode: 'custom', width: 2 }),
  base({ type: 'star', rx: 38, ry: 38, sides: 8, sharpness: 2.4, phase: 22.5 }),
  base({ rx: 12, ry: 12 }),
  base({ type: 'polygon', rx: 5, ry: 5, sides: 4 })
]);
const exampleSelection = layers => layers.find(l => l.type === 'crescent')?.id;
let doc = example(), selected = exampleSelection(doc.layers), undo = [], redo = [], drawing = false, stroke = null, toastTimer, drag = null;
try { const saved = localStorage.getItem(KEY); if (saved) { doc = loadDocument(JSON.parse(saved)); selected = doc.layers.at(-1)?.id; } } catch { notify('自動保存データを読み込めませんでした。作例を表示します。'); }
function loadDocument(data) {
  const loaded = validateDocument(data);
  loaded.layers = loaded.layers.map(l => {
    if (l.mode !== 'ruler') return l;
    const start = l.start / 100;
    let end = l.end / 100;
    if (end < start && l.type !== 'line') end++;
    const count = l.type === 'line' ? 2 : 361;
    const patch = fitFreehand(Array.from({ length: count }, (_, i) => point(l, start + (end - start) * i / (count - 1))), .3);
    return { ...l, ...(patch || { mode: 'freehand', type: 'freehand', curves: [[0, 0], [0, 0], [0, 0], [0, 0]] }), mergeOverlap: false };
  });
  return loaded;
}
function strokePoint(event) {
  const p = pointerPosition(event);
  const q = unphase({ x: Math.max(-400, Math.min(400, p.x)), y: Math.max(-400, Math.min(400, p.y)) }, stroke.layer.phase);
  return [q.x, q.y];
}
function beginStroke(event) {
  const l = current();
  if (stroke || drag || !l?.visible || l.mode !== 'freehand' || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  stroke = { id: event.pointerId, layer: l, points: [], before: snapshot(), preview: null };
  stroke.points.push(strokePoint(event));
  $('canvas').setPointerCapture(event.pointerId);
}
function updateStroke(event) {
  if (!stroke || event.pointerId !== stroke.id) return;
  event.preventDefault?.();
  for (const sample of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) {
    const p = strokePoint(sample), last = stroke.points.at(-1);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) stroke.points.push(p);
  }
  // Bound fitting work during long strokes while retaining both endpoints.
  if (stroke.points.length > 1024) stroke.points = stroke.points.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  const patch = fitFreehand(stroke.points, 2.5, 10);
  if (patch) stroke.preview = { ...stroke.layer, ...patch };
  renderCanvas();
}
function endStroke(event, cancelled = false) {
  if (!stroke || event.pointerId !== stroke.id) return;
  if (!cancelled && Number.isFinite(event.clientX)) updateStroke(event);
  const finished = stroke;
  stroke = null;
  if (!cancelled && finished.preview) {
    undo.push(finished.before); if (undo.length > 80) undo.shift(); redo = [];
    Object.assign(finished.layer, finished.preview); drawing = false;
  }
  if ($('canvas').hasPointerCapture(finished.id)) $('canvas').releasePointerCapture(finished.id);
  changed();
}
function artworkLayers() { return doc.layers.map(l => resolveStroke(stroke?.preview && l.id === stroke.layer.id ? stroke.preview : l, doc)); }
function layerLabel(l) { return `${(l.mode === 'freehand' ? '自由曲線' : TYPES[l.type])} ${doc.layers.indexOf(l) + 1}`; }
function current() { return doc.layers.find(l => l.id === selected); }
function notify(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function snapshot() { return JSON.stringify({ doc, selected }); }
function remember() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo = []; }
let saveFailed = false;
function persist() { try { localStorage.setItem(KEY, JSON.stringify(doc)); saveFailed = false; } catch { if (!saveFailed) notify('自動保存できません。データ保存を利用してください。'); saveFailed = true; } }
function changed() { persist(); render(); }
function history(from, to) { if (stroke || drag) return; drawing = false; if (!from.length) return; to.push(snapshot()); const state = JSON.parse(from.pop()); doc = state.doc; selected = state.selected; changed(); }
function render() {
  if (current()?.mode !== 'freehand') drawing = false;
  const active = current();
  $('selection-label').textContent = active ? `選択中：${layerLabel(active)}${active.visible ? '' : '（非表示）'}` : 'レイヤー未選択';
  $('all-color').value = doc.globalColor;
  $('all-width').value = doc.globalWidth;
  $('background-color').value = doc.backgroundColor;
  $('layer-count').textContent = String(doc.layers.length).padStart(2, '0');
  $('layers').innerHTML = [...doc.layers].reverse().map(l => `<div class="layer-row ${selected === l.id ? 'selected' : ''}"><button class="layer-select" data-select="${escape(l.id)}" aria-pressed="${selected === l.id}"><span class="layer-icon">${icons[l.type]}</span><span class="layer-text"><strong>${escape(layerLabel(l))}</strong><small>${l.mode === 'freehand' ? '自由曲線' : '図形'} / ${l.divisions} 分割</small></span></button><button class="visibility" data-visible="${escape(l.id)}" aria-label="${escape(layerLabel(l))}を${l.visible ? '非表示' : '表示'}" title="表示切り替え">${l.visible ? '◉' : '○'}</button></div>`).join('') || '<p class="empty">図形や自由曲線を追加して<br>描き始めましょう。</p>';
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  for (const id of ['duplicate', 'delete', 'up', 'down']) $(id).disabled = !current();
  $('up').disabled = !current() || doc.layers.indexOf(current()) === doc.layers.length - 1;
  $('down').disabled = !current() || doc.layers.indexOf(current()) === 0;
  renderProperties(); renderCanvas();
}
function field(label, key, step = 1) { const l = current(), range = LIMITS[key]; return `<label class="field">${label}<input data-key="${key}" type="number" min="${range[0]}" max="${range[1]}" step="${step}" value="${Number(l[key].toFixed(3))}"></label>`; }
function renderProperties() {
  const l = current();
  if (!l) { $('properties').innerHTML = '<p class="empty">レイヤーを選択すると、<br>ここで形を編集できます。</p>'; return; }
  $('properties').innerHTML = `${l.mode === 'freehand' ? `<button id="draw-curve" aria-pressed="${drawing}">${drawing ? '描画を終了' : '曲線を描き直す'}</button><button id="smooth-curve">もっとなめらかにする</button><p class="hint">${drawing ? 'キャンバスをドラッグして描きます。離すと確定、Escで中止。' : '描き直すと、このレイヤーの曲線を置き換えます。'}</p>` : `<label class="field">図形の種類<select data-key="type">${Object.entries(TYPES).map(([key, name]) => `<option value="${key}" ${l.type === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`}${l.type === 'crescent' ? field('欠けの深さ %', 'crescentDepth') : ''}${l.type === 'fan' ? field('開き角度 °', 'arcAngle') : ''}${['polygon', 'star'].includes(l.type) ? field('頂点の数', 'sides') : ''}${['pointed', 'star'].includes(l.type) ? field(l.type === 'star' ? '内側の大きさ（小さいほど鋭い）' : '尖り（1 = 楕円 / 2 = 菱形）', 'sharpness', .05) : ''}
  <div class="property-section"><div class="section-title">REPEAT / 分割</div><div class="field-pair">${field('分割数', 'divisions')}${field('開始角度 °', 'phase')}</div><label class="field">分割の境界<select data-key="clip"><option value="false" ${!l.clip ? 'selected' : ''}>はみ出す</option><option value="true" ${l.clip ? 'selected' : ''}>はみ出さない</option></select></label></div>
  <div class="property-section"><div class="section-title">LAYERS / 重なり</div><label class="field">上位レイヤーとの重なり<select data-key="hideOverlap"><option value="false" ${!l.hideOverlap ? 'selected' : ''}>隠さない</option><option value="true" ${l.hideOverlap ? 'selected' : ''}>隠す</option></select></label><p class="hint">上位の図形の内側に入った、このレイヤーの線を隠します。上位が自由曲線なら線の交差部分が対象です。</p><label class="field">同レイヤーとの重なり<select data-key="mergeOverlap" ${l.mode === 'freehand' ? 'disabled' : ''}><option value="false" ${!l.mergeOverlap ? 'selected' : ''}>隠さない</option><option value="true" ${l.mergeOverlap === true ? 'selected' : ''}>隠す（合体）</option><option value="clockwise" ${l.mergeOverlap === 'clockwise' ? 'selected' : ''}>時計回りに上に重ねる</option><option value="counterclockwise" ${l.mergeOverlap === 'counterclockwise' ? 'selected' : ''}>反時計回りに上に重ねる</option></select></label><p class="hint">${l.mode === 'freehand' ? '自由曲線には内側の面がないため、同レイヤーの重なり設定は図形で利用できます。' : '合体は内側の線を消して外周を残します。方向を選ぶと、その方向へ順に上に重ねます。3分割以上では、最後と最初も同じ順序で一周つながります。分割の境界が「はみ出さない」のときは重なりません。'}</p></div>
  <div class="property-section"><div class="section-title">GEOMETRY / 形と位置</div><div class="placement-actions"><button id="center-layer">中心に配置</button><button id="fit-sector">区画に収める</button></div><div class="field-pair">${field('横位置 X', 'x')}${field('縦位置 Y', 'y')}</div><div class="field-pair">${field(l.type === 'line' ? '半分の長さ' : ['circle', 'polygon', 'fan'].includes(l.type) ? '半径' : '横半径', 'rx')}${!['circle', 'polygon', 'fan', 'line'].includes(l.type) ? field('縦半径', 'ry') : field('回転 °', 'rotation')}</div>${!['circle', 'polygon', 'fan', 'line'].includes(l.type) ? field('回転 °', 'rotation') : ''}</div>
  <div class="property-section"><div class="section-title">STROKE / 線</div><label class="field">線の設定<select data-key="strokeMode"><option value="default" ${l.strokeMode === 'default' ? 'selected' : ''}>デフォルト</option><option value="custom" ${l.strokeMode === 'custom' ? 'selected' : ''}>カスタム</option></select></label>${l.strokeMode === 'custom' ? `<div class="field-pair">${field('太さ', 'width', .25)}<label class="field">線色<input data-key="color" type="color" value="${l.color}"></label></div>` : '<p class="hint">ヘッダーの線色・太さを使用します。</p>'}</div><p class="hint">ハンドルを指・マウスでドラッグして、移動・半径・角度を調整できます。中心は固定、座標は 800 × 800 です。</p>`;
}
function renderCanvas() {
  const l = current() ? resolveStroke(current(), doc) : null;
  const scale = Math.max(.2, Math.abs($('canvas').getScreenCTM()?.a || .8));
  let guides = '';
  if ($('guides').checked) {
    guides = '<g fill="none" stroke="#587480" stroke-width=".6" opacity=".4"><circle r="350" stroke-dasharray="3 7"/><path d="M-370 0H370 M0-370V370" stroke-dasharray="3 7"/></g>';
    if (l && l.divisions > 1) guides += `<g transform="rotate(${l.phase})" fill="none" stroke="#ad985d" stroke-opacity=".3" stroke-width=".6"><path d="${sector(l.divisions)}"/>${Array.from({ length: l.divisions }, (_, i) => `<path transform="rotate(${i * 360 / l.divisions - 180 / l.divisions})" d="M0 0V-390" fill="none" stroke-dasharray="4 7"/>`).join('')}</g>`;
  }
  let handles = '';
  if (l?.visible && !drawing) {
    const angle = l.rotation * Math.PI / 180;
    const toLocal = (x, y) => [l.x + x * Math.cos(angle) - y * Math.sin(angle), l.y + x * Math.sin(angle) + y * Math.cos(angle)];
    const handle = (key, p, label, color = '#007a9e') => `<g data-handle="${key}" role="img" aria-label="${label}をドラッグ" style="cursor:${key === 'move' ? 'move' : 'grab'}"><circle cx="${p[0]}" cy="${p[1]}" r="${22 / scale}" fill="transparent" stroke="none"/><circle cx="${p[0]}" cy="${p[1]}" r="${5 / scale}" fill="#ffffff" stroke="${color}" stroke-width="${1.4 / scale}"/><text x="${p[0] + 9 / scale}" y="${p[1] - 9 / scale}" fill="${color}" stroke="none" font-size="${12 / scale}" pointer-events="none">${label}</text></g>`;
    const rx = toLocal(l.rx, 0), ry = toLocal(0, -l.ry), rot = toLocal(48 / scale, -(['circle', 'polygon', 'fan'].includes(l.type) ? l.rx : l.ry));
    handles = `<g transform="rotate(${l.phase})"><g fill="none" stroke="#007a9e" stroke-opacity=".5" stroke-width=".8" stroke-dasharray="3 5"><path d="M${l.x} ${l.y} L${rx.join(' ')} M${l.x} ${l.y} L${rot.join(' ')}"/></g>${handle('move', [l.x, l.y], '移動')}${handle('rx', rx, l.type === 'line' ? '半分の長さ' : ['circle', 'polygon', 'fan'].includes(l.type) ? '半径' : '横半径')}${!['circle', 'polygon', 'fan', 'line'].includes(l.type) ? handle('ry', ry, '縦半径') : ''}${handle('rotation', rot, '回転')}${handle('phase', [0, -365], '分割角度', '#956600')}</g>`;
  }
  const highlight = l?.visible && $('highlight').checked ? `<g id="selection-highlight" pointer-events="none"><g opacity=".22">${renderArtwork(artworkLayers(), 'selection-halo', { id: l.id, color: '#00a2cf', width: l.width + 7 / scale })}</g><g stroke-dasharray="${5 / scale} ${4 / scale}">${renderArtwork(artworkLayers(), 'selection-line', { id: l.id, color: '#006a9c', width: Math.max(l.width, 1.5 / scale) })}</g></g>` : '';
  const center = `<g id="canvas-center" pointer-events="none" transform="scale(${1 / scale})" aria-label="キャンバス中心 (0, 0)"><g fill="none" stroke="#ffffff" stroke-width="5"><circle r="9"/><path d="M-17 0H17 M0-17V17"/></g><g fill="none" stroke="#c32060" stroke-width="1.5"><circle r="9"/><path d="M-17 0H17 M0-17V17"/></g><text x="-14" y="32" text-anchor="end" font-size="12" fill="#a3154e" stroke="#ffffff" stroke-width="3" paint-order="stroke">中心 (0, 0)</text></g>`;
  $('canvas').style.backgroundColor = doc.backgroundColor;
  $('canvas').innerHTML = guides + renderArtwork(artworkLayers()) + highlight + handles + ($('center-guide').checked ? center : '');
  $('canvas').style.cursor = drawing ? 'crosshair' : 'default';
}
$('properties').addEventListener('change', event => {
  const key = event.target.dataset.key, l = current(); if (!key || !l) return;
  let value = event.target.value;
  if (LIMITS[key]) { const [min, max] = LIMITS[key]; value = Number(value); if (event.target.value === '' || !Number.isFinite(value)) { renderProperties(); return; } value = Math.max(min, Math.min(max, value)); if (['divisions', 'sides'].includes(key)) value = Math.round(value); }
  if (['clip', 'hideOverlap'].includes(key) || (key === 'mergeOverlap' && ['false', 'true'].includes(value))) value = value === 'true';
  if (l[key] === value) return;
  remember();
  if (key === 'type') {
    if (l.mode === 'shape') Object.assign(l, shapeDefaults(l, value));
    else l.type = value;
  } else l[key] = value;
  changed();
});
$('properties').addEventListener('click', event => {
  if (['center-layer', 'fit-sector'].includes(event.target.id) && current()) {
    const patch = event.target.id === 'center-layer' ? { x: 0, y: 0 } : fitToSector(resolveStroke(current(), doc));
    if (!patch) { notify('このサイズでは区画に収まりません。サイズか分割数を調整してください。'); return; }
    remember(); Object.assign(current(), patch); changed();
    notify(event.target.id === 'center-layer' ? '中心に配置しました。' : 'サイズを変えず、区画の中央に配置しました。');
    return;
  }
  if (event.target.id === 'draw-curve') { drawing = !drawing; render(); }
  if (event.target.id === 'smooth-curve' && current()?.mode === 'freehand') {
    const l = current(), local = { ...l, x: 0, y: 0, rotation: 0 };
    const count = Math.min(1024, l.curves.length * 12);
    const patch = fitFreehand(Array.from({ length: count }, (_, i) => point(local, i / (count - 1))), 2.5, 14);
    if (!patch) return;
    remember();
    l.curves = patch.curves.map(([x, y]) => [(x * patch.rx + patch.x) / l.rx, (y * patch.ry + patch.y) / l.ry]);
    drawing = false; changed();
  }
});
$('layers').addEventListener('click', event => {
  const select = event.target.closest('[data-select]'), visible = event.target.closest('[data-visible]');
  if (select) { selected = select.dataset.select; drawing = false; render(); }
  if (visible) { remember(); const l = doc.layers.find(l => l.id === visible.dataset.visible); l.visible = !l.visible; changed(); }
});
function pointerPosition(event) {
  const matrix = $('canvas').getScreenCTM();
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}
function unphase(p, phase) {
  const a = -phase * Math.PI / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}
function wrapAngle(angle) { return ((angle + 180) % 360 + 360) % 360 - 180; }
$('canvas').addEventListener('pointerdown', event => {
  if (drawing) { beginStroke(event); return; }
  let target = event.target.closest('[data-handle]');
  const l = current();
  if (!target || !l || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
  let nearest = Infinity;
  for (const candidate of $('canvas').querySelectorAll('[data-handle]')) {
    const circle = candidate.querySelector('circle');
    const p = new DOMPoint(Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))).matrixTransform(circle.getScreenCTM());
    const distance = Math.hypot(event.clientX - p.x, event.clientY - p.y);
    if (distance < nearest) { nearest = distance; target = candidate; }
  }
  event.preventDefault();
  const p = pointerPosition(event), local = unphase(p, l.phase);
  drag = { key: target.dataset.handle, id: event.pointerId, before: snapshot(), layer: { ...l }, p, local, points: outlinePoints(l), moved: false };
  $('canvas').setPointerCapture(event.pointerId);
});
$('canvas').addEventListener('pointermove', event => {
  if (stroke) { updateStroke(event); return; }
  if (!drag || event.pointerId !== drag.id) return;
  event.preventDefault();
  const l = current(), p = pointerPosition(event), origin = drag.layer, local = unphase(p, origin.phase);
  const clamp = (key, value) => Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], Math.round(value * 10) / 10));
  if (Math.hypot(p.x - drag.p.x, p.y - drag.p.y) < 1 && !drag.moved) return;
  drag.moved = true;
  if (drag.key === 'move') { l.x = clamp('x', origin.x + local.x - drag.local.x); l.y = clamp('y', origin.y + local.y - drag.local.y); }
  else if (drag.key === 'phase') {
    const delta = (Math.atan2(p.y, p.x) - Math.atan2(drag.p.y, drag.p.x)) * 180 / Math.PI;
    l.phase = clamp('phase', wrapAngle(origin.phase + delta));
  } else if (drag.key === 'rotation') {
    const delta = (Math.atan2(local.y - origin.y, local.x - origin.x) - Math.atan2(drag.local.y - origin.y, drag.local.x - origin.x)) * 180 / Math.PI;
    l.rotation = clamp('rotation', wrapAngle(origin.rotation + delta));
  } else {
    const v = unphase({ x: local.x - origin.x, y: local.y - origin.y }, origin.rotation);
    const start = unphase({ x: drag.local.x - origin.x, y: drag.local.y - origin.y }, origin.rotation);
    l[drag.key] = clamp(drag.key, origin[drag.key] + (drag.key === 'rx' ? v.x - start.x : start.y - v.y));
  }
  $('snap-status').textContent = '';
  if ($('snap').checked && !event.altKey && drag.key === 'move') {
    const scale = Math.max(.2, Math.abs($('canvas').getScreenCTM()?.a || 1));
    const snapped = snapPosition(resolveStroke(l, doc), l.x, l.y, 8 / scale, drag.points);
    l.x = snapped.x; l.y = snapped.y; $('snap-status').textContent = snapped.label;
  }
  if ($('snap').checked && !event.altKey && ['phase', 'rotation'].includes(drag.key)) {
    const snapped = snapAngle(l[drag.key], l.divisions);
    l[drag.key] = snapped.angle;
    if (snapped.snapped) $('snap-status').textContent = `${Number(snapped.angle.toFixed(3))}° に吸着`;
  }
  renderCanvas(); renderProperties();
});
function endDrag(event, cancelled = false) {
  if (stroke) { endStroke(event, cancelled); return; }
  if (!drag || event.pointerId !== drag.id) return;
  if (cancelled) { const previous = JSON.parse(drag.before); doc = previous.doc; selected = previous.selected; }
  else if (drag.moved) { undo.push(drag.before); if (undo.length > 80) undo.shift(); redo = []; }
  $('snap-status').textContent = '';
  const id = drag.id; drag = null;
  if ($('canvas').hasPointerCapture(id)) $('canvas').releasePointerCapture(id);
  changed();
}
$('canvas').addEventListener('pointerup', event => endDrag(event));
$('canvas').addEventListener('pointercancel', event => endDrag(event, true));
$('canvas').addEventListener('lostpointercapture', event => endDrag(event, true));
function add(mode) {
  if (doc.layers.length >= 80) { notify('レイヤーは80枚までです。'); return; }
  const divisions = current()?.divisions ?? 6;
  remember();
  const l = base({ mode, color: doc.globalColor, width: doc.globalWidth, type: 'circle', end: 100, rx: 100, ry: 100, y: -160, divisions });
  if (mode === 'freehand') Object.assign(l, { type: 'freehand', curves: [[0, 0], [0, 0], [0, 0], [0, 0]] });
  doc.layers.push(l); selected = l.id; drawing = mode === 'freehand'; changed();
}
$('add-shape').onclick = () => { drawing = false; add('shape'); };
$('add-freehand').onclick = () => add('freehand');
$('duplicate').onclick = () => { if (!current() || doc.layers.length >= 80) return; remember(); const l = { ...current(), id: crypto.randomUUID() }; doc.layers.push(l); selected = l.id; changed(); };
$('delete').onclick = () => { if (!current()) return; remember(); const i = doc.layers.indexOf(current()); doc.layers.splice(i, 1); selected = doc.layers[Math.min(i, doc.layers.length - 1)]?.id; changed(); };
function move(delta) { const i = doc.layers.indexOf(current()), j = i + delta; if (i < 0 || j < 0 || j >= doc.layers.length) return; remember(); [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]]; changed(); }
$('up').onclick = () => move(1); $('down').onclick = () => move(-1);
let pendingReplacement = null;
function requestReplacement(action) {
  pendingReplacement = action;
  const isNew = action === 'new';
  $('replace-title').textContent = isNew ? '新しく作りますか？' : '作例を読み込みますか？';
  $('replace-message').textContent = isNew ? '現在の内容が消え、空のキャンバスに置き換わります。' : '現在の内容が消え、作例に置き換わります。';
  $('replace-confirm').textContent = isNew ? '新しく作る' : '作例を読み込む';
  $('replace-dialog').returnValue = '';
  $('replace-dialog').showModal();
}
$('new').onclick = () => requestReplacement('new');
$('example').onclick = () => requestReplacement('example');
$('replace-dialog').addEventListener('close', () => {
  const action = pendingReplacement;
  pendingReplacement = null;
  if ($('replace-dialog').returnValue !== 'proceed' || !action) return;
  remember();
  doc = action === 'new' ? createDocument() : example();
  selected = action === 'new' ? undefined : exampleSelection(doc.layers);
  changed();
});
$('undo').onclick = () => history(undo, redo); $('redo').onclick = () => history(redo, undo);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && drawing) { if (stroke) endStroke({ pointerId: stroke.id }, true); drawing = false; render(); return; } if (event.target.matches('input,select,textarea') || document.querySelector('dialog[open]')) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? history(redo, undo) : history(undo, redo); } });
$('guides').onchange = renderCanvas;
$('center-guide').onchange = renderCanvas;
$('highlight').onchange = renderCanvas;
for (const [id, key] of [['all-color', 'globalColor'], ['all-width', 'globalWidth'], ['background-color', 'backgroundColor']]) {
  $(id).onchange = () => {
    let value = $(id).value;
    if (key === 'globalWidth') {
      if (value === '' || !Number.isFinite(Number(value))) { render(); return; }
      value = Math.max(LIMITS.width[0], Math.min(LIMITS.width[1], Number(value)));
    }
    if (doc[key] === value) return;
    remember();
    doc[key] = value;
    changed();
  };
}
function download(blob, filename) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
$('save').onclick = () => download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), 'magic-circle.json');
$('open').onclick = () => $('file-input').click();
$('file-input').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 1024 * 1024) throw new Error('ファイルは1MB以下にしてください。'); const loaded = loadDocument(JSON.parse(await file.text())); remember(); doc = loaded; selected = doc.layers.at(-1)?.id; changed(); notify('作成データを読み込みました。'); } catch (error) { notify('読み込めませんでした。' + error.message); } finally { event.target.value = ''; }
};
let previewScale = 100;
function zoomPreview(scale) {
  previewScale = Math.max(25, Math.min(400, scale));
  const size = 800 * 100 / previewScale;
  $('preview-canvas').setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
  $('preview-scale').textContent = `${previewScale}%`;
  $('preview-minus').disabled = previewScale === 25;
  $('preview-plus').disabled = previewScale === 400;
}
$('preview-minus').onclick = () => zoomPreview(previewScale - 25);
$('preview-plus').onclick = () => zoomPreview(previewScale + 25);
$('preview').onclick = () => {
  zoomPreview(100);
  $('preview-canvas').style.backgroundColor = doc.backgroundColor;
  $('preview-canvas').innerHTML = renderArtwork(artworkLayers(), 'preview');
  $('preview-dialog').showModal();
};
$('preview-dialog').addEventListener('close', () => { $('preview-canvas').innerHTML = ''; });
$('export').onclick = () => $('export-dialog').showModal();
$('download').onclick = async () => {
  const button = $('download'); button.disabled = true;
  let url;
  try {
    const size = Number($('export-size').value), transparent = $('transparent').checked;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="-400 -400 800 800">${transparent ? '' : `<rect x="-400" y="-400" width="800" height="800" fill="${doc.backgroundColor}"/>`}${renderArtwork(artworkLayers())}</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    if ($('export-format').value === 'svg') download(blob, 'magic-circle.svg');
    else {
      url = URL.createObjectURL(blob); const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!png) throw new Error('画像の生成に失敗しました。'); download(png, 'magic-circle.png');
    }
    $('export-dialog').close(); notify('画像を書き出しました。');
  } catch { notify('書き出しに失敗しました。サイズを小さくして再試行してください。'); }
  finally { if (url) URL.revokeObjectURL(url); button.disabled = false; }
};
window.addEventListener('resize', renderCanvas);
render();

})();
