// Tiny persisted state + event bus. localStorage can throw (private mode), so everything is guarded.
const KEY = "bm-guide-v1";
const defaults = {
  path: "A",
  voice: "af_heart",
  engine: "studio", // studio | device | system
  systemVoice: "",
  rate: 1.1,
  ambient: "off", // off | arp | her (opt-in)
  ambientVol: 0.45,
  duck: true,
  pauseAtStops: false,
  walkGap: 8,
  favs: [],
  pos: null, // [x,y] in plan units 0..1
  posAt: 0,
  listened: {},
  seenHint: false,
  textScale: 1,
  uiZoom: 0,          // set when we compensate for Safari's desktop mode
  hideDesktopHint: false,
};

let state = { ...defaults };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...defaults, ...JSON.parse(raw) };
} catch {}

const subs = new Set();
export const store = {
  get: (k) => state[k],
  all: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    subs.forEach((fn) => fn(patch, state));
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  toggleFav(id) {
    const favs = state.favs.includes(id) ? state.favs.filter((x) => x !== id) : [...state.favs, id];
    this.set({ favs });
    return favs.includes(id);
  },
};

// Simple pub/sub for app-wide events (narrator progress, location, ...)
const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

// IndexedDB for remix images (blobs are too large for localStorage)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("bm-guide", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("remixes", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const remixes = {
  async all() {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const q = d.transaction("remixes").objectStore("remixes").getAll();
        q.onsuccess = () => res(q.result.sort((a, b) => b.at - a.at));
        q.onerror = () => rej(q.error);
      });
    } catch { return []; }
  },
  async put(item) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("remixes", "readwrite");
      t.objectStore("remixes").put(item);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  },
  async del(id) {
    const d = await db();
    return new Promise((res) => {
      const t = d.transaction("remixes", "readwrite");
      t.objectStore("remixes").delete(id);
      t.oncomplete = res;
    });
  },
};
