// Ambient bed under the narration.
//  "arp": a generative soft-piano arpeggiator loosely in the spirit of the "Her" score
//         (warm 7th/9th chords, rolling 8ths, lots of space). Every note has a real
//         attack/decay envelope and a low-pass, and nothing is triggered by paragraph
//         changes, so there are no beeps or clicks. Mood follows the thematic section.
//  "her": plays the soundtrack files listed in music/manifest.json (if present).
// While the voice speaks, the bed ducks down; between stops it swells back up.
import { store, on } from "./store.js";

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// chords as MIDI notes (low → high). Keep everything below ~C6 so it never gets shrill.
const MOODS = {
  base:        { bpm: 70, density: 0.72, bright: 1900, prog: [[53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 65], [46, 53, 57, 62]] }, // Fmaj7 Am7 Dm7 Bbmaj9
  bittersweet: { bpm: 68, density: 0.7, bright: 1800, prog: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 57, 60, 65], [46, 50, 57, 60]] },
  warm:        { bpm: 74, density: 0.8, bright: 2300, prog: [[48, 55, 59, 62], [52, 55, 59, 62], [45, 52, 55, 59], [41, 48, 55, 57]] },          // Cmaj9 Em7 Am9 Fmaj9
  cold:        { bpm: 60, density: 0.55, bright: 1400, prog: [[50, 57, 60, 64], [46, 53, 57, 62], [43, 50, 53, 58], [45, 52, 55, 60]] },          // Dm9 Bbmaj9 Gm7 Am7
  sparse:      { bpm: 56, density: 0.4, bright: 1500, prog: [[51, 58, 62, 67], [44, 51, 55, 62]] },                                                // Ebmaj7 Abmaj9 (#11 colour)
  pulse:       { bpm: 84, density: 0.85, bright: 2500, prog: [[43, 50, 55, 58], [39, 46, 51, 55], [46, 53, 58, 62], [41, 48, 53, 57]] },          // Gm Eb Bb F
};
const SHAPES = [[0, 1, 2, 3, 2, 1, 3, 2], [0, 2, 1, 3, 0, 2, 3, 1], [0, 1, 3, 2, 3, 1, 2, 0]];

class Ambient {
  constructor() {
    this.ctx = null;
    this.mode = "off";
    this.mood = "base";
    this.step = 0;
    this.bar = 0;
    this.next = 0;
    this.timer = null;
    this.ducked = false;
    this.music = null;
    on("state", (s) => this.duck(s.playing || s.loading));
    on("walking", (w) => { if (w) this.duck(false); });
    document.addEventListener("visibilitychange", () => this.schedule());
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.duckGain = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    this.bus = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(3.2);
    const hs = ctx.createBiquadFilter(); hs.type = "lowpass"; hs.frequency.value = 4200; // soft top end on everything
    this.bus.connect(dry).connect(comp);
    this.bus.connect(verb).connect(wet).connect(comp);
    comp.connect(hs).connect(this.duckGain).connect(this.master).connect(ctx.destination);
  }

  impulse(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.6;
    }
    return buf;
  }

  level() { return store.get("ambientVol") * (this.mode === "her" ? 0.9 : 0.5); }

  setMode(mode) {
    this.mode = mode;
    store.set({ ambient: mode });
    if (mode === "off") return this.fadeOut();
    this.ensure();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.level(), t, 0.8);
    if (mode === "arp") { this.stopMusic(); this.next = t + 0.1; this.schedule(); }
    if (mode === "her") { clearTimeout(this.timer); this.startMusic(); }
  }
  setVolume(v) {
    store.set({ ambientVol: v });
    if (this.ctx && this.mode !== "off") this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.2);
  }
  fadeOut() {
    clearTimeout(this.timer);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => { if (this.mode === "off") this.stopMusic(); }, 2500);
  }
  setMood(m) { if (MOODS[m]) this.mood = m; }

  duck(speaking) {
    this.ducked = speaking;
    if (!this.ctx) return;
    const target = speaking && store.get("duck") ? 0.28 : 1;
    this.duckGain.gain.setTargetAtTime(target, this.ctx.currentTime, speaking ? 0.25 : 1.2);
  }

  // ---------------------------------------------------------------- arpeggiator
  schedule() {
    clearTimeout(this.timer);
    if (this.mode !== "arp" || !this.ctx) return;
    const look = document.hidden ? 2.5 : 0.35;
    const ctx = this.ctx;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + look) {
      this.tick(this.next);
      const M = MOODS[this.mood];
      this.next += 60 / M.bpm / 2; // 8th notes
    }
    this.timer = setTimeout(() => this.schedule(), document.hidden ? 1000 : 90);
  }

  tick(t) {
    const M = MOODS[this.mood];
    const chord = M.prog[this.bar % M.prog.length];
    const shape = SHAPES[this.bar % SHAPES.length];
    const s = this.step % 8;
    if (s === 0) {
      this.pad(t, chord, (60 / M.bpm) * 4);
      this.note(t, chord[0] - 12, 0.32, M.bright * 0.6, 4.5); // soft bass
    }
    const humanize = (Math.random() - 0.5) * 0.024;
    if (Math.random() < M.density || s === 0) {
      const oct = s >= 4 && Math.random() < 0.35 ? 12 : 0;
      const n = chord[shape[s]] + 12 + oct;
      const vel = (s % 2 ? 0.16 : 0.24) * (0.75 + Math.random() * 0.4);
      this.note(t + humanize, Math.min(n, 84), vel, M.bright, 2.6);
    }
    this.step++;
    if (this.step % 8 === 0) this.bar++;
  }

  note(t, midi, vel, bright, len) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(bright, f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + len * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.014);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = f; o1.detune.value = (Math.random() - 0.5) * 8;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2; o2.detune.value = (Math.random() - 0.5) * 6;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o1.connect(lp); o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.bus);
    o1.start(t); o2.start(t);
    o1.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }

  pad(t, chord, len) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + len * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + len * 1.15);
    lp.connect(g).connect(this.bus);
    for (const m of chord.slice(0, 3)) {
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + len * 1.2);
      }
    }
  }

  // ---------------------------------------------------------------- soundtrack files
  async startMusic() {
    if (!this.tracks) {
      try { this.tracks = (await (await fetch("music/manifest.json")).json()).tracks; } catch { this.tracks = []; }
    }
    if (!this.tracks.length) { this.setMode("arp"); return; }
    if (!this.music) {
      this.music = new Audio();
      this.music.crossOrigin = "anonymous";
      this.music.addEventListener("ended", () => this.nextTrack());
      this.ctx.createMediaElementSource(this.music).connect(this.duckGain);
      this.ti = Math.floor(Math.random() * this.tracks.length);
      this.nextTrack();
    } else this.music.play().catch(() => {});
  }
  nextTrack() {
    this.ti = (this.ti + 1) % this.tracks.length;
    this.music.src = "music/" + this.tracks[this.ti].file;
    this.music.play().catch(() => {});
  }
  stopMusic() { this.music?.pause(); }
  async hasMusic() {
    try { const r = await fetch("music/manifest.json", { method: "HEAD" }); return r.ok; } catch { return false; }
  }
}

export const ambient = new Ambient();
