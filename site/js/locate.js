// Camera "where am I?": continuous on-device recognition + a spatial prior.
// posterior(work) ∝ exp(similarity / τ) × (floor + nearness to where you last were) × (small boost if on your path)
import { D, dist, colorOf } from "./data.js";
import { store, emit } from "./store.js";

const TAU = 0.05, SIGMA = 0.3, FLOOR = 0.35;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

class Locator {
  constructor() {
    this.root = document.getElementById("cam");
    this.ready = false;
    this.seq = 0;
    this.post = null;
    this.onChoose = null;
    this.onSnap = null;
  }

  get webgpu() { return !!navigator.gpu; }

  worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL("./workers/vision-worker.js", import.meta.url), { type: "module" });
    this.w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") this.msg(`Loading the recogniser… ${Math.round((m.loaded / m.total) * 100)}% (one-time, ~${Math.round(m.total / 1e6)} MB)`);
      if (m.type === "ready") { this.ready = true; this.engine = m; this.msg("Point at an artwork, a wall label, or a corner you like."); }
      if (m.type === "result") this.onResult(m);
      if (m.type === "error") { this.busy = false; this.msg("Recogniser error: " + m.message); }
    };
    this.w.postMessage({ type: "load", webgpu: this.webgpu });
    return this.w;
  }
  preload() { this.worker(); }

  async open() {
    this.render();
    this.root.hidden = false;
    this.worker();
    this.post = null;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.running = true;
      this.loop();
    } catch (err) {
      this.msg(location.protocol === "http:" && location.hostname !== "localhost"
        ? "The camera needs a secure (https) link. Use the map instead: long-press where you stand."
        : "No camera access. You can long-press the map where you stand instead.");
    }
  }

  close() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.root.hidden = true;
    this.root.innerHTML = "";
  }

  render() {
    this.root.innerHTML = `
      <video playsinline muted></video>
      <div class="cam-top">
        <div><b>Where am I?</b><small>Everything runs on this phone, nothing is uploaded.</small></div>
        <button class="icon-btn" data-x aria-label="Close camera">✕</button>
      </div>
      <div class="reticle scanning"></div>
      <div class="minimap"><svg viewBox="-40 -40 1081 851"></svg></div>
      <div class="ar-slot"></div>
      <div class="cam-bottom">
        <p class="cam-msg">Waking up the camera…</p>
        <div class="guesses"></div>
        <div class="cam-actions">
          <button class="btn small" data-map>Tap the map instead</button>
          <button class="btn small" data-snap>📸 Snap for Remix Lab</button>
        </div>
      </div>`;
    this.video = this.root.querySelector("video");
    this.root.querySelector("[data-x]").onclick = () => this.close();
    this.root.querySelector("[data-map]").onclick = () => { this.close(); emit("toast", "Long-press the map where you’re standing."); };
    this.root.querySelector("[data-snap]").onclick = () => this.snap();
    this.drawMini();
  }

  msg(t) { const p = this.root.querySelector(".cam-msg"); if (p) p.textContent = t; }

  // square crop under the reticle + the whole frame (letterboxed) as two views
  async grab() {
    const v = this.video;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return null;
    const r = v.getBoundingClientRect();
    const scale = Math.max(r.width / vw, r.height / vh); // object-fit: cover
    const ret = this.root.querySelector(".reticle").getBoundingClientRect();
    const sx = (ret.left - r.left - (r.width - vw * scale) / 2) / scale;
    const sy = (ret.top - r.top - (r.height - vh * scale) / 2) / scale;
    const ss = ret.width / scale;
    const crop = await createImageBitmap(v, Math.max(0, sx), Math.max(0, sy), Math.min(ss, vw), Math.min(ss, vh), { resizeWidth: 320, resizeHeight: 320 });
    const S = Math.max(vw, vh);
    const c = new OffscreenCanvas(320, 320);
    const g = c.getContext("2d");
    g.fillStyle = "#e8e8e4"; g.fillRect(0, 0, 320, 320);
    g.drawImage(v, (S - vw) / 2 / S * 320, (S - vh) / 2 / S * 320, vw / S * 320, vh / S * 320);
    const full = c.transferToImageBitmap();
    return [crop, full];
  }

  async loop() {
    if (!this.running) return;
    if (this.ready && !this.busy && !document.hidden) {
      let views = await this.grab();
      if (views && this.engine?.device === "wasm") {
        // no GPU: alternate the two views between frames (half the work; smoothing merges them)
        const keep = this.seq % 2;
        views[1 - keep].close();
        views = [views[keep]];
      }
      if (views) {
        this.busy = true;
        this.w.postMessage({ type: "embed", seq: ++this.seq, views, webgpu: this.webgpu }, views);
      }
    }
    this.timer = setTimeout(() => this.loop(), 250);
  }

  onResult(m) {
    this.busy = false;
    if (!this.running) return;
    const pos = store.get("pos");
    const fresh = pos && Date.now() - store.get("posAt") < 30 * 60 * 1000;
    const path = store.get("path");
    const raw = {};
    let Z = 0;
    for (const a of D.artworks) {
      const s = m.sims[a.id] ?? 0;
      let w = Math.exp(s / TAU);
      if (fresh) w *= FLOOR + Math.exp(-(dist(pos, a.pos) ** 2) / (2 * SIGMA * SIGMA));
      if (path && path !== "all" && a.s === path) w *= 1.25;
      raw[a.id] = w; Z += w;
    }
    // temporal smoothing across frames
    const post = {};
    for (const id in raw) post[id] = raw[id] / Z;
    if (this.post) for (const id in post) post[id] = 0.45 * this.post[id] + 0.55 * post[id];
    this.post = post;
    const ranked = Object.entries(post).sort((a, b) => b[1] - a[1]);
    const [topId, topP] = ranked[0];
    const topSim = m.sims[topId];
    this.lastTop = topId;

    const heat = ranked.slice(0, 5).map(([id, p]) => ({ id, p }));
    this.drawMini(heat);
    emit("heat", heat);

    const g = this.root.querySelector(".guesses");
    g.innerHTML = ranked.slice(0, 3).map(([id, p]) => {
      const a = D.byId[id];
      return `<button class="guess" data-id="${id}" style="--c:${colorOf(a.s)}"><img src="${a.thumb}" alt=""><div><b>${esc(a.title)}</b><div class="conf"><i style="width:${Math.round(p * 100)}%"></i></div></div></button>`;
    }).join("");
    g.querySelectorAll(".guess").forEach((b) => (b.onclick = () => this.choose(b.dataset.id)));

    const slot = this.root.querySelector(".ar-slot");
    const ret = this.root.querySelector(".reticle");
    if (topP > 0.55 && topSim > 0.42) {
      const a = D.byId[topId];
      if (slot.dataset.id !== topId) {
        slot.dataset.id = topId;
        slot.innerHTML = `<button class="ar-tag" style="--c:${colorOf(a.s)}"><img src="${a.thumb}" alt=""><span><small>Looks like</small><b>${esc(a.title)}</b><small>${esc(a.name)} · tap to listen</small></span></button>`;
        slot.querySelector("button").onclick = () => this.choose(topId, true);
        navigator.vibrate?.(15);
      }
      ret.classList.remove("scanning");
      this.msg("Got it? Tap the card. Not right? Pick from the guesses below.");
    } else {
      slot.dataset.id = ""; slot.innerHTML = "";
      ret.classList.add("scanning");
      this.msg(topSim < 0.36 ? "Hmm, nothing I recognise here. Try an artwork, or step back a little." : "Getting warmer… hold steady.");
    }
  }

  choose(id, play = false) {
    const a = D.byId[id];
    store.set({ pos: a.pos, posAt: Date.now() });
    this.close();
    this.onChoose?.(id, play);
  }

  async snap() {
    const v = this.video;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    const S = 1080 / Math.max(v.videoWidth, v.videoHeight);
    c.width = Math.round(v.videoWidth * S); c.height = Math.round(v.videoHeight * S);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    const tag = this.post && this.lastTop ? this.lastTop : null;
    this.close();
    this.onSnap?.(blob, tag);
  }

  drawMini(heat = []) {
    const svg = this.root.querySelector(".minimap svg");
    if (!svg) return;
    const { W, H, walls } = D.plan;
    let s = walls.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#6f95ab"/>`).join("");
    for (const { id, p } of heat) {
      const a = D.byId[id];
      s += `<circle cx="${a.pos[0] * W}" cy="${a.pos[1] * H}" r="${40 + 120 * p}" fill="${colorOf(a.s)}" opacity="${Math.min(0.85, 0.2 + p)}"/>`;
    }
    const pos = store.get("pos");
    if (pos) s += `<circle cx="${pos[0] * W}" cy="${pos[1] * H}" r="22" fill="#fff" stroke="#7fb2cf" stroke-width="8"/>`;
    svg.innerHTML = s;
  }
}

export const locator = new Locator();
