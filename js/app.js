import { D, loadData, nearest, colorOf, STUDIO_VOICES, DEVICE_VOICES, voiceName } from "./data.js";
import { store, on, emit, remixes } from "./store.js";
import { Plan } from "./plan.js";
import { narrator, segMeta } from "./narrator.js";
import { ambient } from "./ambient.js";
import { locator } from "./locate.js";
import { lab } from "./lab.js";
import { loadGlossary, annotate } from "./glossary.js";
import { tour } from "./tour.js";
import { reflect } from "./reflect.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ICON = {
  play: `<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4.2" height="16" rx="1.2"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2"/></svg>`,
  load: `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="M11 5 4 12l7 7M4 12h16"/></svg>`,
  rew: `<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 1-7 7"/><path d="M5 5v5h5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">15</text></svg>`,
  fwd: `<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 0 7 7"/><path d="M19 5v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">15</text></svg>`,
  prev: `<svg viewBox="0 0 24 24"><path d="M6 5v14M19 5 9 12l10 7z" fill="currentColor"/></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/></svg>`,
};
const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const mins = (s) => `${Math.max(1, Math.round(s / 60))} min`;

let plan;
let sheetId = null;

// ---------------------------------------------------------------- boot
applyTextScale();
applyUiZoom();
addEventListener("resize", () => { applyTextScale(); applyUiZoom(); });
await Promise.all([loadData(), loadGlossary()]);
initPlan();
renderChips();
selectPath(store.get("path"), false);
renderThreads();
renderNear();
bindChrome();
bindNarrator();
if (store.get("seenHint")) $("#mapHint").style.opacity = 0;
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
on("studio-index", () => { renderPathHead(); renderStops(); });
if (!store.get("tourDone")) setTimeout(() => tour.start(), 700);

// ---------------------------------------------------------------- plan
function initPlan() {
  plan = new Plan($("#plan"), {
    onPick: (id) => {
      if (!id) { plan.select(null); return; }
      openSheet(id);   // the sheet sits above the full screen map, so it stays open behind
      if (!store.get("seenHint")) { store.set({ seenHint: true }); $("#mapHint").style.opacity = 0; }
    },
    onLongPress: (pos) => {
      store.set({ pos, posAt: Date.now() });
      toast("Got it, you’re here. Showing what’s nearby.");
    },
  });
  $("#zoomReset").onclick = () => plan.reset();
  $("#zoomIn").onclick = () => plan.zoomBy(1 / 1.6);
  $("#zoomOut").onclick = () => plan.zoomBy(1.6);
  // orientation changes and rotations: keep the view inside the plan
  addEventListener("orientationchange", () => setTimeout(() => { if (mapFull) fitRotation(); plan.reset(); }, 250));
  $("#mapFull").onclick = () => toggleMapFull();
  $("#mapRotate").onclick = () => { plan.setRotation(plan.rot ? 0 : 90); };
  plan.setFavs(store.get("favs"));
  if (store.get("pos")) plan.setMe(store.get("pos"));
  store.on((patch) => {
    if ("pos" in patch) { plan.setMe(patch.pos); renderNear(); }
    if ("favs" in patch) { plan.setFavs(patch.favs); renderMe(); }
  });
  on("heat", (h) => { plan.setHeat(h); clearTimeout(initPlan.t); initPlan.t = setTimeout(() => plan.setHeat([]), 8000); });
}

let mapFull = false;
const portrait = () => innerHeight > innerWidth * 1.1;
function fitRotation() { plan.setRotation(mapFull && portrait() ? 90 : 0); }
function toggleMapFull(on = !mapFull) {
  mapFull = on;
  $("#mapCard").classList.toggle("full", on);
  $("#mapFull").textContent = on ? "✕" : "⛶";
  $("#mapFull").setAttribute("aria-label", on ? "Close full screen map" : "Full screen map");
  $("#mapRotate").hidden = !on;
  document.body.style.overflow = on ? "hidden" : "";
  fitRotation();
  requestAnimationFrame(() => plan.reset());
}

// ---------------------------------------------------------------- paths
function renderChips() {
  const box = $("#pathChips");
  box.innerHTML = [["all", "All", "#9aa6b2", "Everything"], ...D.sections.map((s) => [s.id, s.id, s.color, s.title])]
    .map(([id, letter, c, t]) => `<button class="path-chip" data-path="${id}" style="--c:${c}"><i>${letter === "All" ? "★" : letter}</i>${esc(t)}</button>`).join("");
  $$(".path-chip", box).forEach((b) => (b.onclick = () => selectPath(b.dataset.path)));
}

function selectPath(id, scroll = true) {
  store.set({ path: id });
  $$(".path-chip").forEach((b) => b.classList.toggle("on", b.dataset.path === id));
  plan.setPath(id);
  renderPathHead();
  renderStops();
  if (id !== "all") ambient.setMood(D.section[id].mood);
  if (scroll) $(`.path-chip[data-path="${id}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

// Safari's "Request Desktop Website" ignores the viewport meta and lays the page out at ~980px,
// which shrinks everything on a phone. We can't override that, but page zoom cancels it out.
// A touch device laying out at desktop width, where either the layout is wider than the
// physical screen or the pixel ratio has been diluted by the fake ~980px viewport.
// A real tablet fails both tests, so it never sees any of this.
function desktopMode() {
  const el = document.documentElement;
  const zoom = parseFloat(el.style.zoom) || 1;          // measure the untouched layout width
  const layout = innerWidth * zoom;
  return layout >= 700 && matchMedia("(pointer: coarse)").matches
    && (layout > screen.width * 1.25 || devicePixelRatio * zoom < 2);
}
// Recomputed every time (never stored as a number): a saved factor from one screen would be
// wrong on the next, and would blow the interface up.
function applyUiZoom() {
  const el = document.documentElement;
  const on = store.get("autoFit") && desktopMode();
  el.style.zoom = on ? Math.min(3, Math.max(1.2, +((innerWidth * (parseFloat(el.style.zoom) || 1)) / 390).toFixed(2))) : "";
  setTimeout(desktopHint, 600);
}
function desktopHint() {
  const bar = $("#fitbar");
  if (!desktopMode() || store.get("autoFit") || store.get("hideDesktopHint")) { bar.hidden = true; return; }
  bar.hidden = false;
  $("#fitNow").onclick = () => {
    store.set({ autoFit: true });
    applyUiZoom();
    bar.hidden = true;
    setTimeout(() => { plan.reset(); applyTextScale(); }, 100);
    toast("Scaled to your screen. Undo it in ⚙.");
  };
  $("#fitDismiss").onclick = () => { store.set({ hideDesktopHint: true }); bar.hidden = true; };
}

// Everything in the UI is sized in rem, so one number scales the whole interface.
function applyTextScale() {
  document.documentElement.style.fontSize = (16 * (store.get("textScale") || 1)).toFixed(2) + "px";
}

function segDur(seg) { return narrator.indexes[store.get("voice")]?.[seg]?.dur; }
function estDur(seg) {
  return segDur(seg) ?? D.segments[seg].sentences.reduce((n, s) => n + s.s.length, 0) / 14.5;
}
function pathQueue(pid) {
  const stops = D.pathOf[pid].stops;
  const q = [`section-${pid}`];
  stops.forEach((id, i) => q.push(`bridge-${pid}-${i}`, id));
  q.push(`outro-${pid}`);
  return q;
}

function renderPathHead() {
  const id = store.get("path");
  const head = $("#pathHead");
  if (id === "all") {
    head.style.setProperty("--c", "#7fb2cf");
    head.innerHTML = `<div class="kicker"><i>★</i>Start here · entrance</div>
      <h2>Black Mirror. The Long Shadow of the Future</h2>
      <p>34 works, five thematic paths through one floor. Pick a path above, or wander and tap any dot. Everything can be heard, not just read.</p>
      <div class="path-actions">
        <button class="btn primary" data-play="intro">${ICON.play} Entrance wall text · ${mins(estDur("intro") / store.get("rate"))}</button>
        <button class="btn" data-open="paik">Nam June Paik</button>
      </div>`;
  } else {
    const s = D.section[id];
    const q = pathQueue(id);
    const total = q.reduce((n, seg) => n + estDur(seg), 0) / store.get("rate");
    head.style.setProperty("--c", s.color);
    head.innerHTML = `<div class="kicker"><i>${s.id}</i>Path ${s.id} · ${D.pathOf[id].stops.length} works · ~${mins(total)} of listening</div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.tagline)} <span style="opacity:.7">(${esc(s.hu)})</span></p>
      <div class="path-actions">
        <button class="btn primary" data-podcast="${id}">${ICON.play} Play path as a podcast</button>
        <button class="btn" data-play="section-${id}">Room intro · ${mins(estDur(`section-${id}`) / store.get("rate"))}</button>
      </div>`;
  }
  $$("[data-play]", head).forEach((b) => (b.onclick = () => { startAmbientIfWanted(); narrator.play(b.dataset.play); }));
  $$("[data-open]", head).forEach((b) => (b.onclick = () => openSheet(b.dataset.open)));
  $$("[data-podcast]", head).forEach((b) => (b.onclick = () => startPodcast(b.dataset.podcast)));
}

function startPodcast(pid, fromStop = null) {
  startAmbientIfWanted();
  const q = pathQueue(pid);
  const i = fromStop ? Math.max(0, q.indexOf(fromStop) - 1) : 0;
  narrator.playQueue(q, i, pid);
  toast(`Path ${pid} podcast · the voice tells you where to walk next`);
}

function renderStops() {
  const id = store.get("path");
  const ids = id === "all" ? D.sections.flatMap((s) => D.pathOf[s.id].stops) : D.pathOf[id].stops;
  $("#stopList").innerHTML = ids.map((aid) => {
    const a = D.byId[aid];
    const d = estDur(aid) / store.get("rate");
    const done = store.get("listened")[aid] ? " · heard" : "";
    return `<li class="stop ${narrator.seg === aid ? "playing" : ""}" data-id="${aid}" style="--c:${colorOf(a.s)}">
      <span class="n">${id === "all" ? a.s : D.order[aid]}</span>
      <img src="${a.thumb}" alt="" loading="lazy">
      <span class="t"><b>${esc(a.title)}</b><small>${esc(a.name)} · ${mins(d)}${done}</small></span>
      <button class="play" data-play="${aid}" aria-label="Listen to ${esc(a.title)}">${narrator.seg === aid && narrator.playing ? ICON.pause : ICON.play}</button>
    </li>`;
  }).join("");
  $$(".stop").forEach((li) => (li.onclick = (e) => {
    if (e.target.closest(".play")) return;
    openSheet(li.dataset.id);
  }));
  $$(".stop .play").forEach((b) => (b.onclick = () => playArtwork(b.dataset.play)));
}

function playArtwork(id) {
  if (narrator.seg === id) return narrator.toggle();
  startAmbientIfWanted();
  const pid = D.byId[id]?.s;
  // inside a running podcast of the same path: jump there instead of breaking the queue
  if (narrator.queueLabel === pid && narrator.queue.includes(id)) {
    narrator.stopAll(); narrator.qi = narrator.queue.indexOf(id); narrator.startItem(0);
  } else narrator.play(id);
}

function renderThreads() {
  $("#threadList").innerHTML = D.threads.map((t) => `<button class="thread" data-thread="${t.id}">
      <b>${esc(t.title)}</b><p>${esc(t.line)}</p>
      <div class="dots">${t.works.map((w) => `<span style="--c:${colorOf(D.byId[w].s)}">${D.byId[w].s} · ${esc(D.byId[w].title.split(" (")[0])}</span>`).join("")}</div>
    </button>`).join("");
  $$(".thread").forEach((b) => (b.onclick = () => {
    const t = D.thread[b.dataset.thread];
    plan.setHeat(t.works.map((id) => ({ id, p: 0.5 })));
    clearTimeout(renderThreads.t); renderThreads.t = setTimeout(() => plan.setHeat([]), 6000);
    openSheet(t.works[0]);
    $("#mapCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }));
}

function renderNear() {
  const pos = store.get("pos");
  $("#nearBox").hidden = !pos;
  if (!pos) return;
  $("#nearList").innerHTML = nearest(pos, 6).map(({ a }) => `<button class="near-card" data-id="${a.id}">
    <img src="${a.thumb}" alt="" loading="lazy"><div><b>${esc(a.title)}</b><small style="color:${colorOf(a.s)}">Path ${a.s}</small> <small>· ${esc(a.name)}</small></div></button>`).join("");
  $$("#nearList .near-card").forEach((b) => (b.onclick = () => openSheet(b.dataset.id)));
}

// ---------------------------------------------------------------- artwork sheet
function textHTML(seg, withTitle = false) {
  const ss = D.segments[seg].sentences;
  const used = new Set();
  let html = "", p = null;
  ss.forEach((s, i) => {
    if (s.p === -1 && !withTitle) return;
    if (s.p !== p) { if (p !== null) html += "</p>"; html += s.p === -1 ? `<p class="t-title">` : "<p>"; p = s.p; }
    html += `<span class="s" data-i="${i}">${annotate(esc(s.d), used)}</span> `;
  });
  return html + "</p>";
}

function openSheet(id) {
  const sh = $("#sheet");
  sheetId = id;
  let body = "";
  if (id === "sr-a") {
    const pl = D.place["sr-a"];
    body = `<div class="sheet-body"><h2>Société Réaliste</h2><p class="meta">Path A’s printed map marks a Société Réaliste stop here in the upper corridor. Their two works in our texts:</p>
      <div class="goes-row" style="margin-top:12px">${pl.works.map(cardHTML).join("")}</div></div>`;
  } else if (id === "paik") {
    body = `<div class="sheet-body">
      <span class="sec-chip">Entrance</span>
      <h2>Nam June Paik</h2><div class="meta">Our handout has no wall text for this one, so here’s some context.</div>
      <div class="actions">${listenBtn("paik")}</div>
      <div class="text" data-seg="paik">${textHTML("paik")}</div></div>`;
  } else {
    const a = D.byId[id];
    plan.select(id);
    const fav = store.get("favs").includes(id);
    const goes = a.threads.map((tid) => {
      const t = D.thread[tid];
      const others = t.works.filter((w) => w !== id);
      return `<div class="goes"><h3 class="eyebrow">Goes with · ${esc(t.title)}</h3><p class="thread-note">${esc(t.line)}</p><div class="goes-row">${others.map(cardHTML).join("")}</div></div>`;
    }).join("");
    body = `<div class="sheet-hero"><img src="${a.image}" alt="${esc(a.title)}"></div>
      <div class="sheet-body" style="--c:${colorOf(a.s)}">
        <span class="sec-chip"><i>${a.s}</i>${esc(D.section[a.s].title)}${D.order[id] ? ` · stop ${D.order[id]}` : ""}</span>
        <h2>${esc(a.title)}</h2>
        <div class="artist">${esc(a.artist)}</div>
        <div class="meta">${esc(a.year)}${a.medium ? " · " + esc(a.medium) : ""}</div>
        <div class="actions">
          ${listenBtn(id)}
          <button class="btn fav-btn ${fav ? "on" : ""}" data-fav="${id}">${ICON.heart} ${fav ? "Saved" : "Save"}</button>
          <button class="btn" data-here="${id}">📍 I’m here</button>
          <button class="btn" data-remix="${id}">🎨 Remix</button>
        </div>
        <div class="text" data-seg="${id}">${textHTML(id)}</div>
        ${a.credit ? `<p class="credit">Text: ${esc(a.credit)} · Ludwig Museum</p>` : ""}
        ${goes}
      </div>`;
  }
  sh.innerHTML = `<div class="sheet-grip"></div><button class="sheet-close" aria-label="Close">✕</button>${body}`;
  sh.hidden = false;
  sh.scrollTop = 0;
  $("#sheetBackdrop").hidden = false;
  $(".sheet-close", sh).onclick = closeSheet;
  $$("[data-listen]", sh).forEach((b) => (b.onclick = () => { b.dataset.listen === narrator.seg ? narrator.toggle() : playArtwork(b.dataset.listen); }));
  $$("[data-fav]", sh).forEach((b) => (b.onclick = () => {
    const onNow = store.toggleFav(b.dataset.fav);
    b.classList.toggle("on", onNow);
    b.innerHTML = `${ICON.heart} ${onNow ? "Saved" : "Save"}`;
  }));
  $$("[data-here]", sh).forEach((b) => (b.onclick = () => { store.set({ pos: D.byId[b.dataset.here].pos, posAt: Date.now() }); toast("Location set. Nearby works updated."); }));
  $$("[data-remix]", sh).forEach((b) => (b.onclick = () => { closeSheet(); lab.useArtwork(b.dataset.remix); }));
  $$(".near-card", sh).forEach((b) => (b.onclick = () => openSheet(b.dataset.id)));
  $$(".text .s", sh).forEach((s) => (s.onclick = () => {
    const seg = s.closest(".text").dataset.seg;
    if (narrator.seg !== seg) { playArtwork(seg); setTimeout(() => narrator.seekSentence(+s.dataset.i), 300); }
    else narrator.seekSentence(+s.dataset.i);
  }));
  paintSentence();
  swipeToClose(sh);
}
function cardHTML(id) {
  const a = D.byId[id];
  return `<button class="near-card" data-id="${id}"><img src="${a.thumb}" alt="" loading="lazy"><div><b>${esc(a.title)}</b><small style="color:${colorOf(a.s)}">Path ${a.s}</small> <small>· ${esc(a.name)}</small></div></button>`;
}
function listenBtn(seg) {
  const on = narrator.seg === seg && (narrator.playing || narrator.loading);
  return `<button class="btn primary" data-listen="${seg}">${on ? ICON.pause + " Pause" : ICON.play + " Listen · " + mins(estDur(seg) / store.get("rate"))}</button>`;
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheetBackdrop").hidden = true;
  sheetId = null;
  plan.select(null);
}
function swipeToClose(sh) {
  if (sh._swipe) return;
  sh._swipe = true;
  let y0 = null;
  sh.addEventListener("touchstart", (e) => { if (sh.scrollTop <= 0 || e.target.closest(".sheet-grip")) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0 && sh.scrollTop <= 0) sh.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sh.addEventListener("touchend", (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    sh.style.transform = "";
    y0 = null;
    if (dy > 110 && sh.scrollTop <= 0) closeSheet();
  });
}

// ---------------------------------------------------------------- player UI
function bindNarrator() {
  on("np", ({ seg, meta }) => {
    $("#mini").hidden = false;
    document.body.style.setProperty("--mini-h", "70px");
    $("#miniTitle").textContent = meta.title;
    $("#miniSub").textContent = meta.sub;
    $("#miniImg").src = meta.image;
    $("#mini").style.setProperty("--c", meta.section ? colorOf(meta.section) : "#7fb2cf");
    plan.setPlaying(meta.art || meta.next || null);
    if (meta.section) ambient.setMood(D.section[meta.section].mood);
    renderStops();
    if (!$("#reader").hidden) renderReader();
    if (sheetId) refreshSheetButtons();
  });
  on("state", (s) => {
    if (s.playing) tryAudio?.pause();
    const b = $("#miniPlay");
    b.classList.toggle("loading", s.loading && !s.playing);
    b.innerHTML = s.loading && !s.playing ? ICON.load : s.playing ? ICON.pause : ICON.play;
    const rb = $("#rPlay");
    if (rb) { rb.classList.toggle("loading", s.loading && !s.playing); rb.innerHTML = b.innerHTML; }
    $$(".stop").forEach((li) => {
      const pl = $(".play", li);
      li.classList.toggle("playing", li.dataset.id === s.seg);
      if (pl) pl.innerHTML = li.dataset.id === s.seg && s.playing ? ICON.pause : ICON.play;
    });
    refreshSheetButtons();
  });
  on("sentence", paintSentence);
  on("progress", ({ t, dur }) => {
    const f = dur ? Math.min(1, t / dur) : 0;
    $("#miniBar").style.width = f * 100 + "%";
    const fill = $("#rFill");
    if (fill) {
      fill.style.width = f * 100 + "%";
      $("#rKnob").style.left = f * 100 + "%";
      $("#rT").textContent = fmt(t / (narrator.mode === "studio" ? store.get("rate") : 1));
      $("#rD").textContent = "-" + fmt((dur - t) / (narrator.mode === "studio" ? store.get("rate") : 1));
    }
  });
  on("walking", (w) => {
    if (w) {
      const a = D.byId[w.next];
      $("#miniTitle").textContent = `Walk to: ${a.title}`;
      $("#miniSub").textContent = w.until ? "Next story starts in a moment · tap ▶ when you’re there" : "Tap ▶ when you’re there";
      $("#miniPlay").innerHTML = ICON.next;
      plan.select(a.id);
      if (w.until) {
        clearInterval(bindNarrator.cd);
        bindNarrator.cd = setInterval(() => {
          const s = Math.ceil((w.until - Date.now()) / 1000);
          if (s <= 0 || !narrator.walking) return clearInterval(bindNarrator.cd);
          $("#miniSub").textContent = `Next story in ${s}s · tap ▶ to skip ahead`;
        }, 500);
      }
    } else { clearInterval(bindNarrator.cd); plan.select(sheetId && D.byId[sheetId] ? sheetId : null); }
    if (!$("#reader").hidden) renderReader();
  });
  on("queue-end", () => toast("That’s the end of this path. Try another one?"));
  on("toast", toast);
  $("#miniPlay").onclick = () => { startAmbientIfWanted(); narrator.toggle(); };
  $("#miniOpen").onclick = openReader;
}

function refreshSheetButtons() {
  $$("#sheet [data-listen]").forEach((b) => (b.outerHTML = listenBtn(b.dataset.listen)));
  $$("#sheet [data-listen]").forEach((b) => (b.onclick = () => { b.dataset.listen === narrator.seg ? narrator.toggle() : playArtwork(b.dataset.listen); }));
}

// highlight current sentence wherever this segment's text is on screen
function paintSentence() {
  const seg = narrator.seg, i = narrator.sent;
  $$(".text").forEach((t) => {
    const mine = t.dataset.seg === seg;
    $$(".s", t).forEach((s) => {
      const k = +s.dataset.i;
      s.classList.toggle("now", mine && k === i);
      s.classList.toggle("past", mine && k < i);
    });
    if (mine) {
      const cur = $(`.s[data-i="${i}"]`, t);
      const scroller = t.closest(".reader-scroll");
      if (cur && scroller && !scroller.dataset.user) {
        const top = cur.offsetTop - scroller.clientHeight * 0.32;
        scroller.scrollTo({ top, behavior: "smooth" });
      }
    }
  });
}

function openReader() {
  $("#reader").hidden = false;
  renderReader();
  history.pushState({ reader: 1 }, "");
}
function closeReader() { $("#reader").hidden = true; }
addEventListener("popstate", () => { if (!$("#reader").hidden) closeReader(); });

function renderReader() {
  const r = $("#reader");
  const seg = narrator.seg;
  if (!seg) return;
  const m = segMeta(seg);
  const q = narrator.queue;
  const upNext = q.slice(narrator.qi + 1).find((s) => D.byId[s]);
  const rates = [0.9, 1, 1.1, 1.25, 1.4];
  const amb = store.get("ambient");
  const ss = D.segments[seg].sentences;
  const idx = narrator.indexes[store.get("voice")]?.[seg];
  const ticks = narrator.mode === "studio" && idx
    ? ss.map((s, i) => (i > 0 && s.p !== ss[i - 1].p ? `<i class="tick" style="left:${(idx.t[i] / idx.dur) * 100}%"></i>` : "")).join("") : "";
  r.style.setProperty("--c", m.section ? colorOf(m.section) : "#7fb2cf");
  r.innerHTML = `
    <div class="reader-top">
      <button class="icon-btn" id="rBack" aria-label="Close text view">${ICON.back}</button>
      <img src="${m.image}" alt="">
      <div class="mt"><b>${esc(m.title)}</b><small>${esc(m.sub)}${narrator.queueLabel ? ` · path ${narrator.queueLabel} podcast` : ""}</small></div>
      ${D.byId[seg] ? `<button class="icon-btn" id="rInfo" aria-label="Artwork details">ⓘ</button>` : ""}
    </div>
    <div class="reader-scroll" id="rScroll">
      ${narrator.walking ? `<p class="queue-note">Walking · next up: ${esc(D.byId[narrator.walking.next].title)}</p>` : ""}
      <div class="text" data-seg="${seg}">${textHTML(seg, !D.byId[seg])}</div>
      ${upNext ? `<p class="queue-note" style="margin-top:28px">Up next · ${esc(D.byId[upNext].title)}</p>` : ""}
    </div>
    <div class="reader-ctl">
      <div class="scrub" id="rScrub"><div class="track"><div class="fill" id="rFill"></div>${ticks}<div class="knob" id="rKnob"></div></div></div>
      <div class="times"><span id="rT">0:00</span><span id="rD"></span></div>
      <div class="ctl-row">
        ${q.length > 1 ? `<button class="skip" id="rPrev" aria-label="Previous">${ICON.prev}</button>` : ""}
        <button class="skip" id="rRew" aria-label="Back 15 seconds">${ICON.rew}</button>
        <button class="round" id="rPlay" aria-label="Play or pause">${narrator.playing ? ICON.pause : ICON.play}</button>
        <button class="skip" id="rFwd" aria-label="Forward 15 seconds">${ICON.fwd}</button>
        ${q.length > 1 ? `<button class="skip" id="rNext" aria-label="Next">${ICON.next}</button>` : ""}
      </div>
      <div class="opt-row">
        <div class="seg" role="group" aria-label="Speed">${rates.map((x) => `<button data-rate="${x}" class="${x === store.get("rate") ? "on" : ""}">${x}×</button>`).join("")}</div>
        <button class="pill" id="rVoice">🎙 ${esc(narrator.mode === "system" ? "Phone voice" : voiceName(store.get("voice")))}</button>
        <button class="pill ${amb !== "off" ? "on" : ""}" id="rAmb">♫ ${amb === "off" ? "Music off" : amb === "arp" ? "Arpeggio" : "Her score"}</button>
      </div>
    </div>`;
  $("#rBack").onclick = () => history.back();
  $("#rInfo") && ($("#rInfo").onclick = () => { history.back(); openSheet(seg); });
  $("#rPlay").onclick = () => { startAmbientIfWanted(); narrator.toggle(); };
  $("#rRew").onclick = () => narrator.skip(-15);
  $("#rFwd").onclick = () => narrator.skip(15);
  $("#rPrev") && ($("#rPrev").onclick = () => narrator.prev());
  $("#rNext") && ($("#rNext").onclick = () => (narrator.walking ? narrator.endWalk() : narrator.next()));
  $$("[data-rate]", r).forEach((b) => (b.onclick = () => { narrator.setRate(+b.dataset.rate); $$("[data-rate]", r).forEach((x) => x.classList.toggle("on", x === b)); renderPathHead(); }));
  $("#rVoice").onclick = openSettings;
  $("#rAmb").onclick = () => {
    const order = ["off", "arp", ambient.tracksAvailable ? "her" : null].filter(Boolean);
    const next = order[(order.indexOf(store.get("ambient")) + 1) % order.length];
    ambient.setMode(next);
    renderReader();
  };
  $$(".text .s", r).forEach((s) => (s.onclick = () => narrator.seekSentence(+s.dataset.i)));
  // scrubbing
  const scrub = $("#rScrub");
  const seek = (e) => { const b = scrub.getBoundingClientRect(); narrator.seekFraction(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width))); };
  scrub.onpointerdown = (e) => { scrub.setPointerCapture(e.pointerId); seek(e); scrub.onpointermove = seek; };
  scrub.onpointerup = () => (scrub.onpointermove = null);
  // if the reader scrolls manually, stop auto-follow for a few seconds
  const sc = $("#rScroll");
  const userScroll = () => { sc.dataset.user = 1; clearTimeout(sc._t); sc._t = setTimeout(() => delete sc.dataset.user, 5000); };
  sc.addEventListener("touchstart", userScroll, { passive: true });
  sc.addEventListener("wheel", userScroll, { passive: true });
  paintSentence();
  const p = narrator.progress();
  emit("progress", p);
}

// ---------------------------------------------------------------- settings
function startAmbientIfWanted() {
  const m = store.get("ambient");
  if (m !== "off" && ambient.mode !== m) ambient.setMode(m);
}

async function openSettings() {
  const d = $("#settings");
  ambient.tracksAvailable ??= await ambient.hasMusic();
  const eng = store.get("engine");
  const idx = await narrator.loadIndex(store.get("voice"));
  const segs = Object.keys(D.segments).length;
  const sysVoices = ("speechSynthesis" in window ? speechSynthesis.getVoices() : []).filter((v) => /^en/i.test(v.lang));
  const voiceCard = (v, studio) => {
    const have = studio ? Object.keys(narrator.indexes[v.id] || {}).length : null;
    return `<button class="voice ${store.get("voice") === v.id ? "on" : ""}" data-voice="${v.id}">
      <b>${v.name}</b><small>${v.desc}</small>
      ${studio && have != null && have < segs ? `<small style="color:var(--faint)">${have}/${segs} recorded</small>` : ""}
      <div class="wave">${(v.bars || [7, 10, 8, 12, 9, 11, 8]).map((h) => `<i style="height:${h}px"></i>`).join("")}</div>
      <span class="try" data-try="${v.id}">▶ try</span></button>`;
  };
  d.innerHTML = `<div class="set-head"><h2>Voice & sound</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="set-body">
      <div class="set-group">
        <h3 class="eyebrow">How the voice is made</h3>
        <div class="seg" style="display:flex">
          <button data-engine="studio" class="${eng === "studio" ? "on" : ""}" style="flex:1">Studio</button>
          <button data-engine="device" class="${eng === "device" ? "on" : ""}" style="flex:1">Live on device</button>
          <button data-engine="system" class="${eng === "system" ? "on" : ""}" style="flex:1">Phone voice</button>
        </div>
        <p style="margin-top:10px">${{
          studio: "Neural voices (Kokoro-82M) recorded ahead of time. Instant, works offline once downloaded, easy on the battery. Best for phones.",
          device: "The same Kokoro neural model generating speech live on this device. ~90 MB one-time download; smooth on laptops and newer phones, slower on older ones. Any of 13 voices.",
          system: "Your phone’s built-in speech voices. Robotic, but always available.",
        }[eng]}</p>
      </div>
      ${eng !== "system" ? `<div class="set-group"><h3 class="eyebrow">Voice</h3>
        <div class="voice-grid">${(eng === "studio" ? STUDIO_VOICES : DEVICE_VOICES).map((v) => voiceCard(v, eng === "studio")).join("")}</div>
        ${eng === "device" ? `<div class="engine-status" id="devStatus">${narrator.devReady ? "Model loaded ✓" : "Model not loaded yet."}</div><div class="bar"><i id="devBar"></i></div>
          ${narrator.devReady ? "" : `<button class="btn small" id="devLoad" style="margin-top:10px">Download the voice model now</button>`}` : ""}
      </div>` : `<div class="set-group"><h3 class="eyebrow">Phone voice</h3>
        <select class="select" id="sysVoice">${sysVoices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === store.get("systemVoice") ? "selected" : ""}>${esc(v.name)} (${v.lang})</option>`).join("") || "<option>Default</option>"}</select>
        <button class="btn small" id="sysTry" style="margin-top:8px">▶ try</button></div>`}
      <div class="set-group"><h3 class="eyebrow">Speed</h3>
        <div class="seg">${[0.9, 1, 1.1, 1.25, 1.4].map((x) => `<button data-rate="${x}" class="${x === store.get("rate") ? "on" : ""}">${x}×</button>`).join("")}</div>
      </div>
      <div class="set-group"><h3 class="eyebrow">Text size</h3>
        <div class="seg">${[[0.9, "A"], [1, "A"], [1.15, "A"], [1.3, "A"], [1.5, "A"]].map(([v], i) => `<button data-scale="${v}" class="${v === (store.get("textScale") || 1) ? "on" : ""}" style="font-size:${0.78 + i * 0.16}rem">A</button>`).join("")}</div>
        ${store.get("autoFit") ? `<button class="btn small" id="unzoom" style="margin-top:10px">↺ Undo “scale to my screen”</button>` : ""}
        <p style="margin-top:10px">Scales the whole interface, not just this menu. Handy in a dim gallery, or if you just want more on screen.</p>
      </div>
      <div class="set-group"><h3 class="eyebrow">Music under the voice</h3>
        <div class="seg">
          <button data-amb="off" class="${store.get("ambient") === "off" ? "on" : ""}">Off</button>
          <button data-amb="arp" class="${store.get("ambient") === "arp" ? "on" : ""}">Arpeggio</button>
          ${ambient.tracksAvailable ? `<button data-amb="her" class="${store.get("ambient") === "her" ? "on" : ""}">Her soundtrack</button>` : ""}
        </div>
        <p style="margin-top:10px">The arpeggio is generated live and changes mood with each section. It dips while the voice talks and swells while you walk.</p>
        <div class="row"><label for="ambVol">Music volume</label><input type="range" id="ambVol" min="0" max="1" step="0.05" value="${store.get("ambientVol")}"></div>
      </div>
      <div class="set-group"><h3 class="eyebrow">Podcast mode: between stops</h3>
        <div class="seg">
          ${[[0, "Straight on"], [8, "8 s walk"], [20, "20 s walk"], ["wait", "Wait for me"]].map(([v, l]) => `<button data-walk="${v}" class="${(v === "wait" ? store.get("pauseAtStops") : !store.get("pauseAtStops") && store.get("walkGap") === v) ? "on" : ""}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="set-group"><h3 class="eyebrow">Offline</h3>
        <p>Museum Wi-Fi can be patchy. Save the recordings for the selected voice now (~${Math.round(Object.values(idx).reduce((n, x) => n + x.dur, 0) * 5 / 1024)} MB for everything).</p>
        <button class="btn small" id="offline">⬇ Save ${esc(voiceName(store.get("voice")))} for offline</button>
        <div class="bar"><i id="offBar"></i></div>
      </div>
      <div class="set-group"><h3 class="eyebrow">Help</h3><button class="btn small" id="replayTour">↻ Show me around again</button></div>
      <p class="small-print">Texts: Ludwig Museum, “Black Mirror. The Long Shadow of the Future” (curators Borbála Kálmán, József Készman). Voices: Kokoro-82M (Apache-2.0). Recognition: DINOv2-small. Nothing you do here is uploaded anywhere.</p>
    </div>`;
  d.showModal();
  d.addEventListener("close", () => tryAudio?.pause(), { once: true });
  $("[data-close]", d).onclick = () => d.close();
  d.onclick = (e) => { if (e.target === d) d.close(); };
  $$("[data-engine]", d).forEach((b) => (b.onclick = () => {
    const e = b.dataset.engine;
    store.set({ engine: e });
    if (e === "device") { narrator.preloadDevice(); if (!DEVICE_VOICES.find((v) => v.id === store.get("voice"))) store.set({ voice: "af_heart" }); }
    if (e === "studio" && !STUDIO_VOICES.find((v) => v.id === store.get("voice"))) store.set({ voice: "af_heart" });
    narrator.voiceChanged();
    openSettings();
  }));
  $$("[data-voice]", d).forEach((b) => (b.onclick = (e) => {
    if (e.target.closest("[data-try]")) return tryVoice(e.target.closest("[data-try]").dataset.try);
    store.set({ voice: b.dataset.voice });
    $$("[data-voice]", d).forEach((x) => x.classList.toggle("on", x === b));
    narrator.voiceChanged();
    renderPathHead();
  }));
  $$("[data-rate]", d).forEach((b) => (b.onclick = () => { narrator.setRate(+b.dataset.rate); $$("[data-rate]", d).forEach((x) => x.classList.toggle("on", x === b)); renderPathHead(); renderStops(); }));
  $$("[data-amb]", d).forEach((b) => (b.onclick = () => { ambient.setMode(b.dataset.amb); $$("[data-amb]", d).forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#ambVol").oninput = (e) => ambient.setVolume(+e.target.value);
  $("#unzoom") && ($("#unzoom").onclick = () => {
    store.set({ autoFit: false });
    document.documentElement.style.zoom = "";
    d.close();
    setTimeout(() => plan.reset(), 100);
  });
  $$("[data-scale]", d).forEach((b) => (b.onclick = () => {
    store.set({ textScale: +b.dataset.scale });
    $$("[data-scale]", d).forEach((x) => x.classList.toggle("on", x === b));
    applyTextScale();
  }));
  $$("[data-walk]", d).forEach((b) => (b.onclick = () => {
    const v = b.dataset.walk;
    store.set(v === "wait" ? { pauseAtStops: true } : { pauseAtStops: false, walkGap: +v });
    $$("[data-walk]", d).forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#sysVoice") && ($("#sysVoice").onchange = (e) => store.set({ systemVoice: e.target.value }));
  $("#sysTry") && ($("#sysTry").onclick = () => tryVoice(null));
  $("#devLoad") && ($("#devLoad").onclick = () => { narrator.preloadDevice(); $("#devStatus").textContent = "Downloading…"; });
  $("#offline").onclick = saveOffline;
  $("#replayTour").onclick = () => { d.close(); tour.start(); };
}

let tryAudio;
async function tryVoice(id) {
  const eng = store.get("engine");
  narrator.pause();   // never two voices at once
  const line = "Hi. I’ll read the wall texts for you, while you look at the art.";
  if (eng === "system" || !id) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    const v = speechSynthesis.getVoices().find((v) => v.voiceURI === store.get("systemVoice"));
    if (v) u.voice = v;
    u.rate = store.get("rate");
    return speechSynthesis.speak(u);
  }
  tryAudio?.pause();
  if (eng === "studio") {
    const idx = await narrator.loadIndex(id);
    if (!idx.intro) return toast("That voice is still being recorded.");
    tryAudio = new Audio(`audio/${id}/intro.mp3`);
    tryAudio.playbackRate = store.get("rate");
    tryAudio.play();
    setTimeout(() => tryAudio.pause(), (idx.intro.t[2] || 6) * 1000 / store.get("rate"));
    return;
  }
  toast(narrator.devReady ? "Generating a sample on your device…" : "Loading the voice model first, this takes a moment…");
  const key = `try|${id}|${Date.now()}`;
  const w = narrator.worker();
  const url = await new Promise((res) => {
    const h = (e) => { if (e.data.key === key) { w.removeEventListener("message", h); res(e.data.wav ? URL.createObjectURL(new Blob([e.data.wav], { type: "audio/wav" })) : null); } };
    w.addEventListener("message", h);
    w.postMessage({ type: "gen", key, text: line, voice: id, speed: store.get("rate"), webgpu: narrator.webgpu });
  });
  if (url) { tryAudio = new Audio(url); tryAudio.play(); }
}

on("device-progress", ({ loaded, total }) => {
  const bar = $("#devBar"), st = $("#devStatus");
  if (bar) bar.style.width = (loaded / total) * 100 + "%";
  if (st) st.textContent = `Downloading voice model… ${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB`;
});
on("device-ready", (m) => { const st = $("#devStatus"); if (st) st.textContent = `Model loaded ✓ (${m.device === "webgpu" ? "GPU" : "CPU/WASM"}, ${m.dtype})`; toast("On-device voice ready"); });
on("device-speed", ({ rtf }) => { const st = $("#devStatus"); if (st && rtf) st.textContent = `Model loaded ✓ · generating at ${(1 / rtf).toFixed(1)}× real-time`; });
on("device-error", (m) => toast("On-device voice: " + m));

async function saveOffline() {
  const voice = store.get("voice");
  const idx = await narrator.loadIndex(voice);
  const ids = Object.keys(idx);
  if (!ids.length) return toast("Nothing recorded for this voice yet.");
  const cache = await caches.open("bm-audio-v1");
  let done = 0;
  const bar = $("#offBar");
  for (const id of ids) {
    const url = `audio/${voice}/${id}.mp3`;
    if (!(await cache.match(url))) { try { const r = await fetch(url); if (r.ok) await cache.put(url, r); } catch {} }
    done++;
    if (bar) bar.style.width = (done / ids.length) * 100 + "%";
  }
  toast(`${voiceName(voice)} saved for offline ✓`);
}

// ---------------------------------------------------------------- views, locate, misc
function bindChrome() {
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  on("go", go);
  $("#settingsBtn").onclick = openSettings;
  $("#sheetBackdrop").onclick = closeSheet;
  $("#locateBtn").onclick = () => locator.open();
  locator.onChoose = (id, play) => {
    go("guide");
    openSheet(id);
    toast("Located ✓ You’re near “" + D.byId[id].title + "”");
    if (play) playArtwork(id);
  };
  locator.onSnap = (blob, tag) => { lab.mount().then(() => lab.loadBlob(blob, tag)); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (mapFull) toggleMapFull(false); else if (!$("#reader").hidden) history.back(); else closeSheet(); }
    if (e.key === " " && e.target === document.body) { e.preventDefault(); narrator.toggle(); }
  });
  on("remixes-changed", () => { if (!document.querySelector("#me .rf")) renderMe(); });
  on("me-home", () => { renderMe(); scrollTo({ top: 0 }); });
}

function go(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
  $$(".tabs [data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
  if (view === "lab") lab.mount();
  if (view === "me") renderMe();
  scrollTo({ top: 0 });
}

async function renderMe() {
  const favs = store.get("favs");
  const list = await remixes.all();
  const heard = Object.keys(store.get("listened")).filter((id) => D.byId[id]);
  $("#me").innerHTML = `
    <h2>My picks</h2>
    <p>Works you saved with ♡, what you’ve listened to, and your remixes. All stored on this phone only.</p>
    <div class="card"><h3>Saved works (${favs.length})</h3>
      ${favs.length ? `<div class="fav-list">${favs.map((id) => D.byId[id]).filter(Boolean).map((a) => `<div class="stop" data-id="${a.id}" style="--c:${colorOf(a.s)}"><span class="n">${a.s}</span><img src="${a.thumb}" alt=""><span class="t"><b>${esc(a.title)}</b><small>${esc(a.name)}</small></span><button class="play" data-play="${a.id}">${ICON.play}</button></div>`).join("")}</div>`
        : `<p>Tap ♡ Save on any artwork that gets under your skin.</p>`}
    </div>
    <div class="card"><h3>Listened: ${heard.length} / ${D.artworks.length}</h3><p>${heard.length ? heard.map((id) => esc(D.byId[id].title)).join(" · ") : "Nothing yet."}</p></div>
    <div class="card"><h3>Remixes (${list.length})</h3>
      ${list.length ? `<div class="gallery" style="margin-top:10px">${list.map((r) => `<figure><img src="${URL.createObjectURL(r.blob)}" alt=""></figure>`).join("")}</div>` : `<p>Make one in the Remix Lab.</p>`}
    </div>
    <div class="card hand-card"><h3>Reflection & hand-in</h3><p>Your top 3, the vibe, one short opinion, six words and your remix, all on one PDF. About 10 to 15 minutes, due by the next lesson.</p>
      <div class="path-actions" style="margin-top:12px"><button class="btn primary" id="goReflect">✍️ ${store.get("reflect") ? "Continue" : "Start"} reflection</button></div></div>
    <div class="path-actions"><button class="btn small ghost" id="meTour">↻ Show me around</button><a class="btn small ghost" href="teacher.html">Teacher mode</a></div>`;
  $("#goReflect").onclick = () => { reflect.render(); scrollTo({ top: 0 }); };
  $("#meTour").onclick = () => tour.start();
  $$("#me .stop").forEach((li) => (li.onclick = (e) => { if (e.target.closest(".play")) return playArtwork(li.dataset.id); go("guide"); openSheet(li.dataset.id); }));
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2800);
}
