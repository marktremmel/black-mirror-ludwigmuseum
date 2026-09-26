// Remix Lab: photo (camera / upload / official image) + mood filter + stickers + caption.
import { D, colorOf } from "./data.js";
import { remixes, emit } from "./store.js";

const MAX = 1080;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- filters (pixel ops, work on every browser)
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const FILTERS = [
  { id: "none", name: "Original", fn: null },
  { id: "mirror", name: "Black Mirror", fn(d, w, h) {
      for (let i = 0; i < d.length; i += 4) {
        let l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        l = clamp((l - 128) * 1.55 + 118);
        d[i] = d[i + 1] = d[i + 2] = l;
      }
      vignette(d, w, h, 0.85);
    } },
  { id: "neon", name: "Neon", fn(d) {
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
        d[i] = clamp(30 + 225 * Math.pow(l, 0.9));
        d[i + 1] = clamp(10 + 210 * Math.pow(l, 2.2));
        d[i + 2] = clamp(90 + 165 * Math.sqrt(1 - Math.abs(l - 0.45)));
      }
    } },
  { id: "cctv", name: "Surveillance", fn(d, w, h) {
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        const n = (Math.random() - 0.5) * 38;
        const row = Math.floor(i / 4 / w);
        const scan = row % 4 === 0 ? 0.72 : 1;
        d[i] = clamp((l * 0.35 + n) * scan);
        d[i + 1] = clamp((l * 1.05 + 20 + n) * scan);
        d[i + 2] = clamp((l * 0.3 + n) * scan);
      }
      vignette(d, w, h, 1);
    }, overlay(g, w, h) {
      const s = Math.round(w / 26);
      g.font = `700 ${s}px ui-monospace, Menlo, monospace`;
      g.fillStyle = "#b8ffb0";
      const now = new Date();
      g.fillText("● REC  CAM 03", s, s * 1.8);
      g.fillText(now.toISOString().slice(0, 19).replace("T", "  "), s, h - s);
    } },
  { id: "glitch", name: "Glitch", fn(d, w, h) {
      const src = d.slice();
      const off = Math.round(w * 0.012);
      for (let y = 0; y < h; y++) {
        const shift = Math.random() < 0.035 ? Math.round((Math.random() - 0.5) * w * 0.12) : 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const xr = Math.min(w - 1, Math.max(0, x + off + shift)), xb = Math.min(w - 1, Math.max(0, x - off + shift)), xg = Math.min(w - 1, Math.max(0, x + shift));
          d[i] = src[(y * w + xr) * 4];
          d[i + 1] = src[(y * w + xg) * 4 + 1];
          d[i + 2] = src[(y * w + xb) * 4 + 2];
        }
      }
    } },
  { id: "thermal", name: "Thermal", fn(d) {
      const stops = [[10, 0, 40], [90, 0, 150], [200, 30, 90], [250, 140, 0], [255, 240, 150]];
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255 * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(l)), f = l - k;
        for (let c = 0; c < 3; c++) d[i + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
      }
    } },
  { id: "fade", name: "Soviet Kodak", fn(d, w, h) {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = clamp(0.55 * r + 0.45 * g + 0.1 * b + 18);
        d[i + 1] = clamp(0.3 * r + 0.6 * g + 0.1 * b + 8);
        d[i + 2] = clamp(0.2 * r + 0.3 * g + 0.35 * b + 12);
      }
      vignette(d, w, h, 0.6);
    } },
];
function vignette(d, w, h, k) {
  const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = 1 - k * Math.pow(Math.hypot(x - cx, y - cy) / R, 2.2) * 0.75;
    const i = (y * w + x) * 4;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
}

// ---------------------------------------------------------------- lab
class Lab {
  constructor() {
    this.root = document.getElementById("lab");
    this.items = [];
    this.sel = null;
    this.filter = "none";
    this.base = null; // canvas with the source photo
    this.filtered = null;
    this.artId = null;
    this.imgCache = new Map();
  }

  async mount() {
    if (!this.stickers) this.stickers = await (await fetch("data/stickers.json")).json();
    this.pack = this.pack || this.stickers[0].id;
    this.render();
  }

  render() {
    const r = this.root;
    r.innerHTML = `
      <h2>Remix Lab</h2>
      <p>Photograph a work that got to you (or grab the official image), give it a mood, slap on stickers and a caption. It’s saved on this phone only.</p>
      <div class="stage-wrap" id="stageWrap">
        ${this.base ? `<canvas id="stage"></canvas>` : `<div class="stage-empty"><div>
          <p>Start with a photo</p>
          <div class="path-actions" style="justify-content:center">
            <label class="btn primary"><input type="file" accept="image/*" capture="environment" id="camIn" hidden>📷 Take / upload photo</label>
            <button class="btn" id="pickArt">🖼 Use an official image</button>
          </div></div></div>`}
      </div>
      ${this.base ? `
      <div class="filters" id="filters">${FILTERS.map((f) => `<button class="filter ${f.id === this.filter ? "on" : ""}" data-f="${f.id}"><canvas width="64" height="64"></canvas>${f.name}</button>`).join("")}</div>
      <div class="sel-bar">
        <button class="btn small" id="addText">Aa Caption</button>
        <button class="btn small" id="delItem" ${this.sel == null ? "disabled" : ""}>🗑 Remove</button>
        <button class="btn small" id="flipItem" ${this.sel == null ? "disabled" : ""}>⇋ Flip</button>
        <label class="btn small"><input type="file" accept="image/*" id="camIn2" hidden>↺ New photo</label>
      </div>
      <div id="textEdit" ${this.sel != null && this.items[this.sel]?.type === "text" ? "" : "hidden"} style="margin-top:8px">
        <input class="textin" id="textIn" maxlength="60" placeholder="Your caption (6 words hits hardest)" value="${esc(this.items[this.sel]?.text || "")}">
      </div>
      <div class="drawer">
        <div class="drawer-tabs">${this.stickers.map((p) => `<button data-pack="${p.id}" class="${p.id === this.pack ? "on" : ""}">${p.label}</button>`).join("")}</div>
        <div class="drawer-grid">${this.stickers.find((p) => p.id === this.pack).items.map((src) => `<button data-st="${src}"><img loading="lazy" src="${src}" alt=""></button>`).join("")}</div>
      </div>
      <div class="path-actions" style="margin-top:12px">
        <button class="btn primary" id="saveRemix">💾 Save remix</button>
        <button class="btn" id="shareRemix">↗ Share / download</button>
        <button class="btn ghost" id="clearRemix">🗑 Start a new one</button>
      </div>
      <p class="small-print">Tip: drag to move · pinch (or the corner handle) to resize & rotate · tap empty space to deselect.</p>` : ""}
      <h3 class="eyebrow" style="margin-top:22px">Saved remixes <span style="text-transform:none;letter-spacing:0;font-weight:400">· tap ✕ to delete one</span></h3>
      <div class="gallery" id="gallery"></div>
      <p class="small-print" style="margin-top:14px">Stickers: Designsoup Urban Grunge decal pack · Cursed set by Ash N Ink · erikari lovely stickers · plus the capybara, cyber-beast, manga, Aria, bubloo and planet packs. Used here for a school project, not redistributed.</p>`;

    const $ = (s) => r.querySelector(s);
    const fileIn = (inp) => inp && (inp.onchange = () => inp.files[0] && this.loadBlob(inp.files[0]));
    fileIn($("#camIn")); fileIn($("#camIn2"));
    $("#pickArt") && ($("#pickArt").onclick = () => this.pickArt());
    this.renderGallery();
    if (!this.base) return;

    this.canvas = $("#stage");
    this.canvas.width = this.base.width; this.canvas.height = this.base.height;
    this.g = this.canvas.getContext("2d");
    this.applyFilter();
    this.thumbs();
    r.querySelectorAll(".filter").forEach((b) => (b.onclick = () => { this.filter = b.dataset.f; r.querySelectorAll(".filter").forEach((x) => x.classList.toggle("on", x === b)); this.applyFilter(); }));
    r.querySelectorAll("[data-pack]").forEach((b) => (b.onclick = () => { this.pack = b.dataset.pack; this.render(); }));
    r.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => this.addSticker(b.dataset.st)));
    $("#addText").onclick = () => this.addText();
    $("#delItem").onclick = () => { if (this.sel != null) { this.items.splice(this.sel, 1); this.sel = null; this.render(); } };
    $("#flipItem").onclick = () => { const it = this.items[this.sel]; if (it) { it.flip = !it.flip; this.draw(); } };
    const ti = $("#textIn");
    if (ti) ti.oninput = () => { const it = this.items[this.sel]; if (it?.type === "text") { it.text = ti.value || " "; this.draw(); } };
    $("#saveRemix").onclick = () => this.save();
    $("#clearRemix").onclick = () => {
      if (this.items.length && !confirm("Clear this picture and start a new one? Saved remixes are kept.")) return;
      this.base = null; this.items = []; this.sel = null; this.artId = null; this.filter = "none";
      this.render();
      emit("toast", "Cleared. Pick a new photo.");
    };
    $("#shareRemix").onclick = () => this.share();
    this.bindStage();
  }

  thumbs() {
    const src = document.createElement("canvas");
    const s = 64 / Math.min(this.base.width, this.base.height);
    src.width = 64; src.height = 64;
    const g = src.getContext("2d");
    g.drawImage(this.base, (64 - this.base.width * s) / 2, (64 - this.base.height * s) / 2, this.base.width * s, this.base.height * s);
    this.root.querySelectorAll(".filter").forEach((b) => {
      const f = FILTERS.find((x) => x.id === b.dataset.f);
      const c = b.querySelector("canvas").getContext("2d");
      c.drawImage(src, 0, 0);
      if (f.fn) { const im = c.getImageData(0, 0, 64, 64); f.fn(im.data, 64, 64); c.putImageData(im, 0, 0); }
    });
  }

  // ---------------------------------------------------------------- sources
  async loadBlob(blob, artId = null) {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }).catch(() => null);
    if (!bmp) return emit("toast", "Couldn’t read that image.");
    const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    this.base = c;
    this.items = [];
    this.sel = null;
    this.filter = "none";
    this.artId = artId;
    this.render();
    emit("go", "lab");
  }
  async useArtwork(id) {
    const a = D.byId[id];
    const blob = await (await fetch(a.image)).blob();
    this.loadBlob(blob, id);
  }
  pickArt() {
    const g = this.root.querySelector("#gallery");
    g.innerHTML = D.artworks.map((a) => `<figure data-a="${a.id}" style="cursor:pointer"><img src="${a.thumb}" alt=""><figcaption>${esc(a.title)}</figcaption></figure>`).join("");
    g.querySelectorAll("[data-a]").forEach((f) => (f.onclick = () => this.useArtwork(f.dataset.a)));
    g.scrollIntoView({ behavior: "smooth" });
  }

  // ---------------------------------------------------------------- items
  async img(src) {
    if (this.imgCache.has(src)) return this.imgCache.get(src);
    const p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    this.imgCache.set(src, p);
    return p;
  }
  async addSticker(src) {
    const im = await this.img(src);
    const W = this.canvas.width, H = this.canvas.height;
    const size = Math.min(W, H) * 0.32;
    const s = size / Math.max(im.width, im.height);
    this.items.push({ type: "sticker", im, src, x: W / 2 + (Math.random() - 0.5) * W * 0.2, y: H / 2 + (Math.random() - 0.5) * H * 0.2, s, r: (Math.random() - 0.5) * 0.3, flip: false });
    this.sel = this.items.length - 1;
    this.render();
  }
  addText() {
    const W = this.canvas.width, H = this.canvas.height;
    this.items.push({ type: "text", text: "the future is too dark", x: W / 2, y: H * 0.82, s: 1, r: 0, color: "#ffffff", flip: false });
    this.sel = this.items.length - 1;
    this.render();
    setTimeout(() => { const t = this.root.querySelector("#textIn"); t?.focus(); t?.select(); }, 50);
  }
  size(it) {
    if (it.type === "sticker") return [it.im.width * it.s, it.im.height * it.s];
    const fs = Math.round(this.canvas.width / 13) * it.s;
    this.g.font = `900 ${fs}px Impact, "Arial Black", system-ui, sans-serif`;
    const lines = this.wrap(it.text.toUpperCase(), this.canvas.width * 0.86 / it.s * it.s, fs);
    return [Math.max(...lines.map((l) => this.g.measureText(l).width)) + fs * 0.4, lines.length * fs * 1.08 + fs * 0.2, lines, fs];
  }
  wrap(text, maxW, fs) {
    const words = text.split(/\s+/); const lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (this.g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }

  applyFilter() {
    const f = FILTERS.find((x) => x.id === this.filter);
    const c = document.createElement("canvas");
    c.width = this.base.width; c.height = this.base.height;
    const g = c.getContext("2d");
    g.drawImage(this.base, 0, 0);
    if (f.fn) { const im = g.getImageData(0, 0, c.width, c.height); f.fn(im.data, c.width, c.height); g.putImageData(im, 0, 0); }
    f.overlay?.(g, c.width, c.height);
    this.filtered = c;
    this.draw();
  }

  draw(forExport = false) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.filtered, 0, 0);
    this.items.forEach((it, i) => {
      g.save();
      g.translate(it.x, it.y); g.rotate(it.r); if (it.flip) g.scale(-1, 1);
      if (it.type === "sticker") {
        const [w, h] = this.size(it);
        g.shadowColor = "#0007"; g.shadowBlur = W / 90; g.shadowOffsetY = W / 250;
        g.drawImage(it.im, -w / 2, -h / 2, w, h);
      } else {
        const [, h, lines, fs] = this.size(it);
        g.font = `900 ${fs}px Impact, "Arial Black", system-ui, sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
        lines.forEach((l, k) => {
          const y = -h / 2 + fs * 0.6 + k * fs * 1.08;
          g.lineWidth = fs * 0.16; g.strokeStyle = "#000"; g.strokeText(l, 0, y);
          g.fillStyle = it.color; g.fillText(l, 0, y);
        });
      }
      g.restore();
      if (!forExport && i === this.sel) this.drawSel(it);
    });
  }
  drawSel(it) {
    const g = this.g, [w, h] = this.size(it), k = this.canvas.width / 360;
    g.save(); g.translate(it.x, it.y); g.rotate(it.r);
    g.setLineDash([6 * k, 5 * k]); g.lineWidth = 2 * k; g.strokeStyle = "#fff";
    g.strokeRect(-w / 2 - 6 * k, -h / 2 - 6 * k, w + 12 * k, h + 12 * k);
    g.setLineDash([]); g.fillStyle = "#7fb2cf";
    g.beginPath(); g.arc(w / 2 + 6 * k, h / 2 + 6 * k, 11 * k, 0, 7); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------- touch
  bindStage() {
    const c = this.canvas;
    const pts = new Map();
    let mode = null, start = null;
    const P = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height]; };
    const local = (it, [x, y]) => { const dx = x - it.x, dy = y - it.y, cs = Math.cos(-it.r), sn = Math.sin(-it.r); return [dx * cs - dy * sn, dx * sn + dy * cs]; };
    const hit = (p) => {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i], [w, h] = this.size(it), [lx, ly] = local(it, p);
        if (Math.abs(lx) <= w / 2 + 10 && Math.abs(ly) <= h / 2 + 10) return i;
      }
      return null;
    };
    c.addEventListener("pointerdown", (e) => {
      try { c.setPointerCapture(e.pointerId); } catch {}
      const p = P(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2 && this.sel != null) {
        const [a, b] = [...pts.values()], it = this.items[this.sel];
        mode = "pinch"; start = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), s: it.s, r: it.r };
        return;
      }
      const it = this.items[this.sel];
      if (it) {
        const [w, h] = this.size(it), [lx, ly] = local(it, p), k = c.width / 360;
        if (Math.hypot(lx - (w / 2 + 6 * k), ly - (h / 2 + 6 * k)) < 26 * k) {
          mode = "handle"; start = { d: Math.hypot(p[0] - it.x, p[1] - it.y), ang: Math.atan2(p[1] - it.y, p[0] - it.x), s: it.s, r: it.r };
          return;
        }
      }
      const i = hit(p);
      const changed = i !== this.sel;
      this.sel = i;
      if (i != null) {
        const it2 = this.items[i];
        this.items.splice(i, 1); this.items.push(it2); this.sel = this.items.length - 1; // bring to front
        mode = "drag"; start = { p, x: it2.x, y: it2.y };
      } else mode = null;
      if (changed) { this.render(); } else this.draw();
    });
    c.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = P(e); pts.set(e.pointerId, p);
      const it = this.items[this.sel];
      if (!it || !mode) return;
      if (mode === "drag") { it.x = start.x + p[0] - start.p[0]; it.y = start.y + p[1] - start.p[1]; }
      if (mode === "handle") {
        it.s = Math.max(0.05, start.s * Math.hypot(p[0] - it.x, p[1] - it.y) / start.d);
        it.r = start.r + Math.atan2(p[1] - it.y, p[0] - it.x) - start.ang;
      }
      if (mode === "pinch" && pts.size === 2) {
        const [a, b] = [...pts.values()];
        it.s = Math.max(0.05, start.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / start.d);
        it.r = start.r + Math.atan2(b[1] - a[1], b[0] - a[0]) - start.ang;
      }
      this.draw();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size === 0) mode = null; };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
  }

  // ---------------------------------------------------------------- output
  async blob() {
    this.draw(true);
    const b = await new Promise((r) => this.canvas.toBlob(r, "image/jpeg", 0.85));
    this.draw();
    return b;
  }
  async save() {
    const blob = await this.blob();
    await remixes.put({ id: "r" + Date.now(), at: Date.now(), artId: this.artId, blob });
    emit("toast", "Saved ✓ Tap “Start a new one” for another.");
    this.renderGallery();
    emit("remixes-changed");
  }
  async share() {
    const blob = await this.blob();
    const name = `black-mirror-remix-${Date.now()}.jpg`;
    const file = new File([blob], name, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My Black Mirror remix" }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async renderGallery() {
    const g = this.root.querySelector("#gallery");
    if (!g) return;
    const list = await remixes.all();
    if (!list.length) { g.innerHTML = `<p class="small-print">Nothing yet. Your saved remixes will show up here.</p>`; return; }
    g.innerHTML = list.map((r) => `<figure><img src="${URL.createObjectURL(r.blob)}" alt=""><figcaption>${r.artId ? esc(D.byId[r.artId]?.title || "") : new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</figcaption><button class="x" data-del="${r.id}" aria-label="Delete remix">✕</button></figure>`).join("");
    g.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await remixes.del(b.dataset.del); this.renderGallery(); emit("remixes-changed"); }));
  }
}

export const lab = new Lab();
