import { Pane } from 'tweakpane';
import { SceneReveal, DEFAULT_SETTINGS } from '../runtime/scene-reveal.js';
import runtimeCode from '../../dist/scene-reveal.min.js?raw';
import { makeDemo } from './demo.js';
import { BUILTIN_PRESETS } from './presets.js';
import * as store from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- state
const settings = { ...DEFAULT_SETTINGS, ...(store.loadSettings() || {}) };
settings.showMask = false;
let userPresets = store.loadUserPresets();

const demo = { top: makeDemo('glass'), bottom: makeDemo('glow') };
// layer = { kind: 'demo'|'file', src, type, name, crop, file?, url? }
const layers = {
  top: { kind: 'demo', src: demo.top, type: 'image', name: 'Demo · glass', crop: 'full' },
  bottom: { kind: 'demo', src: demo.bottom, type: 'image', name: 'Demo · glow', crop: 'full' },
};

const fx = new SceneReveal($('#preview'), { settings, preserveDrawingBuffer: true });
window.fx = fx; // handy in the console
applyLayer('top');
applyLayer('bottom');

// ---------------------------------------------------------------- layers
function applyLayer(slot) {
  const L = layers[slot];
  fx.setLayer(slot, { src: L.src, type: L.type, crop: L.crop });
  renderSlot(slot);
}

function renderSlot(slot) {
  const L = layers[slot];
  const el = $(`.slot[data-slot="${slot}"]`);
  $('.name', el).textContent = L.name;
  $('.name', el).title = L.name;
  $('.crop', el).value = L.crop;
  const thumb = $('.thumb', el);
  thumb.innerHTML = '';
  if (L.kind === 'demo') {
    const c = document.createElement('canvas');
    c.width = 144; c.height = 96;
    c.getContext('2d').drawImage(L.src, 0, 0, 144, 96);
    thumb.append(c);
  } else if (L.type === 'video') {
    const v = document.createElement('video');
    Object.assign(v, { src: L.src, muted: true, loop: true, autoplay: true, playsInline: true });
    v.style.objectPosition = L.crop === 'bottom-half' ? 'center bottom' : L.crop === 'top-half' ? 'center top' : 'center';
    thumb.append(v);
  } else {
    const i = new Image();
    i.src = L.src;
    thumb.append(i);
  }
}

function fileType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? 'video' : 'image';
}

const objectUrls = new Map(); // file -> url (so a packed file shares one URL/texture)
function urlFor(file) {
  if (!objectUrls.has(file)) objectUrls.set(file, URL.createObjectURL(file));
  return objectUrls.get(file);
}

function setFile(slot, file, crop = 'full', persist = true) {
  layers[slot] = { kind: 'file', file, src: urlFor(file), type: fileType(file), name: file.name, crop };
  applyLayer(slot);
  if (persist) store.saveLayerFile(slot, { file, crop });
  // free URLs no longer used
  const used = new Set([layers.top.file, layers.bottom.file]);
  for (const [f, u] of objectUrls) if (!used.has(f)) { URL.revokeObjectURL(u); objectUrls.delete(f); }
  syncVideoControls();
}

function setPacked(file) {
  setFile('top', file, 'top-half');
  setFile('bottom', file, 'bottom-half');
}

function setDemo() {
  layers.top = { kind: 'demo', src: demo.top, type: 'image', name: 'Demo · glass', crop: 'full' };
  layers.bottom = { kind: 'demo', src: demo.bottom, type: 'image', name: 'Demo · glow', crop: 'full' };
  applyLayer('top');
  applyLayer('bottom');
  store.saveLayerFile('top', null);
  store.saveLayerFile('bottom', null);
}

for (const el of $$('.slot')) {
  const slot = el.dataset.slot;
  $('input[type=file]', el).addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) setFile(slot, f);
    e.target.value = '';
  });
  $('.crop', el).addEventListener('change', (e) => {
    layers[slot].crop = e.target.value;
    applyLayer(slot);
    if (layers[slot].file) store.saveLayerFile(slot, { file: layers[slot].file, crop: e.target.value });
  });
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.remove('over');
    document.body.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) setFile(slot, f);
  });
}
$('#packed-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) setPacked(f);
  e.target.value = '';
});
$('#swap').addEventListener('click', () => {
  [layers.top, layers.bottom] = [layers.bottom, layers.top];
  applyLayer('top');
  applyLayer('bottom');
  for (const s of ['top', 'bottom']) store.saveLayerFile(s, layers[s].file ? { file: layers[s].file, crop: layers[s].crop } : null);
});
$('#demo').addEventListener('click', setDemo);

// Drop onto the stage
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => /^(image|video)\//.test(f.type) || /\.(mp4|webm|mov|m4v|png|jpe?g|webp|avif|gif)$/i.test(f.name));
  if (!files.length) return;
  if (files.length >= 2) {
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFile('top', files[0]);
    setFile('bottom', files[1]);
  } else askSlot(files[0]);
});

function askSlot(file) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="dialog-inner"><header><h2>Use “${file.name.replace(/</g, '&lt;')}” as…</h2></header>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn primary" value="top">Top layer</button>
      <button class="btn" value="bottom">Bottom layer</button>
      ${fileType(file) === 'video' ? '<button class="btn" value="packed">Packed (top half / bottom half)</button>' : ''}
      <button class="btn ghost" value="">Cancel</button>
    </div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => {
    const v = d.returnValue;
    if (v === 'top' || v === 'bottom') setFile(v, file);
    else if (v === 'packed') setPacked(file);
    d.remove();
  });
  d.showModal();
}

// Restore files from the last session
(async () => {
  const top = await store.loadLayerFile('top');
  const bottom = await store.loadLayerFile('bottom');
  const same = (a, b) => a && b && a.file && b.file && a.file.name === b.file.name && a.file.size === b.file.size && a.file.lastModified === b.file.lastModified;
  // a packed video was stored twice; share one File so both layers use one video
  if (same(top, bottom)) bottom.file = top.file;
  if (top && top.file) setFile('top', top.file, top.crop || 'full', false);
  if (bottom && bottom.file) setFile('bottom', bottom.file, bottom.crop || 'full', false);
})();

// ---------------------------------------------------------------- frame / layout
const frameSel = $('#frame');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
frameSel.value = lsGet('scene-tuner:frame') || '16:9';
function layout() {
  const box = $('#frame-box');
  const stage = $('#stage');
  const v = frameSel.value;
  const cs = getComputedStyle(stage);
  const W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (v === 'fill') { box.style.width = `${W}px`; box.style.height = `${H}px`; return; }
  const [a, b] = v.split(':').map(Number);
  const r = a / b;
  let w = W, h = W / r;
  if (h > H) { h = H; w = H * r; }
  box.style.width = `${Math.floor(w)}px`;
  box.style.height = `${Math.floor(h)}px`;
}
frameSel.addEventListener('change', () => { lsSet('scene-tuner:frame', frameSel.value); layout(); });
new ResizeObserver(layout).observe($('#stage'));
layout();

$('#preview').addEventListener('pointermove', () => $('#hint').classList.add('gone'), { once: true });

// ---------------------------------------------------------------- panel
const pane = new Pane({ container: $('#pane') });

const ui = { preset: 'Liquid', presetName: '' };
function presetOptions() {
  const o = {};
  for (const k of Object.keys(BUILTIN_PRESETS)) o[k] = k;
  for (const k of Object.keys(userPresets)) o[`★ ${k}`] = `user:${k}`;
  return o;
}

const fPresets = pane.addFolder({ title: 'Presets' });
let presetList;
function buildPresetList() {
  if (presetList) presetList.dispose();
  presetList = fPresets.addBinding(ui, 'preset', { label: 'Preset', options: presetOptions(), index: 0 });
  presetList.on('change', (ev) => loadPreset(ev.value));
}
buildPresetList();
fPresets.addBinding(ui, 'presetName', { label: 'Name' });
fPresets.addButton({ title: 'Save current as preset' }).on('click', () => {
  const name = (ui.presetName || '').trim() || `Preset ${Object.keys(userPresets).length + 1}`;
  userPresets[name] = exportableSettings();
  store.saveUserPresets(userPresets);
  ui.preset = `user:${name}`;
  buildPresetList();
  pane.refresh();
});
fPresets.addButton({ title: 'Delete selected preset' }).on('click', () => {
  if (!ui.preset.startsWith('user:')) return;
  delete userPresets[ui.preset.slice(5)];
  store.saveUserPresets(userPresets);
  ui.preset = 'Liquid';
  buildPresetList();
  pane.refresh();
});
fPresets.addButton({ title: 'Reset to defaults' }).on('click', () => applySettings({ ...DEFAULT_SETTINGS }));
fPresets.addButton({ title: 'Download presets (.json)' }).on('click', () => download('scene-tuner-presets.json', JSON.stringify({ current: exportableSettings(), presets: userPresets }, null, 2)));
fPresets.addButton({ title: 'Load presets / settings (.json)' }).on('click', () => pickJSON((data) => {
  if (data.presets) { userPresets = { ...userPresets, ...data.presets }; store.saveUserPresets(userPresets); buildPresetList(); }
  const s = data.current || data.settings || (data.radius !== undefined ? data : null);
  if (s) applySettings({ ...DEFAULT_SETTINGS, ...s });
}));

function loadPreset(id) {
  const p = id.startsWith('user:') ? userPresets[id.slice(5)] : BUILTIN_PRESETS[id];
  if (!p) return;
  applySettings({ ...DEFAULT_SETTINGS, ...p });
}

function applySettings(next) {
  next.showMask = settings.showMask;
  Object.assign(settings, next);
  fx.set(settings);
  store.saveSettings(exportableSettings());
  pane.refresh();
}

const add = (folder, key, opts) => folder.addBinding(settings, key, opts);

const fReveal = pane.addFolder({ title: 'Reveal' });
add(fReveal, 'radius', { label: 'Radius (px)', min: 10, max: 600, step: 1 });
add(fReveal, 'softness', { label: 'Edge softness', min: 0, max: 1, step: 0.01 });
add(fReveal, 'opacity', { label: 'Opacity', min: 0, max: 1, step: 0.01 });
add(fReveal, 'scaleWithWidth', { label: 'Scale w/ width' });

const fTime = pane.addFolder({ title: 'Timing' });
add(fTime, 'hold', { label: 'Hold (s)', min: 0, max: 10, step: 0.05 });
add(fTime, 'fade', { label: 'Fade back (s)', min: 0, max: 10, step: 0.05 });
add(fTime, 'fadeCurve', { label: 'Fade curve', options: { Smooth: 'smooth', Linear: 'linear', 'Quick drop': 'quick', Linger: 'linger' } });

const fCursor = pane.addFolder({ title: 'Cursor' });
add(fCursor, 'smoothing', { label: 'Follow lag', min: 0, max: 0.95, step: 0.01 });
add(fCursor, 'paintWhenStill', { label: 'Open when still' });
add(fCursor, 'speedGrow', { label: 'Grow w/ speed', min: 0, max: 1, step: 0.01 });
add(fCursor, 'speedMax', { label: 'Max growth', min: 1, max: 4, step: 0.05 });

const fEdge = pane.addFolder({ title: 'Edge' });
add(fEdge, 'edgeNoise', { label: 'Wobble', min: 0, max: 1.5, step: 0.01 });
add(fEdge, 'noiseScale', { label: 'Wobble size', min: 0.5, max: 12, step: 0.1 });
add(fEdge, 'noiseSpeed', { label: 'Wobble speed', min: 0, max: 2, step: 0.01 });
add(fEdge, 'ripple', { label: 'Refraction', min: 0, max: 2, step: 0.01 });
add(fEdge, 'rim', { label: 'Rim light', min: 0, max: 2, step: 0.01 });
add(fEdge, 'rimColor', { label: 'Rim color' });

const fLook = pane.addFolder({ title: 'Look' });
add(fLook, 'glow', { label: 'Glow boost', min: 0, max: 2, step: 0.01 });
add(fLook, 'fit', { label: 'Fit', options: { Cover: 'cover', Contain: 'contain' } });

const fIdle = pane.addFolder({ title: 'Idle & mobile', expanded: false });
add(fIdle, 'idleWander', { label: 'Auto-wander' });
add(fIdle, 'idleDelay', { label: 'Start after (s)', min: 0, max: 15, step: 0.5 });
add(fIdle, 'wanderSpeed', { label: 'Wander speed', min: 0.02, max: 1.5, step: 0.01 });
add(fIdle, 'touch', { label: 'Touch reveals' });

const fQuality = pane.addFolder({ title: 'Quality', expanded: false });
add(fQuality, 'maskScale', { label: 'Mask res', min: 0.15, max: 1, step: 0.05 });
add(fQuality, 'maxDpr', { label: 'Max pixel ratio', min: 1, max: 3, step: 0.25 });

const video = { playing: true, speed: 1 };
const fVideo = pane.addFolder({ title: 'Video', expanded: false });
fVideo.addBinding(video, 'playing', { label: 'Playing' }).on('change', syncVideoControls);
fVideo.addBinding(video, 'speed', { label: 'Speed', min: 0.1, max: 2, step: 0.05 }).on('change', syncVideoControls);
fVideo.addButton({ title: 'Restart' }).on('click', () => fx.getVideos().forEach((v) => { v.currentTime = 0; }));
add(fVideo, 'syncVideos', { label: 'Sync 2 videos' });
function syncVideoControls() {
  setTimeout(() => fx.getVideos().forEach((v) => {
    v.playbackRate = video.speed;
    video.playing ? v.play().catch(() => {}) : v.pause();
  }), 0);
}

const fDebug = pane.addFolder({ title: 'Debug', expanded: false });
add(fDebug, 'showMask', { label: 'Show mask (M)' });
fDebug.addButton({ title: 'Clear mask' }).on('click', () => fx.clearMask());

pane.on('change', (ev) => {
  if (ev.target === presetList) return;
  fx.set(settings);
  store.saveSettings(exportableSettings());
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'm' || e.key === 'M') { settings.showMask = !settings.showMask; fx.set(settings); pane.refresh(); }
});

setInterval(() => { $('#fps').textContent = `${fx.stats.fps} fps`; }, 500);

// ---------------------------------------------------------------- export
function exportableSettings() {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k !== 'showMask') out[k] = settings[k];
  return out;
}

const exportPrefs = { mode: 'inline', height: '100vh', top: '', bottom: '', scriptUrl: '', ...store.loadExportPrefs() };
const isPacked = () => layers.top.file && layers.top.file === layers.bottom.file;

function buildConfig() {
  const top = $('#url-top').value.trim() || 'PASTE_TOP_URL';
  const bottom = isPacked() ? top : $('#url-bottom').value.trim() || 'PASTE_BOTTOM_URL';
  return {
    layers: { top: { src: top, crop: layers.top.crop }, bottom: { src: bottom, crop: layers.bottom.crop } },
    settings: exportableSettings(),
  };
}

function refreshExport() {
  const packed = isPacked();
  $('#url-bottom').disabled = packed;
  $('#url-bottom').placeholder = packed ? 'Packed video: uses the top URL' : 'https://…/glow.mp4';
  const mode = $('input[name=script-mode]:checked').value;
  $('#script-url-field').hidden = mode !== 'url';
  const h = $('#ex-height').value.trim() || '100vh';
  const sizing = h === 'fill' ? 'position:absolute;inset:0;' : `position:relative;width:100%;height:${h};`;
  const cfg = JSON.stringify(buildConfig(), null, 1).replace(/<\//g, '<\\/');
  $('#code-embed').value = `<div data-scene-reveal style="${sizing}overflow:hidden;">\n<script type="application/json">\n${cfg}\n</script>\n</div>`;
  const url = $('#script-url').value.trim() || 'PASTE_SCRIPT_URL';
  $('#code-script').value = mode === 'inline'
    ? `<script>\n${runtimeCode.trim()}\n</script>`
    : `<script src="${url}" defer></script>`;
  store.saveExportPrefs({
    mode, height: h, top: $('#url-top').value, bottom: $('#url-bottom').value, scriptUrl: $('#script-url').value,
  });
}

$('#url-top').value = exportPrefs.top;
$('#url-bottom').value = exportPrefs.bottom;
$('#ex-height').value = exportPrefs.height;
$('#script-url').value = exportPrefs.scriptUrl;
$(`input[name=script-mode][value=${exportPrefs.mode === 'url' ? 'url' : 'inline'}]`).checked = true;
$$('#export-dialog input').forEach((i) => i.addEventListener('input', refreshExport));
$('#export-btn').addEventListener('click', () => { refreshExport(); $('#export-dialog').showModal(); });
$$('.copy').forEach((b) => b.addEventListener('click', async () => {
  const ta = $(`#${b.dataset.target}`);
  ta.select();
  try { await navigator.clipboard.writeText(ta.value); } catch { document.execCommand('copy'); }
  b.textContent = 'Copied';
  setTimeout(() => { b.textContent = 'Copy'; }, 1200);
}));
$('#dl-config').addEventListener('click', () => download('settings.json', JSON.stringify(buildConfig(), null, 2)));
$('#dl-runtime').addEventListener('click', () => download('scene-reveal.min.js', runtimeCode));

// ---------------------------------------------------------------- utils
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function pickJSON(cb) {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = 'application/json,.json';
  i.onchange = async () => {
    try { cb(JSON.parse(await i.files[0].text())); } catch (e) { alert(`Could not read that file: ${e.message}`); }
  };
  i.click();
}
