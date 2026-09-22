// Offline support. App shell: network-first with cache fallback. Audio: only from the
// "save for offline" cache (with proper Range support, which Safari needs), else network.
const V = "bm-v7";
const SHELL = [
  "./", "index.html", "css/app.css", "manifest.webmanifest",
  "js/app.js", "js/data.js", "js/store.js", "js/plan.js", "js/narrator.js", "js/ambient.js", "js/locate.js", "js/lab.js",
  "js/workers/tts-worker.js", "js/workers/vision-worker.js",
  "js/glossary.js", "js/tour.js", "js/reflect.js", "js/code.js", "js/teacher.js", "teacher.html", "data/glossary.json",
  "data/exhibition.json", "data/stickers.json", "data/emb-q4.json",
  "img/icon.svg", "img/icon-192.png", "favicon.ico",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("bm-v") && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function rangeFrom(resp, range) {
  const buf = await resp.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m[1] ? +m[1] : size - +m[2];
  let end = m[1] && m[2] ? +m[2] : size - 1;
  if (!m[1]) end = size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}

// Static hosts (GitHub Pages etc.) can't send COOP/COEP headers, so add them here:
// cross-origin isolation lets the on-device models use several CPU threads.
function isolate(r) {
  if (!r || r.status === 0 || r.headers.get("Cross-Origin-Embedder-Policy")) return r;
  const h = new Headers(r.headers);
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === location.origin) {
    e.respondWith(fetch(req).catch(() => caches.match("index.html", { ignoreSearch: true })).then(isolate));
    return;
  }

  if (url.origin === location.origin && url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3")) {
    e.respondWith((async () => {
      const cache = await caches.open("bm-audio-v1");
      const hit = await cache.match(url.pathname.replace(/^.*?\/audio\//, "audio/")) || await cache.match(req.url);
      if (!hit) return fetch(req);
      const range = req.headers.get("range");
      return range ? rangeFrom(hit, range) : hit;
    })());
    return;
  }
  if (url.origin === location.origin && !url.pathname.includes("/music/")) {
    // network-first (so content fixes show up immediately), cache as offline fallback
    e.respondWith((async () => {
      const cache = await caches.open(V);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
        if (r.ok && r.status === 200) cache.put(req, r.clone());
        return r;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
      }
    })());
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith((async () => {
      const cache = await caches.open("bm-cdn-v1");
      const hit = await cache.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) cache.put(req, r.clone());
      return r;
    })());
  }
  // huggingface model files are cached by transformers.js itself
});
