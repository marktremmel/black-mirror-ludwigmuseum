// Loads exhibition.json and builds handy lookups.
export const D = {};

export async function loadData() {
  const res = await fetch("data/exhibition.json");
  const data = await res.json();
  Object.assign(D, data);
  D.byId = Object.fromEntries(data.artworks.map((a) => [a.id, a]));
  D.section = Object.fromEntries(data.sections.map((s) => [s.id, s]));
  D.pathOf = Object.fromEntries(data.paths.map((p) => [p.id, p]));
  D.thread = Object.fromEntries(data.threads.map((t) => [t.id, t]));
  D.place = Object.fromEntries(data.places.map((p) => [p.id, p]));
  D.order = {};
  data.paths.forEach((p) => p.stops.forEach((id, i) => (D.order[id] = i + 1)));
  return D;
}

// Plan distances: the building is 1.3x wider than tall, so scale x before measuring.
export const dist = (a, b) => Math.hypot((a[0] - b[0]) * 1.3, a[1] - b[1]);

export function nearest(pos, n = 5) {
  return D.artworks
    .map((a) => ({ a, d: dist(pos, a.pos) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, n);
}

export const colorOf = (sectionId) => D.section[sectionId]?.color || "#7fb2cf";

// "Studio" voices are pre-rendered with Kokoro-82M. Names are deliberately neutral:
// described by timbre + accent rather than by gender.
export const STUDIO_VOICES = [
  { id: "af_heart", name: "Halo", desc: "bright, warm, lighter · US", bars: [5, 9, 13, 10, 7, 11, 6] },
  { id: "bf_emma", name: "Linen", desc: "clear, crisp, lighter · UK", bars: [6, 11, 8, 12, 9, 7, 10] },
  { id: "am_michael", name: "Basalt", desc: "calm, round, deeper · US", bars: [9, 13, 15, 12, 14, 11, 9] },
  { id: "bm_george", name: "Oak", desc: "storyteller, deepest · UK", bars: [12, 15, 14, 16, 13, 15, 12] },
];
// Extra voices available when generating on the device.
export const DEVICE_VOICES = [
  ...STUDIO_VOICES,
  { id: "af_bella", name: "Honey", desc: "lively, animated, lighter · US" },
  { id: "af_nicole", name: "Hush", desc: "soft, close, whispery · US" },
  { id: "af_sky", name: "Mist", desc: "airy, light · US" },
  { id: "am_puck", name: "Spark", desc: "playful, mid · US" },
  { id: "am_fenrir", name: "Gravel", desc: "textured, low · US" },
  { id: "am_onyx", name: "Onyx", desc: "dark, low, slow · US" },
  { id: "bf_isabella", name: "Velvet", desc: "smooth, mid · UK" },
  { id: "bm_fable", name: "Fable", desc: "rich, mid-deep · UK" },
  { id: "bm_lewis", name: "Slate", desc: "dry, deep · UK" },
];
export const voiceName = (id) => DEVICE_VOICES.find((v) => v.id === id)?.name || id;
