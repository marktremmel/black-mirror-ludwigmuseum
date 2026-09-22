// SVG floor plan with pan / pinch-zoom. Everything (walls, pins, "you are here")
// lives in ONE coordinate system, so nothing drifts when the page is resized.
import { D, colorOf } from "./data.js";

const NS = "http://www.w3.org/2000/svg";
const M = 40; // margin around the building (plan units)
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

export class Plan {
  constructor(svg, { onPick, onLongPress } = {}) {
    this.svg = svg;
    this.onPick = onPick;
    this.onLongPress = onLongPress;
    const { W, H } = D.plan;
    this.W = W; this.H = H;
    this.full = { x: -M, y: -M, w: W + 2 * M, h: H + 2 * M };
    this.vb = { ...this.full };
    this.pins = new Map();
    this.path = null;
    this.sel = null;
    this.playing = null;
    this.draw();
    this.bind();
    this.apply();
    new ResizeObserver(() => this.apply()).observe(svg);
  }

  P(pos) { return [pos[0] * this.W, pos[1] * this.H]; }

  draw() {
    const s = this.svg;
    s.setAttribute("viewBox", `${this.full.x} ${this.full.y} ${this.full.w} ${this.full.h}`);
    const defs = el("defs", {}, s);
    const g = el("radialGradient", { id: "heatG" }, defs);
    el("stop", { offset: "0", "stop-color": "#7fb2cf", "stop-opacity": ".9" }, g);
    el("stop", { offset: "1", "stop-color": "#7fb2cf", "stop-opacity": "0" }, g);

    this.world = el("g", {}, s);
    const { walls, outline, door, glass } = D.plan;
    el("polygon", { class: "plan-floor", points: outline.map((p) => p.join(",")).join(" ") }, this.world);
    for (const [x, y, w, h] of walls) el("rect", { class: "plan-wall", x, y, width: w, height: h, rx: 1.5 }, this.world);
    el("line", { class: "plan-door", x1: door[0], y1: door[1], x2: door[2], y2: door[3] }, this.world);
    el("line", { class: "plan-glass", x1: glass[0], y1: glass[1], x2: glass[2], y2: glass[3] }, this.world);

    this.heatLayer = el("g", { class: "heat" }, this.world);
    this.placeLayer = el("g", {}, this.world);
    this.pinLayer = el("g", {}, this.world);
    this.labelLayer = el("g", {}, this.world);
    this.meLayer = el("g", {}, this.world);

    // entrance arrow
    const [ex, ey] = [door[0] - 36, (door[1] + door[3]) / 2];
    el("path", { class: "plan-arrow", d: `M${ex} ${ey - 2}h22v-7l12 9-12 9v-7h-22z` }, this.world);

    for (const p of D.places) {
      const [x, y] = this.P(p.pos);
      const g = el("g", { class: "place", "data-place": p.id, transform: `translate(${x},${y})` }, this.placeLayer);
      const inner = el("g", {}, g);
      if (p.id === "library") {
        el("circle", { class: "bg", r: 10 }, inner);
        el("path", { class: "glyph", d: "M-5-4h4.5v8h-4.5zM0.5-4h4.5v8h-4.5z" }, inner);
      } else if (p.id === "paik") {
        el("circle", { class: "bg", r: 11 }, inner);
        el("rect", { class: "glyph", x: -6, y: -4.5, width: 12, height: 9, rx: 2 }, inner);
      } else if (p.id === "entrance") {
        el("circle", { class: "bg", r: 6 }, inner);
      } else {
        el("circle", { r: 9, fill: "none", stroke: colorOf("D"), "stroke-width": 2.5, "stroke-dasharray": "3 3" }, inner);
      }
      p._g = inner;
      const label = { library: "Library", paik: "Nam June Paik", entrance: "Entrance" }[p.id];
      if (label) {
        const t = el("text", { class: "place-label", x, y }, this.labelLayer);
        t.textContent = label;
        p._label = t;
      }
    }

    for (const a of D.artworks) {
      const [x, y] = this.P(a.pos);
      const g = el("g", { class: "pin", "data-id": a.id, style: `--c:${colorOf(a.s)}` }, this.pinLayer);
      const inner = el("g", {}, g);
      el("circle", { class: "halo", r: 20 }, inner);
      el("circle", { class: "dot", r: 11 }, inner);
      const num = el("text", { class: "num", y: 0.5 }, inner);
      this.pins.set(a.id, { g, inner, num, x, y, a });
    }
    this.selLabel = el("text", { class: "pin-label" }, this.labelLayer);
  }

  // ---------------------------------------------------------------- state
  setPath(pathId) {
    this.path = pathId;
    const order = pathId && pathId !== "all" ? D.pathOf[pathId].stops : null;
    for (const [id, p] of this.pins) {
      const i = order ? order.indexOf(id) : -1;
      p.g.classList.toggle("dim", !!order && i < 0);
      p.num.textContent = order ? (i >= 0 ? i + 1 : "") : p.a.s;
    }
    // keep active pins on top
    if (order) order.forEach((id) => this.pinLayer.appendChild(this.pins.get(id).g));
    this.apply();
  }
  select(id) { this.sel = id; this.refresh(); }
  setPlaying(id) { this.playing = id; this.refresh(); }
  setFavs(favs) { for (const [id, p] of this.pins) p.g.classList.toggle("fav", favs.includes(id)); }
  refresh() {
    for (const [id, p] of this.pins) {
      p.g.classList.toggle("sel", id === this.sel);
      p.g.classList.toggle("playing", id === this.playing);
    }
    const id = this.sel || this.playing;
    const p = id && this.pins.get(id);
    if (p) {
      this.selLabel.textContent = p.a.title.length > 34 ? p.a.title.slice(0, 32) + "…" : p.a.title;
      this.selLabel.style.display = "";
      this.pinLayer.appendChild(p.g);
    } else this.selLabel.style.display = "none";
    this.apply();
  }

  setMe(pos) {
    this.meLayer.innerHTML = "";
    this.me = pos;
    if (!pos) return;
    const [x, y] = this.P(pos);
    const g = el("g", { class: "me-marker", transform: `translate(${x},${y})` }, this.meLayer);
    const inner = el("g", {}, g);
    el("circle", { class: "ring", r: 12 }, inner);
    el("circle", { class: "core", r: 7 }, inner);
    this.meInner = inner;
    this.apply();
  }

  // probs: [{id, p}] -> soft glows showing where you might be
  setHeat(probs) {
    this.heatLayer.innerHTML = "";
    for (const { id, p } of probs || []) {
      if (p < 0.04) continue;
      const a = D.byId[id];
      const [x, y] = this.P(a.pos);
      el("circle", { cx: x, cy: y, r: 30 + 90 * p, fill: "url(#heatG)", opacity: Math.min(1, 0.25 + p) }, this.heatLayer);
    }
  }

  focus(pos, zoom = 2.2) {
    const [x, y] = this.P(pos);
    const w = this.full.w / zoom, h = this.full.h / zoom;
    this.vb = this.clamp({ x: x - w / 2, y: y - h / 2, w, h });
    this.apply(true);
  }
  reset() { this.vb = { ...this.full }; this.apply(true); }

  // ---------------------------------------------------------------- render
  k() { // plan units per CSS pixel
    const w = this.svg.clientWidth || 1;
    return this.vb.w / w;
  }
  apply(animate) {
    const { x, y, w, h } = this.vb;
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = this._cur || this.vb;
      const to = { ...this.vb };
      const t0 = performance.now();
      const step = (t) => {
        const u = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - u, 3);
        const v = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        this.setVB(v);
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return;
    }
    this.setVB({ x, y, w, h });
  }
  setVB(v) {
    this._cur = v;
    this.svg.closest(".map-card")?.classList.toggle("zoomed", v.w < this.full.w - 1);
    this.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const k = v.w / (this.svg.clientWidth || 1);
    // keep pins a constant on-screen size (~22px) regardless of zoom / screen width
    // ~20px pins on phones, ~22px on bigger screens; off-path pins shrink
    const s = Math.max(k, 0.55) * (this.svg.clientWidth < 500 ? 0.85 : 1);
    for (const p of this.pins.values()) {
      const big = p.a.id === this.sel ? 1.3 : p.g.classList.contains("dim") ? 0.62 : 1;
      p.g.setAttribute("transform", `translate(${p.x},${p.y}) scale(${s * big})`);
    }
    for (const pl of D.places) {
      if (pl._g) pl._g.setAttribute("transform", `scale(${s})`);
      if (pl._label) {
        const [x, y] = this.P(pl.pos);
        pl._label.setAttribute("x", x + 14 * s);
        pl._label.setAttribute("y", y + 4 * s);
        pl._label.setAttribute("font-size", 11 * s);
        pl._label.style.strokeWidth = 4 * s;
        pl._label.style.display = pl.id === "entrance" || k < 1.2 ? "" : "none";
      }
    }
    if (this.meInner) this.meInner.setAttribute("transform", `scale(${s})`);
    const id = this.sel || this.playing;
    const p = id && this.pins.get(id);
    if (p) {
      const right = p.x > this.W * 0.62;
      this.selLabel.setAttribute("x", p.x + (right ? -18 : 18) * s);
      this.selLabel.setAttribute("y", p.y + 4 * s);
      this.selLabel.setAttribute("text-anchor", right ? "end" : "start");
      this.selLabel.setAttribute("font-size", 13 * s);
      this.selLabel.style.strokeWidth = 4 * s;
    }
  }

  clamp(v) {
    const minW = this.full.w / 5;
    if (v.w < minW) { const c = [v.x + v.w / 2, v.y + v.h / 2]; v.w = minW; v.h = minW * this.full.h / this.full.w; v.x = c[0] - v.w / 2; v.y = c[1] - v.h / 2; }
    if (v.w > this.full.w) return { ...this.full };
    v.x = Math.min(Math.max(v.x, this.full.x), this.full.x + this.full.w - v.w);
    v.y = Math.min(Math.max(v.y, this.full.y), this.full.y + this.full.h - v.h);
    return v;
  }

  toPlan(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return [this.vb.x + (clientX - r.left) / r.width * this.vb.w, this.vb.y + (clientY - r.top) / r.height * this.vb.h];
  }

  pickAt(clientX, clientY) {
    const [px, py] = this.toPlan(clientX, clientY);
    const k = this.k();
    let best = null, bd = Infinity;
    for (const [id, p] of this.pins) {
      const dimmed = p.g.classList.contains("dim");
      const d = Math.hypot(p.x - px, p.y - py) / k * (dimmed ? 1.6 : 1);
      if (d < 28 && d < bd) { best = id; bd = d; }
    }
    for (const pl of D.places) {
      if (!["paik", "sr-a"].includes(pl.id)) continue;
      const [x, y] = this.P(pl.pos);
      const d = Math.hypot(x - px, y - py) / k * 1.2;
      if (d < 24 && d < bd) { best = pl.id; bd = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- input
  bind() {
    const s = this.svg;
    const pts = new Map();
    let start = null, moved = false, pressTimer = null, pinch = null;

    s.addEventListener("pointerdown", (e) => {
      try { s.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved = false;
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, vb: { ...this.vb } };
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          if (!moved && pts.size === 1) {
            const [x, y] = this.toPlan(start.x, start.y);
            moved = true; // swallow the click
            navigator.vibrate?.(20);
            this.onLongPress?.([x / this.W, y / this.H]);
          }
        }, 550);
      } else if (pts.size === 2) {
        clearTimeout(pressTimer);
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], vb: { ...this.vb } };
        moved = true;
      }
    });
    s.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = s.getBoundingClientRect();
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const f = pinch.d / d;
        const v = pinch.vb;
        const mx = v.x + (pinch.mid[0] - r.left) / r.width * v.w;
        const my = v.y + (pinch.mid[1] - r.top) / r.height * v.h;
        const w = v.w * f, h = v.h * f;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.vb = this.clamp({ x: mx - (mid[0] - r.left) / r.width * w, y: my - (mid[1] - r.top) / r.height * h, w, h });
        this.apply();
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; clearTimeout(pressTimer); }
      if (moved && this.vb.w < this.full.w - 1) {
        s.classList.add("dragging");
        this.vb = this.clamp({ ...start.vb, x: start.vb.x - dx / r.width * start.vb.w, y: start.vb.y - dy / r.height * start.vb.h });
        this.apply();
      }
    });
    const end = (e) => {
      clearTimeout(pressTimer);
      const wasTap = pts.size === 1 && !moved && start;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { s.classList.remove("dragging"); }
      if (wasTap && e.type === "pointerup") {
        const id = this.pickAt(e.clientX, e.clientY);
        this.onPick?.(id);
      }
      if (pts.size === 0) start = null;
      else { const [p] = [...pts.values()]; start = { x: p[0], y: p[1], vb: { ...this.vb } }; }
    };
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", end);
    s.addEventListener("wheel", (e) => {
      e.preventDefault();
      const [mx, my] = this.toPlan(e.clientX, e.clientY);
      const f = Math.exp(e.deltaY * 0.0015);
      const v = this.vb;
      const w = v.w * f, h = v.h * f;
      this.vb = this.clamp({ x: mx - (mx - v.x) * f, y: my - (my - v.y) * f, w, h });
      this.apply();
    }, { passive: false });
    s.addEventListener("dblclick", (e) => {
      const [x, y] = this.toPlan(e.clientX, e.clientY);
      if (this.vb.w < this.full.w * 0.6) return this.reset();
      this.focus([x / this.W, y / this.H], 2.4);
    });
  }
}
