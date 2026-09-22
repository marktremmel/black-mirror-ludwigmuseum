// Build reference embeddings for "point & guess" (DINOv2-small, same model the browser runs).
//   node tools/embed.mjs            -> writes site/data/embeddings.json
//   node tools/embed.mjs --test     -> also scores the synthetic queries in $TMPDIR/q
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "onnx-community/dinov2-small";
const DTYPE = process.env.DT || "q4";
const TEST = process.argv.includes("--test");
env.allowLocalModels = false;

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/exhibition.json"), "utf8"));
const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await AutoModel.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" });

async function raw(img) {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}
// Views of one picture: the processor centre-crops to a square, so also feed a
// letterboxed full view and overlapping halves for very wide / tall works.
async function views(file, reference) {
  const base = sharp(file).rotate();
  const { width: w, height: h } = await base.metadata();
  const out = [await raw(base.clone())];
  const S = Math.max(w, h);
  out.push(await raw(base.clone().resize(S, S, { fit: "contain", background: { r: 232, g: 232, b: 228 } })));
  if (reference) {
    const ar = w / h;
    if (ar > 1.3) {
      const cw = Math.round(w * 0.62);
      out.push(await raw(base.clone().extract({ left: 0, top: 0, width: cw, height: h })));
      out.push(await raw(base.clone().extract({ left: w - cw, top: 0, width: cw, height: h })));
    } else if (ar < 0.77) {
      const ch = Math.round(h * 0.62);
      out.push(await raw(base.clone().extract({ left: 0, top: 0, width: w, height: ch })));
      out.push(await raw(base.clone().extract({ left: 0, top: h - ch, width: w, height: ch })));
    }
    const cw = Math.round(w * 0.6), ch = Math.round(h * 0.6);
    out.push(await raw(base.clone().extract({ left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch })));
  }
  return out;
}
function l2(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Array.from(v, (x) => x / n); }
async function embed(img) {
  const inputs = await processor(img);
  const { last_hidden_state } = await model(inputs);
  const [, T, C] = last_hidden_state.dims;
  const d = last_hidden_state.data;
  // CLS token concatenated with mean of patch tokens: CLS = global look, mean = texture/colour
  const cls = d.slice(0, C);
  const mean = new Float32Array(C);
  for (let t = 1; t < T; t++) for (let c = 0; c < C; c++) mean[c] += d[t * C + c] / (T - 1);
  return l2([...l2(cls), ...l2(mean)]);
}

const refs = [];
const t0 = Date.now();
for (const a of data.artworks) {
  const vs = await views(path.join(ROOT, a.image), true);
  for (const v of vs) refs.push({ id: a.id, e: await embed(v) });
}
console.log(`refs: ${refs.length} vectors in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
// pack as int8 (per-vector scale) + base64 to keep the download small
const dim = refs[0].e.length;
const buf = new Int8Array(refs.length * dim);
const scales = refs.map((r, i) => {
  const m = Math.max(...r.e.map(Math.abs)) || 1;
  r.e.forEach((x, j) => (buf[i * dim + j] = Math.round((x / m) * 127)));
  return +(m / 127).toPrecision(6);
});
fs.writeFileSync(path.join(ROOT, `data/emb-${DTYPE}.json`), JSON.stringify({
  model: MODEL, dtype: DTYPE, dim, ids: refs.map((r) => r.id), scales,
  data: Buffer.from(buf.buffer).toString("base64"),
}));

if (TEST) {
  const dir = path.join(process.env.TMPDIR, "q");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg"));
  let top1 = 0, top3 = 0, ms = 0;
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const misses = [];
  for (const f of files) {
    const truth = f.split("__")[0];
    const t = Date.now();
    const qs = [];
    for (const v of await views(path.join(dir, f), false)) qs.push(await embed(v));
    ms += Date.now() - t;
    const best = {};
    for (const q of qs) for (const r of refs) { const s = dot(q, r.e); if (!(r.id in best) || s > best[r.id]) best[r.id] = s; }
    const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([id]) => id === truth);
    if (rank === 0) top1++; if (rank < 3) top3++;
    else misses.push(`${f} -> ${ranked[0][0]} (${ranked[0][1].toFixed(3)}), truth rank ${rank + 1}`);
  }
  console.log(`${DTYPE}: top1 ${(top1 / files.length * 100).toFixed(1)}%  top3 ${(top3 / files.length * 100).toFixed(1)}%  avg ${(ms / files.length).toFixed(0)}ms/query (2 views)`);
  misses.slice(0, 12).forEach((m) => console.log("  miss", m));
}

if (TEST && process.env.DUMP) {
  // dump per-query best similarity per artwork for offline prior simulation
  const dir = path.join(process.env.TMPDIR, "q");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg"));
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const rows = [];
  for (const f of files) {
    const qs = [];
    for (const v of await views(path.join(dir, f), false)) qs.push(await embed(v));
    const best = {};
    for (const q of qs) for (const r of refs) { const s = dot(q, r.e); if (!(r.id in best) || s > best[r.id]) best[r.id] = s; }
    rows.push({ truth: f.split("__")[0], best });
  }
  fs.writeFileSync(path.join(process.env.TMPDIR, `sims_${DTYPE}.json`), JSON.stringify(rows));
}
