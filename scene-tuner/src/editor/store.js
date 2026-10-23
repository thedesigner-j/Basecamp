// Small persistence helpers. Settings go in localStorage; dropped files go in
// IndexedDB so a page reload keeps your renders loaded.

const LS_SETTINGS = 'scene-tuner:settings';
const LS_PRESETS = 'scene-tuner:presets';
const LS_EXPORT = 'scene-tuner:export';

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const loadSettings = () => readJSON(LS_SETTINGS, null);
export const saveSettings = (s) => writeJSON(LS_SETTINGS, s);
export const loadUserPresets = () => readJSON(LS_PRESETS, {});
export const saveUserPresets = (p) => writeJSON(LS_PRESETS, p);
export const loadExportPrefs = () => readJSON(LS_EXPORT, {});
export const saveExportPrefs = (p) => writeJSON(LS_EXPORT, p);

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('scene-tuner', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLayerFile(slot, record) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('files', 'readwrite');
      record ? tx.objectStore('files').put(record, slot) : tx.objectStore('files').delete(slot);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('could not store file', e); }
}

export async function loadLayerFile(slot) {
  try {
    const d = await db();
    return await new Promise((res) => {
      const req = d.transaction('files').objectStore('files').get(slot);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}
