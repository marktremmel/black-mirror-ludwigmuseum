// "Point & guess": DINOv2-small embeds the camera view; we compare it with
// pre-computed embeddings of the 34 artwork photos (see tools/embed.mjs).
import { AutoModel, AutoProcessor, RawImage, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels = false;
const MODEL = "onnx-community/dinov2-small";
let model, processor, refs, dim, loading;

async function load(webgpu) {
  if (model) return;
  if (loading) return loading;
  loading = (async () => {
    const files = new Map();
    const progress_callback = (p) => {
      if (p.status === "progress" && p.total) {
        files.set(p.file, [p.loaded, p.total]);
        let l = 0, t = 0;
        for (const [a, b] of files.values()) { l += a; t += b; }
        postMessage({ type: "progress", loaded: l, total: t });
      }
    };
    let dtype = "q4", device = "wasm";
    processor = await AutoProcessor.from_pretrained(MODEL);
    if (webgpu) {
      try {
        model = await AutoModel.from_pretrained(MODEL, { dtype: "fp16", device: "webgpu", progress_callback });
        dtype = "fp16"; device = "webgpu";
      } catch { model = null; }
    }
    if (!model) model = await AutoModel.from_pretrained(MODEL, { dtype: "q4", device: "wasm", progress_callback });
    // fp16 behaves like fp32, so it uses the fp32 reference set
    const r = await (await fetch(new URL(`../../data/emb-${dtype === "q4" ? "q4" : "fp32"}.json`, import.meta.url))).json();
    dim = r.dim;
    const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
    const i8 = new Int8Array(bin.buffer);
    refs = r.ids.map((id, i) => {
      const e = new Float32Array(dim);
      for (let j = 0; j < dim; j++) e[j] = i8[i * dim + j] * r.scales[i];
      return { id, e };
    });
    postMessage({ type: "ready", dtype, device });
  })();
  return loading;
}

function toRaw(bitmap) {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = c.getContext("2d");
  g.drawImage(bitmap, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return new RawImage(d.data, c.width, c.height, 4).rgb();
}

function l2(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; }

async function embed(img) {
  const inputs = await processor(img);
  const { last_hidden_state } = await model(inputs);
  const [, T, C] = last_hidden_state.dims;
  const d = last_hidden_state.data;
  const cls = l2(Float32Array.from(d.slice(0, C)));
  const mean = new Float32Array(C);
  for (let t = 1; t < T; t++) for (let c = 0; c < C; c++) mean[c] += d[t * C + c];
  l2(mean);
  const out = new Float32Array(2 * C);
  out.set(cls, 0); out.set(mean, C);
  return l2(out);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "load") await load(m.webgpu);
    if (m.type === "embed") {
      await load(m.webgpu);
      const t0 = performance.now();
      const qs = [];
      for (const b of m.views) { qs.push(await embed(toRaw(b))); b.close?.(); }
      const best = {};
      for (const q of qs) for (const r of refs) {
        let s = 0;
        for (let j = 0; j < dim; j++) s += q[j] * r.e[j];
        if (!(r.id in best) || s > best[r.id]) best[r.id] = s;
      }
      postMessage({ type: "result", seq: m.seq, sims: best, ms: performance.now() - t0 });
    }
  } catch (err) {
    postMessage({ type: "error", message: String(err?.message || err) });
  }
};
