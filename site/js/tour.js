// "Show me around": a short spotlight tour on first start, replayable from settings / My picks.
import { store, emit } from "./store.js";

const STEPS = [
  { title: "Hi 👋", text: "This is your pocket guide to Black Mirror. Everything can be listened to, not just read. Quick tour? Takes a minute." },
  { sel: "#pathChips", title: "Five paths, one floor", text: "The exhibition has five themes (A to E) mixed across the same rooms. Pick one, or “Everything”." },
  { sel: "#mapCard", title: "Your map", text: "Numbered dots are the stops on your path, in walking order. Tap a dot to open it, pinch to zoom, and long-press where you’re standing so “Near you” knows." },
  { sel: "#pathHead .btn.primary", title: "Podcast mode", text: "Plays the whole path: a short intro, then each work. Between stops the voice tells you where to walk, and it waits a bit while you do." },
  { sel: ".stop", title: "Or just pick one", text: "Tap any work for the photo and the text, then ▶ Listen. The text lights up as it’s read, and you can tap a sentence to jump there." },
  { sel: "#locateBtn", title: "Where am I?", text: "Point your camera at an artwork and it guesses which one it is and where you are. It all runs on your phone, nothing gets uploaded." },
  { title: "Weird words?", text: `Words with a <span class="term demo">dotted underline</span> explain themselves. Tap them for a short, friendly explanation.` },
  { sel: "#settingsBtn", title: "Voice, speed, music", text: "Try the voices and keep the one you like. Change the speed, switch on the music, and <b>save everything for offline</b> before the visit." },
  { sel: '.tabs [data-go="lab"]', title: "Remix Lab", text: "Take a photo of a work that got to you, give it a filter, add stickers and a caption." },
  { sel: '.tabs [data-go="me"]', title: "My picks", text: "Your ♡ saved works, your remixes, and the reflection you hand in after the visit." },
  { title: "That’s it", text: "Put your headphones in and wander. You can replay this tour any time from ⚙." },
];

class Tour {
  start() {
    emit("go", "guide");
    this.i = 0;
    this.root?.remove();
    this.root = document.createElement("div");
    this.root.className = "tour";
    this.root.innerHTML = `<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>`;
    document.body.appendChild(this.root);
    this.onResize = () => this.place();
    addEventListener("resize", this.onResize);
    this.show();
  }
  show() {
    const s = STEPS[this.i];
    const card = this.root.querySelector(".tour-card");
    card.innerHTML = `<small>${this.i + 1} / ${STEPS.length}</small><b>${s.title}</b><p>${s.text}</p>
      <div class="tour-btns">
        <button class="btn small ghost" data-skip>${this.i === STEPS.length - 1 ? "" : "Skip"}</button>
        <span></span>
        ${this.i ? `<button class="btn small" data-back>Back</button>` : ""}
        <button class="btn small primary" data-next>${this.i === STEPS.length - 1 ? "Let’s go" : this.i === 0 ? "Show me" : "Next"}</button>
      </div>`;
    card.querySelector("[data-next]").onclick = () => this.next();
    card.querySelector("[data-back]")?.addEventListener("click", () => { this.i--; this.show(); });
    const skip = card.querySelector("[data-skip]");
    if (skip.textContent) skip.onclick = () => this.end(); else skip.remove();
    const el = s.sel && document.querySelector(s.sel);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => this.place(), el ? 350 : 0);
  }
  place() {
    const s = STEPS[this.i];
    const hole = this.root.querySelector(".tour-hole");
    const card = this.root.querySelector(".tour-card");
    const el = s.sel && document.querySelector(s.sel);
    if (!el) {
      hole.style.cssText = `left:50%;top:45%;width:0;height:0`;
      card.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%)`;
      return;
    }
    const r = el.getBoundingClientRect(), pad = 6;
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const w = Math.min(340, innerWidth - 24);
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    card.style.cssText = `left:${left}px;width:${w}px;transform:none`;
    const h = card.offsetHeight;
    const below = r.bottom + 14 + h < innerHeight - 8;
    card.style.top = (below ? r.bottom + 14 : Math.max(8, r.top - h - 14)) + "px";
  }
  next() { if (++this.i >= STEPS.length) return this.end(); this.show(); }
  end() {
    removeEventListener("resize", this.onResize);
    this.root?.remove();
    this.root = null;
    store.set({ tourDone: true });
    scrollTo({ top: 0, behavior: "smooth" });
  }
}

export const tour = new Tour();
