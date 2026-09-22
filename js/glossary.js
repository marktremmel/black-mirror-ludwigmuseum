// Wiki-style explanations: tricky words get a dotted underline the first time they
// appear in a text; tapping one opens a small friendly card.
let TERMS = [];
let RX = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export async function loadGlossary() {
  try { TERMS = await (await fetch("data/glossary.json")).json(); } catch { TERMS = []; }
  const alts = [];
  TERMS.forEach((t, i) => t.match.forEach((m) => alts.push({ m, i })));
  alts.sort((a, b) => b.m.length - a.m.length); // longest first: "anti-utopia" before "utopia"
  TERMS.forEach((t) => (t.rx = new RegExp(`^(?:${t.match.join("|")})$`, "i")));
  RX = alts.length ? new RegExp(`(?<![\\w-])(${alts.map((a) => a.m).join("|")})(?![\\w-])`, "gi") : null;
  bind();
}

// html: already-escaped sentence text. used: Set of term ids already marked in this text.
export function annotate(html, used) {
  if (!RX) return html;
  return html.replace(RX, (w) => {
    const t = TERMS.find((x) => x.rx.test(w));
    if (!t || used.has(t.id)) return w;
    used.add(t.id);
    return `<button type="button" class="term" data-term="${t.id}">${w}</button>`;
  });
}

let pop;
function bind() {
  pop = document.createElement("div");
  pop.className = "gloss";
  pop.setAttribute("role", "dialog");
  pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".term");
    if (b) { e.stopPropagation(); e.preventDefault(); return show(b); }
    if (!e.target.closest(".gloss")) hide();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  addEventListener("wheel", hide, { passive: true });
  addEventListener("touchmove", hide, { passive: true });
}

function show(b) {
  const t = TERMS.find((x) => x.id === b.dataset.term);
  if (!t) return;
  if (pop.dataset.id === t.id && !pop.hidden) return hide();
  pop.dataset.id = t.id;
  pop.innerHTML = `<b>${esc(t.title)}</b><p>${esc(t.text)}</p>`;
  pop.hidden = false;
  const r = b.getBoundingClientRect();
  const w = Math.min(320, innerWidth - 24);
  pop.style.width = w + "px";
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  const h = pop.offsetHeight;
  const below = r.bottom + 10 + h < innerHeight - 20;
  pop.style.left = left + "px";
  pop.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
}
function hide() { if (pop && !pop.hidden) { pop.hidden = true; pop.dataset.id = ""; } }
