// Teacher mode: tally a class from hand-in PDFs (full answers) and/or pasted codes (countable answers).
import { D, loadData, colorOf } from "./data.js";
import { VIBES, decode } from "./code.js";

await loadData();
const ids = D.artworks.map((a) => a.id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (s) => document.querySelector(s);
const fromPdf = new Map(); // code -> {name, cls, r, file}

async function readPdf(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let txt = "";
  for (let i = 0; i < buf.length; i += 65536) txt += String.fromCharCode(...buf.subarray(i, i + 65536));
  const m = /BMDATA:([A-Za-z0-9+/=]+)/.exec(txt);
  if (!m) return { file: file.name, error: "no Black Mirror data found" };
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    return { ...data, file: file.name };
  } catch { return { file: file.name, error: "couldn’t read the data" }; }
}
async function addFiles(list) {
  for (const f of list) {
    const d = await readPdf(f);
    if (d.error) { fromPdf.set("err:" + f.name, d); continue; }
    fromPdf.set(d.code, d);
  }
  render();
}

function entries() {
  const out = [];
  for (const d of fromPdf.values()) {
    if (d.error) continue;
    const dec = decode(d.code, ids);
    out.push({ src: "PDF", code: d.code, name: d.name, cls: d.cls, dec, full: d.r, file: d.file });
  }
  const seen = new Set(out.map((e) => e.code));
  for (const line of $("#codes").value.split("\n")) {
    const m = /(BM-?[0-9A-Za-z]{4}-?[0-9A-Za-z]{4})\s*(.*)/i.exec(line.trim());
    if (!m) continue;
    const dec = decode(m[1], ids);
    const code = m[1].toUpperCase();
    if (!dec || seen.has(code)) { if (!dec) out.push({ src: "code", code, name: m[2], bad: true }); continue; }
    seen.add(code);
    out.push({ src: "code", code, name: m[2], dec });
  }
  return out;
}

function render() {
  const es = entries(), ok = es.filter((e) => e.dec);
  const errs = [...fromPdf.values()].filter((d) => d.error);
  if (!es.length && !errs.length) { $("#out").innerHTML = ""; return; }
  const pts = {};
  ok.forEach((e) => e.dec.top.forEach((id, k) => { if (id) pts[id] = (pts[id] || 0) + (3 - k); }));
  const board = Object.entries(pts).sort((a, b) => b[1] - a[1]);
  const max = board[0]?.[1] || 1;
  const vc = Object.fromEntries(VIBES.map((v) => [v.id, 0]));
  ok.forEach((e) => e.dec.vibes.forEach((v) => vc[v]++));
  const vmax = Math.max(1, ...Object.values(vc));
  const temps = ok.map((e) => e.dec.temp).filter(Boolean);
  const avg = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : "–";
  const p3 = { A: 0, B: 0, C: 0 }; ok.forEach((e) => e.dec.p3 && p3[e.dec.p3]++);
  const remix = ok.filter((e) => e.dec.remix).length;
  const full = ok.filter((e) => e.full);
  const six = full.filter((e) => e.full.p4?.mode === "six" && e.full.p4.six).map((e) => ({ t: e.full.p4.six, who: e.name }));
  const arch = full.filter((e) => e.full.p4?.mode === "2080" && e.full.p4.arch?.text).map((e) => ({ t: e.full.p4.arch.text, who: e.name }));
  const c35 = full.filter((e) => e.full.p3?.mode === "C" && e.full.p3.c?.text).map((e) => ({ t: e.full.p3.c.text, who: e.name }));
  const quote = (q) => `<blockquote>${esc(q.t)}<cite>${esc(q.who || "")}</cite></blockquote>`;

  $("#out").innerHTML = `
    <div class="t-grid">
      <div class="card"><h3>Class top works</h3><p>${ok.length} students · #1 = 3 pts, #2 = 2, #3 = 1</p>
        <div class="lb" style="margin-top:12px">${board.slice(0, 12).map(([id, p], i) => { const a = D.byId[id]; return `<div class="lb-row" style="--c:${colorOf(a.s)}"><b>${i + 1}</b><img src="${a.thumb}" alt=""><div><b>${esc(a.title)}</b><small>${esc(a.name)} · path ${a.s}</small><div class="lb-bar" style="width:${(p / max) * 100}%"></div></div><span class="pts">${p}</span></div>`; }).join("") || "<p>No picks yet.</p>"}</div>
      </div>
      <div class="card"><h3>The mood in the room</h3>
        ${VIBES.map((v) => `<div class="vb" style="--v:${v.c}"><span style="font-size:18px">${v.e}</span><div><div style="font-size:12px;color:var(--muted)">${esc(v.t)}</div><i style="width:${(vc[v.id] / vmax) * 100}%"></i></div><b>${vc[v.id]}</b></div>`).join("")}
        <p style="margin-top:14px">Average hope</p><div class="big">${avg}<span style="font-size:16px;color:var(--muted)"> / 10</span></div>
        <p style="margin-top:10px">Part 3 choices: 🗯️ argue ${p3.A} · 🧵 connect ${p3.B} · 🖼️ 35th work ${p3.C}<br>Remixes attached: ${remix} / ${ok.length}</p>
      </div>
    </div>
    ${six.length ? `<div class="card" style="margin-top:12px"><h3>Six-word reviews</h3><div class="wall">${six.map(quote).join("")}</div></div>` : ""}
    ${c35.length ? `<div class="card"><h3>The 35th work</h3><div class="wall">${c35.map(quote).join("")}</div></div>` : ""}
    ${arch.length ? `<div class="card"><h3>Archaeologists of 2080</h3><div class="wall">${arch.map(quote).join("")}</div></div>` : ""}
    <div class="card"><h3>Hand-ins</h3>
      <table><tr><th>Name</th><th>Class</th><th>Code</th><th>From</th></tr>
      ${es.map((e) => `<tr><td>${esc(e.name || "")}</td><td>${esc(e.cls || "")}</td><td><code>${esc(e.code)}</code>${e.bad ? " ⚠️ typo?" : ""}</td><td>${e.src === "PDF" ? esc(e.file) : "pasted"}</td></tr>`).join("")}
      ${errs.map((d) => `<tr><td colspan="3">⚠️ ${esc(d.error)}</td><td>${esc(d.file)}</td></tr>`).join("")}
      </table>
      <div class="path-actions" style="margin-top:12px"><button class="btn small" id="csv">⬇ Download CSV</button></div>
    </div>`;
  $("#csv").onclick = () => {
    const rows = [["name", "class", "code", "top1", "top2", "top3", "moods", "hope", "part3", "part4", "remix", "six_words"]];
    for (const e of ok) rows.push([e.name, e.cls, e.code, ...e.dec.top.map((id) => D.byId[id]?.title || ""), e.dec.vibes.join(" "), e.dec.temp, e.dec.p3, e.dec.p4, e.dec.remix ? "yes" : "no", e.full?.p4?.six || ""]);
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "black-mirror-class.csv"; a.click();
  };
}

const drop = $("#drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".pdf"))));
$("#files").onchange = (e) => addFiles([...e.target.files]);
$("#codes").oninput = render;
