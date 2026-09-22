// Reflection + hand-in: opinions and impressions only, never fact checks.
// Answers autosave on the phone; "Make my PDF" renders one designed A4 page.
import { D, colorOf } from "./data.js";
import { store, emit, remixes } from "./store.js";
import { VIBES, encode } from "./code.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const blank = () => ({ name: "", cls: "", top: [{}, {}, {}], vibes: [], temp: 5, p3: { mode: "", a: {}, b: { links: [], text: "" }, c: { text: "" } }, p4: { mode: "six", six: "", arch: {} }, remix: null });
const SLOTS = [
  { k: "Stopped me", q: "The one you stood in front of the longest. What held you there?" },
  { k: "Head-tilter", q: "The one that confused you, or that you’re still not sure about. Why?" },
  { k: "Too close to now", q: "The one that felt least like fiction, like it’s already happening. Where do you see it?" },
];
const words = (s) => (s.trim().match(/\S+/g) || []).length;

class Reflect {
  constructor() {
    this.root = document.getElementById("me");
    this.r = { ...blank(), ...(store.get("reflect") || {}) };
  }
  save() { store.set({ reflect: this.r }); this.progress(); }

  // ---------------------------------------------------------------- form
  async render() {
    const r = this.r;
    this.remixList = await remixes.all();
    const pick = (slotAttr, id, label = "Pick a work") => {
      const a = id && D.byId[id];
      return `<button class="pickbtn" ${slotAttr}>${a ? `<img src="${a.thumb}" alt=""><span><b>${esc(a.title)}</b><small>${esc(a.name)}</small></span><i>change</i>` : `<span class="ph">＋ ${label}</span>`}</button>`;
    };
    this.root.innerHTML = `
      <button class="btn small ghost" data-back>← My picks</button>
      <h2>Reflection</h2>
      <p>No right answers, no fact checks. We want your impressions and opinions. Any of the 34 works counts, not just your path. About 10 to 15 minutes. Answers save on this phone as you type. Hand in by the next lesson.</p>
      <div class="rf-progress"><i id="rfBar"></i></div>

      <section class="rf card"><h3>You</h3>
        <div class="row2"><input class="textin" id="rfName" placeholder="Name" value="${esc(r.name)}"><input class="textin" id="rfCls" placeholder="Class (e.g. 10.B)" value="${esc(r.cls)}" style="max-width:130px"></div>
      </section>

      <section class="rf card"><h3>1 · Your top 3</h3><p>Three works that stayed with you, ranked. Your ♡ saved works show up first in the picker.</p>
        ${SLOTS.map((s, k) => `<div class="slot"><div class="slot-k"><span class="medal">${k + 1}</span>${s.k}</div>
          ${pick(`data-top="${k}"`, r.top[k]?.id)}
          <textarea class="textin ta" data-topwhy="${k}" rows="2" placeholder="${esc(s.q)}">${esc(r.top[k]?.why || "")}</textarea></div>`).join("")}
      </section>

      <section class="rf card"><h3>2 · Vibe check</h3><p>About your #1. Pick 2 or 3 that fit.</p>
        <div class="vibes">${VIBES.map((v) => `<button class="vibe ${r.vibes.includes(v.id) ? "on" : ""}" data-vibe="${v.id}" style="--v:${v.c}"><span>${v.e}</span>${esc(v.t)}</button>`).join("")}</div>
        <p style="margin-top:16px">How much hope is in it?</p>
        <input type="range" class="temp" id="rfTemp" min="1" max="10" step="1" value="${r.temp}">
        <div class="temp-lbl"><span>1 · frozen, no way out</span><b id="rfTempV">${r.temp}</b><span>10 · there’s a way out</span></div>
      </section>

      <section class="rf card"><h3>3 · Pick one</h3><p>Choose whichever you feel like answering.</p>
        <div class="p3-tabs">
          ${[["A", "🗯️", "Argue with it"], ["B", "🧵", "Connect two"], ["C", "🖼️", "The 35th work"]].map(([m, e, t]) => `<button class="p3tab ${r.p3.mode === m ? "on" : ""}" data-p3="${m}"><span>${e}</span>${t}</button>`).join("")}
        </div>
        <div id="p3body"></div>
      </section>

      <section class="rf card"><h3>4 · Say it short</h3>
        <div class="seg" style="margin-bottom:10px"><button data-p4="six" class="${r.p4.mode === "six" ? "on" : ""}">Six words</button><button data-p4="2080" class="${r.p4.mode === "2080" ? "on" : ""}">Archaeologist 2080</button></div>
        <div id="p4body"></div>
      </section>

      <section class="rf card"><h3>5 · Your remix <small class="rec">highly recommended</small></h3>
        <div id="p5body"></div>
      </section>

      <section class="rf card hand"><h3>Hand it in</h3>
        <p>Makes a one-page PDF on your phone. Send it to your teacher (email or Classroom). Your code is printed on it too.</p>
        <button class="btn primary" id="rfPdf">📄 Make my PDF</button>
        <div id="rfOut"></div>
      </section>`;
    this.bind();
    this.renderP3(); this.renderP4(); this.renderP5(); this.progress();
  }

  bind() {
    const $ = (s) => this.root.querySelector(s);
    const r = this.r;
    $("[data-back]").onclick = () => emit("me-home");
    $("#rfName").oninput = (e) => { r.name = e.target.value; this.save(); };
    $("#rfCls").oninput = (e) => { r.cls = e.target.value; this.save(); };
    this.root.querySelectorAll("[data-top]").forEach((b) => (b.onclick = () => this.picker((id) => { r.top[+b.dataset.top] = { ...r.top[+b.dataset.top], id }; this.save(); this.render(); })));
    this.root.querySelectorAll("[data-topwhy]").forEach((t) => (t.oninput = () => { r.top[+t.dataset.topwhy].why = t.value; this.save(); }));
    this.root.querySelectorAll("[data-vibe]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.vibe;
      if (r.vibes.includes(id)) r.vibes = r.vibes.filter((x) => x !== id);
      else { if (r.vibes.length >= 3) return emit("toast", "Max 3. Untick one first."); r.vibes.push(id); }
      b.classList.toggle("on", r.vibes.includes(id)); this.save();
    }));
    $("#rfTemp").oninput = (e) => { r.temp = +e.target.value; $("#rfTempV").textContent = r.temp; this.save(); };
    this.root.querySelectorAll("[data-p3]").forEach((b) => (b.onclick = () => { r.p3.mode = b.dataset.p3; this.root.querySelectorAll("[data-p3]").forEach((x) => x.classList.toggle("on", x === b)); this.save(); this.renderP3(); }));
    this.root.querySelectorAll("[data-p4]").forEach((b) => (b.onclick = () => { r.p4.mode = b.dataset.p4; this.root.querySelectorAll("[data-p4]").forEach((x) => x.classList.toggle("on", x === b)); this.save(); this.renderP4(); }));
    $("#rfPdf").onclick = () => this.makePdf();
  }

  renderP3() {
    const r = this.r, box = this.root.querySelector("#p3body");
    if (!r.p3.mode) { box.innerHTML = ""; return; }
    if (r.p3.mode === "A") {
      const a = r.p3.a.id && D.byId[r.p3.a.id];
      box.innerHTML = `<p>Pick a work you disagree with, or think is overrated. What would you tell the artist?</p>
        <button class="pickbtn" data-p3a>${a ? `<img src="${a.thumb}" alt=""><span><b>${esc(a.title)}</b><small>${esc(a.name)}</small></span><i>change</i>` : `<span class="ph">＋ Pick a work</span>`}</button>
        <textarea class="textin ta" rows="3" data-p3text="a" placeholder="Dear artist, …">${esc(r.p3.a.text || "")}</textarea>`;
      box.querySelector("[data-p3a]").onclick = () => this.picker((id) => { r.p3.a.id = id; this.save(); this.renderP3(); });
    }
    if (r.p3.mode === "B") {
      box.innerHTML = `<p>Connect works that talk to each other. Drag from a work on the left to one or more on the right (or tap left, then tap right). Then say what one says to the other.</p>
        <div class="linker" id="linker">
          <div class="lk-col" data-side="L">${D.artworks.map((a) => `<button class="lk" data-id="${a.id}" style="--c:${colorOf(a.s)}"><img src="${a.thumb}" alt=""><span>${esc(a.title)}</span></button>`).join("")}</div>
          <svg class="lk-lines"></svg>
          <div class="lk-col" data-side="R">${D.artworks.map((a) => `<button class="lk" data-id="${a.id}" style="--c:${colorOf(a.s)}"><img src="${a.thumb}" alt=""><span>${esc(a.title)}</span></button>`).join("")}</div>
        </div>
        <div class="lk-list" id="lkList"></div>
        <textarea class="textin ta" rows="3" data-p3text="b" placeholder="What does one say to the other?">${esc(r.p3.b.text || "")}</textarea>`;
      this.bindLinker();
    }
    if (r.p3.mode === "C") {
      box.innerHTML = `<p>If you could add a 35th work about <i>your</i> generation’s dark mirror, what would it be? One or two lines: the object, what it’s made of, where it hangs.</p>
        <textarea class="textin ta" rows="3" data-p3text="c" placeholder="A wall of 1000 phones all showing the same ad…">${esc(r.p3.c.text || "")}</textarea>`;
    }
    box.querySelectorAll("[data-p3text]").forEach((t) => (t.oninput = () => { r.p3[t.dataset.p3text].text = t.value; this.save(); }));
  }

  bindLinker() {
    const r = this.r, box = this.root.querySelector("#linker"), svg = box.querySelector("svg");
    const L = box.querySelector('[data-side="L"]'), R = box.querySelector('[data-side="R"]');
    let from = null, drag = null;
    const center = (el, side) => {
      const b = box.getBoundingClientRect(), e = el.getBoundingClientRect();
      return [side === "L" ? e.right - b.left : e.left - b.left, e.top + e.height / 2 - b.top];
    };
    const draw = () => {
      let s = "";
      const bh = box.clientHeight;
      for (const [l, rr] of r.p3.b.links) {
        const a = L.querySelector(`[data-id="${l}"]`), b = R.querySelector(`[data-id="${rr}"]`);
        const [x1, y1] = center(a, "L"), [x2, y2] = center(b, "R");
        const clip = (y) => Math.max(-20, Math.min(bh + 20, y));
        s += `<path d="M${x1} ${clip(y1)} C${(x1 + x2) / 2} ${clip(y1)}, ${(x1 + x2) / 2} ${clip(y2)}, ${x2} ${clip(y2)}" stroke="${colorOf(D.byId[l].s)}"/>`;
      }
      if (drag) s += `<path class="live" d="M${drag[0]} ${drag[1]} L${drag[2]} ${drag[3]}"/>`;
      svg.innerHTML = s;
      L.querySelectorAll(".lk").forEach((el) => el.classList.toggle("sel", el.dataset.id === from));
      const linked = new Set(r.p3.b.links.flat());
      box.querySelectorAll(".lk").forEach((el) => el.classList.toggle("linked", linked.has(el.dataset.id)));
      this.root.querySelector("#lkList").innerHTML = r.p3.b.links.map(([l, rr], i) => `<span class="lk-pair">${esc(D.byId[l].title)} ↔ ${esc(D.byId[rr].title)} <button data-unlink="${i}" aria-label="Remove">✕</button></span>`).join("") || `<small class="small-print">No connections yet.</small>`;
      this.root.querySelectorAll("[data-unlink]").forEach((b) => (b.onclick = () => { r.p3.b.links.splice(+b.dataset.unlink, 1); this.save(); draw(); }));
    };
    const toggle = (l, rr) => {
      if (l === rr) return emit("toast", "Pick two different works.");
      const i = r.p3.b.links.findIndex(([a, b]) => (a === l && b === rr) || (a === rr && b === l));
      if (i >= 0) r.p3.b.links.splice(i, 1);
      else { if (r.p3.b.links.length >= 6) return emit("toast", "Six connections is plenty."); r.p3.b.links.push([l, rr]); }
      this.save(); draw();
    };
    L.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".lk"); if (!el) return;
      from = el.dataset.id;
      const [x, y] = center(el, "L");
      drag = [x, y, x, y]; draw();
      const move = (ev) => { const b = box.getBoundingClientRect(); drag[2] = ev.clientX - b.left; drag[3] = ev.clientY - b.top; draw(); };
      const up = (ev) => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up);
        const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-side="R"] .lk');
        drag = null;
        if (t) { toggle(from, t.dataset.id); from = null; }
        draw();
      };
      const cancel = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); drag = null; draw(); };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
    });
    R.addEventListener("click", (e) => { const el = e.target.closest(".lk"); if (el && from) { toggle(from, el.dataset.id); from = null; draw(); } else if (el) emit("toast", "Start on the left, then tap a work on the right."); });
    L.addEventListener("scroll", draw, { passive: true });
    R.addEventListener("scroll", draw, { passive: true });
    draw();
  }

  renderP4() {
    const r = this.r, box = this.root.querySelector("#p4body");
    if (r.p4.mode === "six") {
      box.innerHTML = `<p>The whole exhibition in exactly six words.</p>
        <input class="textin" id="rfSix" maxlength="90" placeholder="Yesterday’s promised future broke down today." value="${esc(r.p4.six)}">
        <div class="wc" id="rfWc"></div>`;
      const inp = box.querySelector("#rfSix"), wc = box.querySelector("#rfWc");
      const upd = () => { const n = words(inp.value); wc.textContent = `${n} / 6 words`; wc.className = "wc " + (n === 6 ? "ok" : n > 6 ? "over" : ""); };
      inp.oninput = () => { r.p4.six = inp.value; this.save(); upd(); };
      upd();
    } else {
      const a = r.p4.arch.id && D.byId[r.p4.arch.id];
      box.innerHTML = `<p>This work gets dug out of the ruins in 2080. What will people then think we were obsessed with?</p>
        <button class="pickbtn" data-arch>${a ? `<img src="${a.thumb}" alt=""><span><b>${esc(a.title)}</b><small>${esc(a.name)}</small></span><i>change</i>` : `<span class="ph">＋ Pick a work</span>`}</button>
        <textarea class="textin ta" rows="3" id="rfArch" placeholder="In 2080 they’ll think we…">${esc(r.p4.arch.text || "")}</textarea>`;
      box.querySelector("[data-arch]").onclick = () => this.picker((id) => { r.p4.arch.id = id; this.save(); this.renderP4(); });
      box.querySelector("#rfArch").oninput = (e) => { r.p4.arch.text = e.target.value; this.save(); };
    }
  }

  renderP5() {
    const r = this.r, box = this.root.querySelector("#p5body");
    const list = this.remixList;
    if (!list.length) {
      box.innerHTML = `<div class="warnbox">⚠️ No remix yet. It’s the fun part and makes your hand-in look great: take a photo of a work, add a filter, stickers and a caption.</div>
        <button class="btn small" data-golab>🎨 Open Remix Lab</button>`;
      box.querySelector("[data-golab]").onclick = () => emit("go", "lab");
      return;
    }
    if (r.remix && !list.find((x) => x.id === r.remix)) r.remix = null;
    box.innerHTML = `<p>Tap one to put it on your page.</p><div class="gallery">${list.map((x) => `<figure class="${x.id === r.remix ? "chosen" : ""}" data-rmx="${x.id}"><img src="${URL.createObjectURL(x.blob)}" alt=""></figure>`).join("")}</div>`;
    box.querySelectorAll("[data-rmx]").forEach((f) => (f.onclick = () => { r.remix = r.remix === f.dataset.rmx ? null : f.dataset.rmx; this.save(); this.renderP5(); }));
  }

  // ---------------------------------------------------------------- picker
  picker(cb) {
    const favs = store.get("favs");
    const order = [...favs.map((id) => D.byId[id]).filter(Boolean), ...D.artworks.filter((a) => !favs.includes(a.id))];
    const dlg = document.createElement("dialog");
    dlg.className = "settings picker";
    dlg.innerHTML = `<div class="set-head"><h2>Pick a work</h2><button class="icon-btn" data-x>✕</button></div>
      <div class="set-body"><div class="pick-grid">${order.map((a) => `<button data-id="${a.id}" style="--c:${colorOf(a.s)}"><img src="${a.thumb}" alt="">${favs.includes(a.id) ? "<em>♡</em>" : ""}<b>${esc(a.title)}</b><small>${a.s} · ${esc(a.name)}</small></button>`).join("")}</div></div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector("[data-x]").onclick = close;
    dlg.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => { close(); cb(b.dataset.id); }));
  }

  // ---------------------------------------------------------------- checks + PDF
  missing() {
    const r = this.r, m = [];
    if (!r.name.trim()) m.push("your name");
    if (r.top.filter((t) => t.id).length < 3) m.push("all three top picks");
    if (r.vibes.length < 1) m.push("at least one vibe");
    if (!r.p3.mode) m.push("one option in part 3");
    if (r.p4.mode === "six" ? !r.p4.six.trim() : !r.p4.arch.text?.trim()) m.push("part 4");
    return m;
  }
  progress() {
    const r = this.r;
    const done = [r.name.trim(), r.top.filter((t) => t.id).length === 3, r.vibes.length, r.p3.mode, r.p4.six.trim() || r.p4.arch.text?.trim(), r.remix].filter(Boolean).length;
    const bar = this.root.querySelector("#rfBar");
    if (bar) bar.style.width = (done / 6) * 100 + "%";
  }

  async makePdf() {
    const miss = this.missing();
    if (miss.length) return emit("toast", "Still missing: " + miss.join(", "));
    if (!this.r.remix && !confirm("No remix on your page. It’s highly recommended (and the fun part). Make the PDF anyway?")) return;
    const out = this.root.querySelector("#rfOut");
    out.innerHTML = `<p class="small-print">Making your page…</p>`;
    const code = encode(this.r, D.artworks.map((a) => a.id));
    const canvas = await renderPage(this.r, code, this.remixList);
    const jpg = canvas.toDataURL("image/jpeg", 0.86);
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    pdf.addImage(jpg, "JPEG", 0, 0, 595.28, 841.89);
    const data = { v: 1, code, name: this.r.name, cls: this.r.cls, r: { ...this.r, remix: !!this.r.remix } };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    pdf.setProperties({ title: `Black Mirror reflection · ${this.r.name}`, subject: code, keywords: "BMDATA:" + b64, creator: "Black Mirror pocket guide" });
    const blob = pdf.output("blob");
    const fname = `BlackMirror_${(this.r.name || "student").replace(/[^\p{L}\p{N}]+/gu, "_")}_${(this.r.cls || "").replace(/[^\p{L}\p{N}]+/gu, "")}.pdf`;
    const file = new File([blob], fname, { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    out.innerHTML = `<div class="codebox"><small>Your code</small><b>${code}</b></div>
      <img class="pdf-prev" src="${jpg}" alt="Preview of your page">
      <div class="path-actions"><button class="btn primary" id="rfShare">↗ Send / share</button><a class="btn" href="${url}" download="${fname}">⬇ Download PDF</a></div>
      <p class="small-print">Tip: email it to your teacher or upload it to Classroom. Size: ${Math.round(blob.size / 1024)} KB.</p>`;
    out.querySelector("#rfShare").onclick = async () => {
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Black Mirror reflection" }); } catch {} }
      else out.querySelector("a[download]").click();
    };
    out.scrollIntoView({ behavior: "smooth" });
  }
}

function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => res(window.jspdf);
    s.onerror = () => rej(new Error("Couldn’t load the PDF maker. Are you online?"));
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------- the page (A4 @ 150 dpi)
const W = 1240, H = 1754, M = 70;
const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function wrap(g, text, x, y, maxW, lh, maxLines = 99) {
  const ws = String(text || "").split(/\s+/); let line = "", n = 0;
  for (const w of ws) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) {
      if (++n >= maxLines) { g.fillText(line + " …", x, y); return y + lh; }
      g.fillText(line, x, y); y += lh; line = w;
    } else line = t;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}
function cover(g, im, x, y, w, h, r = 14) {
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, r); g.clip();
  if (im) { const s = Math.max(w / im.width, h / im.height); g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s); }
  else { g.fillStyle = "#ddd"; g.fillRect(x, y, w, h); }
  g.restore();
}
async function renderPage(r, code, remixList) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const F = (w, s) => `${w} ${s}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  const SERIF = (s, it = "") => `${it} ${s}px Georgia, "Iowan Old Style", serif`;
  g.fillStyle = "#f6f5f1"; g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = "#0b0d10"; g.fillRect(0, 0, W, 170);
  g.fillStyle = "#fff"; g.font = F(800, 40); g.fillText("BLACK MIRROR", M, 78);
  g.fillStyle = "#9aa6b2"; g.font = F(500, 22); g.fillText("The Long Shadow of the Future · Ludwig Museum · visit reflection", M, 118);
  g.textAlign = "right"; g.fillStyle = "#fff"; g.font = F(700, 30); g.fillText(r.name + (r.cls ? " · " + r.cls : ""), W - M, 78);
  g.fillStyle = "#9aa6b2"; g.font = F(500, 22); g.fillText(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 118);
  g.textAlign = "left"; g.fillStyle = "#7fb2cf"; g.fillRect(M, 150, 160, 4);

  let y = 220;
  const head = (t) => { g.fillStyle = "#6b7682"; g.font = F(700, 20); g.fillText(t.toUpperCase(), M, y); y += 18; };
  // 1 top 3
  head("1 · My top 3");
  const cw = (W - 2 * M - 40) / 3;
  const ims = await Promise.all(r.top.map((t) => (t.id ? img(D.byId[t.id].image) : null)));
  let maxY = y;
  r.top.forEach((t, k) => {
    const a = D.byId[t.id], x = M + k * (cw + 20), yy = y + 14;
    cover(g, ims[k], x, yy, cw, 230);
    g.fillStyle = colorOf(a.s); g.beginPath(); g.arc(x + 30, yy + 30, 22, 0, 7); g.fill();
    g.fillStyle = "#0b0d10"; g.font = F(800, 24); g.textAlign = "center"; g.fillText(String(k + 1), x + 30, yy + 39); g.textAlign = "left";
    g.fillStyle = "#6b7682"; g.font = F(700, 17); g.fillText(SLOTS[k].k.toUpperCase(), x, yy + 262);
    g.fillStyle = "#0b0d10"; g.font = F(700, 24); let ty = wrap(g, a.title, x, yy + 292, cw, 28, 2);
    g.fillStyle = "#555"; g.font = F(500, 19); ty = wrap(g, a.name, x, ty, cw, 24, 1);
    g.fillStyle = "#222"; g.font = SERIF(21, "italic"); ty = wrap(g, t.why ? `“${t.why}”` : "", x, ty + 6, cw, 28, 6);
    maxY = Math.max(maxY, ty);
  });
  y = maxY + 40;
  // 2 vibes
  head("2 · Vibe check (about #1)");
  y += 14; let x = M;
  g.font = F(600, 22);
  for (const id of r.vibes) {
    const v = VIBES.find((q) => q.id === id), label = `${v.e}  ${v.t}`, w = g.measureText(label).width + 36;
    if (x + w > W - M) { x = M; y += 58; }
    g.fillStyle = v.c + "55"; g.beginPath(); g.roundRect(x, y, w, 46, 23); g.fill();
    g.fillStyle = "#111"; g.fillText(label, x + 18, y + 31); x += w + 12;
  }
  y += 80;
  g.fillStyle = "#333"; g.font = F(600, 20); g.fillText("How much hope is in it?", M, y); y += 20;
  const bw = W - 2 * M, grad = g.createLinearGradient(M, 0, M + bw, 0);
  grad.addColorStop(0, "#86cfee"); grad.addColorStop(0.5, "#c9c3d6"); grad.addColorStop(1, "#f5a25d");
  g.fillStyle = grad; g.beginPath(); g.roundRect(M, y, bw, 22, 11); g.fill();
  const tx = M + ((r.temp - 1) / 9) * bw;
  g.fillStyle = "#0b0d10"; g.beginPath(); g.arc(tx, y + 11, 20, 0, 7); g.fill();
  g.fillStyle = "#fff"; g.font = F(800, 20); g.textAlign = "center"; g.fillText(String(r.temp), tx, y + 18); g.textAlign = "left";
  g.fillStyle = "#6b7682"; g.font = F(500, 17); g.fillText("frozen, no way out", M, y + 50); g.textAlign = "right"; g.fillText("there’s a way out", W - M, y + 50); g.textAlign = "left";
  y += 100;
  // 3 + remix side by side
  const colW = r.remix ? 600 : W - 2 * M;
  const remix = r.remix && remixList.find((q) => q.id === r.remix);
  const top3 = y;
  head({ A: "3 · Arguing with a work", B: "3 · Works that talk to each other", C: "3 · The 35th work" }[r.p3.mode]);
  y += 14;
  if (r.p3.mode === "A") {
    const a = D.byId[r.p3.a.id];
    if (a) { cover(g, await img(a.thumb), M, y, 110, 82, 10); g.fillStyle = "#0b0d10"; g.font = F(700, 22); wrap(g, a.title, M + 126, y + 30, colW - 130, 26, 2); g.fillStyle = "#555"; g.font = F(500, 18); g.fillText(a.name, M + 126, y + 76); y += 104; }
    g.fillStyle = "#222"; g.font = SERIF(23); y = wrap(g, r.p3.a.text, M, y + 10, colW, 32, 8);
  } else if (r.p3.mode === "B") {
    for (const [l, rr] of r.p3.b.links.slice(0, 4)) {
      const a = D.byId[l], b = D.byId[rr];
      cover(g, await img(a.thumb), M, y, 80, 60, 8); cover(g, await img(b.thumb), M + colW - 80, y, 80, 60, 8);
      g.strokeStyle = colorOf(a.s); g.lineWidth = 4; g.beginPath(); g.moveTo(M + 90, y + 30); g.lineTo(M + colW - 90, y + 30); g.stroke();
      g.fillStyle = "#333"; g.font = F(600, 17); g.textAlign = "center"; g.fillText(`${a.title.split(" (")[0]}  ↔  ${b.title.split(" (")[0]}`.slice(0, 60), M + colW / 2, y + 22); g.textAlign = "left";
      y += 74;
    }
    g.fillStyle = "#222"; g.font = SERIF(23); y = wrap(g, r.p3.b.text, M, y + 12, colW, 32, 6);
  } else {
    g.fillStyle = "#222"; g.font = SERIF(26, "italic"); y = wrap(g, r.p3.c.text, M, y + 16, colW, 36, 7);
  }
  y += 30;
  head(r.p4.mode === "six" ? "4 · The exhibition in six words" : "4 · Archaeologist of 2080");
  y += 20;
  if (r.p4.mode === "six") { g.fillStyle = "#0b0d10"; g.font = F(800, 38); y = wrap(g, r.p4.six, M, y + 22, colW, 48, 3); }
  else {
    const a = D.byId[r.p4.arch.id];
    if (a) { g.fillStyle = "#6b7682"; g.font = F(600, 19); g.fillText(`about “${a.title}”`, M, y + 8); y += 26; }
    g.fillStyle = "#222"; g.font = SERIF(23); y = wrap(g, r.p4.arch.text, M, y + 14, colW, 32, 7);
  }
  if (remix) {
    const im = await img(URL.createObjectURL(remix.blob));
    const rx = M + colW + 40, rw = W - M - rx, rh = Math.min(700, rw * (im.height / im.width));
    g.fillStyle = "#6b7682"; g.font = F(700, 20); g.fillText("5 · MY REMIX", rx, top3);
    g.save(); g.shadowColor = "#0004"; g.shadowBlur = 24; g.shadowOffsetY = 8; cover(g, im, rx, top3 + 18, rw, rh, 16); g.restore();
  }
  // footer with the code
  g.fillStyle = "#0b0d10"; g.fillRect(0, H - 120, W, 120);
  g.fillStyle = "#9aa6b2"; g.font = F(600, 18); g.fillText("HAND-IN CODE", M, H - 72);
  g.fillStyle = "#fff"; g.font = `700 40px ui-monospace, Menlo, Consolas, monospace`; g.fillText(code, M, H - 32);
  g.textAlign = "right"; g.fillStyle = "#6b7682"; g.font = F(500, 17); g.fillText("made with the Black Mirror pocket guide", W - M, H - 48); g.textAlign = "left";
  return c;
}

export const reflect = new Reflect();
