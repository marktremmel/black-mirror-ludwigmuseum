// The narrator: one queue, three interchangeable voice engines.
//  - studio : Kokoro-82M audio pre-rendered on a laptop (instant, offline-able, low battery)
//  - device : the same Kokoro model generating live in a Web Worker (WebGPU / WASM)
//  - system : the phone's built-in speech voices (fallback)
// All engines report the current sentence so the text view can follow along.
import { D } from "./data.js";
import { store, emit } from "./store.js";

const SILENCE = { sentence: 120, paragraph: 450 };

export function segMeta(id) {
  if (!id) return null;
  const a = D.byId[id];
  if (a) return { title: a.title, sub: a.name, image: a.thumb, big: a.image, section: a.s, art: a.id };
  let m;
  if ((m = id.match(/^section-(\w)$/))) {
    const s = D.section[m[1]];
    const first = D.byId[D.pathOf[m[1]].stops[0]];
    return { title: `${s.id}. ${s.title}`, sub: "Path introduction", image: first.thumb, section: s.id };
  }
  if ((m = id.match(/^bridge-(\w)-(\d+)$/))) {
    const nxt = D.byId[D.pathOf[m[1]].stops[+m[2]]];
    return { title: `Next: ${nxt.title}`, sub: `Path ${m[1]} · on the move`, image: nxt.thumb, section: m[1], next: nxt.id };
  }
  if ((m = id.match(/^outro-(\w)$/))) return { title: `End of path ${m[1]}`, sub: D.section[m[1]].title, image: "img/icon-192.png", section: m[1] };
  if (id === "intro") return { title: "Welcome to Black Mirror", sub: "The wall text at the entrance", image: "img/icon-192.png", section: null };
  if (id === "paik") return { title: "Nam June Paik", sub: "At the entrance", image: "img/icon-192.png", section: null };
  return { title: id, sub: "", image: "img/icon-192.png" };
}

class Narrator {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.preservesPitch = true;
    this.audio.webkitPreservesPitch = true;
    this.queue = [];
    this.qi = 0;
    this.seg = null;
    this.sent = -1;
    this.playing = false;
    this.loading = false;
    this.mode = null;
    this.indexes = {};
    this.devCache = new Map();
    this.devPending = new Map();
    this.devDur = {};
    this.walkTimer = null;
    this.walking = null;
    this.warned = {};

    const a = this.audio;
    a.addEventListener("ended", () => this.onAudioEnded());
    a.addEventListener("playing", () => { this.loading = false; this.playing = true; this.emitState(); this.loop(); });
    a.addEventListener("waiting", () => { if (this.mode === "studio") { this.loading = true; this.emitState(); } });
    a.addEventListener("pause", () => { if (!this._internalPause) { this.playing = false; this.emitState(); } });
    a.addEventListener("error", () => {
      if (!a.src || this.mode !== "studio") return;
      this.fallback("That recording didn’t load, switching to another voice for now.");
    });
    this.setupMediaSession();
    this.loadIndex(store.get("voice"));
  }

  // ---------------------------------------------------------------- public api
  get current() { return this.queue[this.qi]; }
  get sentences() { return this.seg ? D.segments[this.seg].sentences : []; }

  play(segId) { this.playQueue([segId], 0); }

  playQueue(items, i = 0, label = null) {
    this.stopAll();
    this.queue = items;
    this.qi = i;
    this.queueLabel = label;
    this.startItem(0);
  }

  toggle() {
    if (this.walking) return this.endWalk();
    if (!this.seg) return;
    this.playing || this.loading ? this.pause() : this.resume();
  }

  pause() {
    this.playing = false;
    this.loading = false;
    if (this.mode === "system") speechSynthesis.cancel();
    else this.audio.pause();
    clearTimeout(this.gapTimer);
    this.emitState();
  }

  resume() {
    if (!this.seg) return;
    if (this.mode === "studio") {
      // the element may still hold the previous voice's file: reload at the current sentence
      if (this.srcKey !== this.studioKey()) return this.studioStart(Math.max(0, this.sent), true);
      if (this.audio.src) { this.audio.play().catch(() => {}); this.playing = true; this.emitState(); return; }
    }
    if (this.mode === "device" && this.audio.src && this.audio.currentTime > 0 && !this.audio.ended) { this.audio.play().catch(() => {}); this.playing = true; this.emitState(); return; }
    this.startSentence(Math.max(0, this.sent));
  }

  next() { if (this.qi < this.queue.length - 1) { this.stopAll(); this.qi++; this.startItem(0); } }
  prev() {
    if (this.sent > 1 || this.qi === 0) return this.seekSentence(0);
    this.stopAll(); this.qi--; this.startItem(0);
  }

  seekSentence(i) {
    if (!this.seg) return;
    i = Math.max(0, Math.min(i, this.sentences.length - 1));
    if (this.mode === "studio") {
      const idx = this.indexes[store.get("voice")]?.[this.seg];
      if (idx) { this.setTime(idx.t[i]); if (!this.playing) this.resume(); this.setSentence(i); return; }
    }
    this.stopEngines();
    this.startSentence(i);
  }

  skip(sec) {
    if (this.mode === "studio") return this.setTime(Math.max(0, this.audio.currentTime + sec));
    this.seekSentence(this.sent + (sec > 0 ? 1 : -1));
  }

  // fraction 0..1 of the current segment
  seekFraction(f) {
    if (this.mode === "studio") {
      const d = this.audio.duration || this.indexes[store.get("voice")]?.[this.seg]?.dur;
      if (d) this.setTime(f * d);
      if (!this.playing) this.resume();
    } else this.seekSentence(Math.floor(f * this.sentences.length));
  }

  setRate(r) {
    store.set({ rate: r });
    this.audio.playbackRate = this.audio.defaultPlaybackRate = r;
    if (this.mode === "system" && this.playing) { speechSynthesis.cancel(); this.startSentence(this.sent); }
    if (this.mode === "device") {
      // Kokoro bakes speed into the audio; regenerate from the current sentence
      this.devCache.forEach((u) => URL.revokeObjectURL(u));
      this.devCache.clear();
      if (this.playing) { this.stopEngines(); this.startSentence(this.sent); }
    }
  }

  async voiceChanged() {
    const voice = store.get("voice");
    this.devCache.forEach((u) => URL.revokeObjectURL(u));
    this.devCache.clear();
    const wasPlaying = this.playing || this.loading;
    const i = Math.max(0, this.sent);
    if (this.seg) { this.stopEngines(); this.playing = false; this.loading = wasPlaying; this.emitState(); }
    await this.loadIndex(voice);              // the timings must be there before we restart
    if (!this.seg || voice !== store.get("voice")) return;   // voice changed again meanwhile
    this.mode = this.engineFor(this.seg);
    if (this.mode === "studio") this.studioStart(i, wasPlaying);   // reload even when paused
    else if (wasPlaying) this.startSentence(i);
    else { this.loading = false; this.setSentence(i); this.emitState(); }
  }

  progress() {
    if (!this.seg) return { t: 0, dur: 0 };
    if (this.mode === "studio") {
      const idx = this.indexes[store.get("voice")]?.[this.seg];
      return { t: this.audio.currentTime || 0, dur: this.audio.duration || idx?.dur || 0 };
    }
    // estimate for live engines from sentence lengths
    const ss = this.sentences;
    const per = (s) => s.s.length / 14.5 / (this.mode === "system" ? store.get("rate") : store.get("rate"));
    let t = 0, dur = 0;
    ss.forEach((s, i) => { const d = per(s); dur += d; if (i < this.sent) t += d; });
    if (this.mode === "device" && this.audio.duration) t += Math.min(this.audio.currentTime / this.audio.playbackRate, per(ss[this.sent] || { s: "" }));
    return { t, dur };
  }

  // ---------------------------------------------------------------- engines
  engineFor(seg) {
    const e = store.get("engine");
    if (e === "studio" && !this.hasStudio(seg)) {
      if (this.devReady) return "device";
      return "system";
    }
    return e;
  }
  hasStudio(seg) { return !!this.indexes[store.get("voice")]?.[seg]; }

  async loadIndex(voice) {
    if (this.indexes[voice]) return this.indexes[voice];
    try {
      const r = await fetch(`audio/${voice}/index.json`, { cache: "no-cache" });
      this.indexes[voice] = r.ok ? await r.json() : {};
    } catch { this.indexes[voice] = {}; }
    emit("studio-index", voice);
    return this.indexes[voice];
  }

  startItem(sentence = 0) {
    const id = this.current;
    if (!id) return;
    this.seg = id;
    this.sent = -1;
    this.mode = this.engineFor(id);
    if (store.get("engine") === "studio" && this.mode !== "studio" && !this.warned[id]) {
      this.warned[id] = true;
      emit("toast", "This bit isn’t pre-recorded in that voice yet, using a live voice.");
    }
    const m = segMeta(id);
    emit("np", { seg: id, meta: m, qi: this.qi, queue: this.queue, label: this.queueLabel });
    this.updateMediaSession(m);
    this.startSentence(sentence);
  }

  startSentence(i) {
    const ss = this.sentences;
    if (i >= ss.length) return this.onItemEnd();
    this.setSentence(i);
    if (this.mode === "studio") return this.studioStart(i);
    if (this.mode === "device") return this.deviceStart(i);
    return this.systemStart(i);
  }

  // --- studio
  studioKey() { return `${store.get("voice")}|${this.seg}`; }
  studioStart(i, autoplay = true) {
    const voice = store.get("voice");
    const idx = this.indexes[voice]?.[this.seg];
    if (!idx) {   // not recorded in this voice (yet): fall back instead of dying
      this.mode = this.devReady ? "device" : "system";
      return autoplay ? this.startSentence(i) : this.setSentence(i);
    }
    const url = `audio/${voice}/${this.seg}.mp3`;
    const a = this.audio;
    if (this.srcKey !== this.studioKey()) { a.src = url; this.srcKey = this.studioKey(); }
    a.playbackRate = a.defaultPlaybackRate = store.get("rate");
    this.setTime(idx.t[i] || 0);
    this.setSentence(i);
    if (!autoplay) { this.loading = false; this.playing = false; this.emitState(); return; }
    this.loading = true;
    this.emitState();
    a.play().catch((err) => {
      this.loading = false;
      this.playing = false;
      this.emitState();
      if (err.name === "NotAllowedError") emit("toast", "Tap play to start the audio.");
    });
  }
  setTime(t) {
    const a = this.audio;
    if (a.readyState >= 1) a.currentTime = t;
    else a.addEventListener("loadedmetadata", () => { a.currentTime = t; }, { once: true });
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.playing) return;
      if (this.mode === "studio") {
        const idx = this.indexes[store.get("voice")]?.[this.seg];
        if (idx) {
          const t = this.audio.currentTime + 0.05;
          let i = 0;
          while (i + 1 < idx.t.length && idx.t[i + 1] <= t) i++;
          if (i !== this.sent) this.setSentence(i);
        }
      }
      emit("progress", this.progress());
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  onAudioEnded() {
    if (this.mode === "studio") return this.onItemEnd();
    if (this.mode === "device") {
      const ss = this.sentences;
      const next = this.sent + 1;
      const gap = ss[next] && ss[next].p !== ss[this.sent].p ? SILENCE.paragraph : SILENCE.sentence;
      this.gapTimer = setTimeout(() => this.startSentence(next), gap);
    }
  }

  // --- device (Kokoro in a worker)
  // Kokoro on WebGPU needs the 326 MB fp32 model; the 92 MB q8 WASM build is the sane default everywhere.
  get webgpu() { return false; }
  worker() {
    if (this._worker) return this._worker;
    const w = new Worker(new URL("./workers/tts-worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") emit("device-progress", m);
      if (m.type === "ready") { this.devReady = true; emit("device-ready", m); }
      if (m.type === "audio") {
        const url = URL.createObjectURL(new Blob([m.wav], { type: "audio/wav" }));
        this.devCache.set(m.key, url);
        this.devPending.get(m.key)?.resolve(url);
        this.devPending.delete(m.key);
        emit("device-speed", { rtf: m.ms / 1000 / m.dur });
      }
      if (m.type === "error") {
        emit("device-error", m.message);
        if (m.key) { this.devPending.get(m.key)?.reject(new Error(m.message)); this.devPending.delete(m.key); }
      }
    };
    this._worker = w;
    return w;
  }
  preloadDevice() { this.worker().postMessage({ type: "load", webgpu: this.webgpu }); }
  devKey(seg, i) { return `${store.get("voice")}|${store.get("rate")}|${seg}|${i}`; }
  devGen(seg, i) {
    const s = D.segments[seg]?.sentences[i];
    if (!s) return Promise.resolve(null);
    const key = this.devKey(seg, i);
    if (this.devCache.has(key)) return Promise.resolve(this.devCache.get(key));
    if (this.devPending.has(key)) return this.devPending.get(key).promise;
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    this.devPending.set(key, { promise, resolve, reject });
    this.worker().postMessage({ type: "gen", key, text: s.s, voice: store.get("voice"), speed: store.get("rate"), webgpu: this.webgpu });
    return promise;
  }
  async deviceStart(i) {
    const seg = this.seg;
    this.loading = true;
    this.playing = false;
    this.emitState();
    let url;
    try { url = await this.devGen(seg, i); } catch (e) { return this.fallback("The on-device voice hit a problem, switching to the phone’s voice."); }
    if (seg !== this.seg || this.sent !== i || this.stopped) return;
    // look ahead so the next sentence is ready when this one ends
    this.devGen(seg, i + 1).then(() => this.devGen(seg, i + 2)).catch(() => {});
    const a = this.audio;
    a.src = url;
    this.srcKey = null;
    a.playbackRate = 1;
    a.play().catch(() => { this.loading = false; this.emitState(); });
  }

  // --- system speech
  systemStart(i) {
    if (!("speechSynthesis" in window)) return emit("toast", "No speech engine on this device.");
    speechSynthesis.cancel();
    const s = this.sentences[i];
    const u = new SpeechSynthesisUtterance(s.s);
    u.lang = "en-GB";
    const v = speechSynthesis.getVoices().find((v) => v.voiceURI === store.get("systemVoice"));
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = store.get("rate");
    const seg = this.seg;
    u.onstart = () => { this.loading = false; this.playing = true; this.emitState(); this.loop(); };
    u.onend = () => {
      if (seg !== this.seg || this.sent !== i || !this.playing) return;
      const ss = this.sentences, next = i + 1;
      const gap = ss[next] && ss[next].p !== s.p ? SILENCE.paragraph : SILENCE.sentence;
      this.gapTimer = setTimeout(() => this.startSentence(next), gap);
    };
    this.playing = true;
    this.emitState();
    speechSynthesis.speak(u);
  }

  fallback(msg) {
    emit("toast", msg);
    this.stopEngines();
    this.mode = "system";
    this.startSentence(Math.max(0, this.sent));
  }

  // ---------------------------------------------------------------- flow
  onItemEnd() {
    const done = this.seg;
    if (D.byId[done]) {
      const listened = { ...store.get("listened"), [done]: Date.now() };
      store.set({ listened });
    }
    this.playing = false;
    this.emitState();
    if (this.qi >= this.queue.length - 1) { emit("queue-end", done); return; }
    const isBridge = /^bridge-/.test(done);
    const gap = isBridge ? store.get("walkGap") ?? 8 : 1.2;
    if (isBridge && (store.get("pauseAtStops") || gap > 2)) return this.startWalk(gap);
    this.gapTimer = setTimeout(() => { this.qi++; this.startItem(0); }, gap * 1000);
  }

  startWalk(sec) {
    const meta = segMeta(this.seg);
    const wait = store.get("pauseAtStops");
    this.walking = { next: meta.next, until: wait ? null : Date.now() + sec * 1000 };
    emit("walking", this.walking);
    if (!wait) this.walkTimer = setTimeout(() => this.endWalk(), sec * 1000);
  }
  endWalk() {
    clearTimeout(this.walkTimer);
    this.walking = null;
    emit("walking", null);
    this.qi++;
    this.startItem(0);
  }

  setSentence(i) {
    this.sent = i;
    emit("sentence", { seg: this.seg, i });
  }

  stopEngines() {
    clearTimeout(this.gapTimer);
    cancelAnimationFrame(this.raf);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this._internalPause = true;
    this.audio.pause();
    this._internalPause = false;
  }
  stopAll() {
    this.stopEngines();
    clearTimeout(this.walkTimer);
    if (this.walking) { this.walking = null; emit("walking", null); }
    this.playing = false;
    this.loading = false;
  }

  emitState() {
    emit("state", { playing: this.playing, loading: this.loading, seg: this.seg, mode: this.mode });
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = this.playing ? "playing" : "paused";
  }

  // ---------------------------------------------------------------- lock screen controls
  setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
    h("play", () => this.resume());
    h("pause", () => this.pause());
    h("seekbackward", () => this.skip(-10));
    h("seekforward", () => this.skip(10));
    h("previoustrack", () => this.prev());
    h("nexttrack", () => (this.walking ? this.endWalk() : this.next()));
  }
  updateMediaSession(m) {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.title, artist: m.sub, album: "Black Mirror · Ludwig Museum",
      artwork: [{ src: new URL(m.big || m.image, location.href).href, sizes: "512x512" }],
    });
  }
}

export const narrator = new Narrator();
