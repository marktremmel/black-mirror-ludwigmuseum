// Pre-render the whole tour with Kokoro-82M (the same model the app can run on-device).
//   node tools/render_audio.mjs af_heart        (one voice; run several in parallel)
// Output: site/audio/<voice>/<segment>.mp3 + site/audio/<voice>/index.json
// Re-running only renders segments whose spoken text changed.
import { KokoroTTS } from "kokoro-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voice = process.argv[2] || "af_heart";
const only = process.argv[3]; // optional segment id filter
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/exhibition.json"), "utf8"));
const outDir = path.join(ROOT, "audio", voice);
fs.mkdirSync(outDir, { recursive: true });
const idxPath = path.join(outDir, "index.json");
const index = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : {};

const SR = 24000;
const GAP = { sentence: 0.22, paragraph: 0.6, title: 0.7 };
const tmp = process.env.TMPDIR || "/tmp";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });

// Kokoro handles ~510 phoneme tokens; keep chunks comfortably short.
function chunk(s, max = 260) {
  if (s.length <= max) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (const m of s.matchAll(/[;:,]\s|\s(?:and|but|while|which|where)\s/g)) {
    if (best < 0 || Math.abs(m.index - mid) < Math.abs(best - mid)) best = m.index + 1;
  }
  if (best < 20) best = s.lastIndexOf(" ", mid);
  return [...chunk(s.slice(0, best).trim(), max), ...chunk(s.slice(best).trim(), max)];
}

const hash = (seg) => crypto.createHash("md5").update(voice + JSON.stringify(seg.sentences.map((x) => x.s))).digest("hex").slice(0, 10);

const ids = Object.keys(data.segments).filter((id) => !only || id === only);
let done = 0;
const t0 = Date.now();
for (const id of ids) {
  const seg = data.segments[id];
  const h = hash(seg);
  const mp3 = path.join(outDir, id + ".mp3");
  if (index[id]?.h === h && fs.existsSync(mp3)) { done++; continue; }

  const pieces = [];
  const starts = [];
  let t = 0.15; // small lead-in
  pieces.push(new Float32Array(Math.round(0.15 * SR)));
  seg.sentences.forEach((snt, i) => {
    starts.push(+t.toFixed(3));
    snt._chunks = chunk(snt.s);
  });
  for (let i = 0; i < seg.sentences.length; i++) {
    const snt = seg.sentences[i];
    starts[i] = +t.toFixed(3);
    for (const c of snt._chunks) {
      const a = await tts.generate(c, { voice });
      const audio = trim(a.audio);
      pieces.push(audio);
      t += audio.length / SR;
      if (snt._chunks.length > 1) { pieces.push(new Float32Array(Math.round(0.08 * SR))); t += 0.08; }
    }
    const next = seg.sentences[i + 1];
    const gap = !next ? 0.4 : snt.p === -1 ? GAP.title : next.p !== snt.p ? GAP.paragraph : GAP.sentence;
    pieces.push(new Float32Array(Math.round(gap * SR)));
    t += gap;
  }
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const pcm = new Float32Array(total);
  let o = 0;
  for (const p of pieces) { pcm.set(p, o); o += p.length; }
  const wav = path.join(tmp, `bm_${voice}_${id}.wav`);
  writeWav(wav, pcm);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "40k", mp3]);
  fs.unlinkSync(wav);
  index[id] = { h, dur: +(total / SR).toFixed(2), t: starts };
  fs.writeFileSync(idxPath, JSON.stringify(index));
  done++;
  const el = (Date.now() - t0) / 1000;
  console.log(`[${voice}] ${done}/${ids.length} ${id} ${index[id].dur}s (elapsed ${el.toFixed(0)}s)`);
}
console.log(`[${voice}] finished`);

// Trim leading/trailing near-silence so our own gaps control the rhythm.
function trim(a) {
  const th = 0.004;
  let s = 0, e = a.length - 1;
  while (s < e && Math.abs(a[s]) < th) s++;
  while (e > s && Math.abs(a[e]) < th) e--;
  s = Math.max(0, s - Math.round(0.02 * SR));
  e = Math.min(a.length, e + Math.round(0.06 * SR));
  return a.slice(s, e);
}

function writeWav(file, f32) {
  const buf = Buffer.alloc(44 + f32.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + f32.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}
