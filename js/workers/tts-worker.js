// On-device neural TTS (Kokoro-82M) running off the main thread.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

let tts = null;
let loading = null;

async function load(webgpu) {
  if (tts) return tts;
  if (loading) return loading;
  const device = webgpu ? "webgpu" : "wasm";
  const dtype = webgpu ? "fp32" : "q8";
  const files = new Map();
  loading = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype,
    device,
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        files.set(p.file, [p.loaded, p.total]);
        let l = 0, t = 0;
        for (const [a, b] of files.values()) { l += a; t += b; }
        postMessage({ type: "progress", loaded: l, total: t });
      }
    },
  }).then((m) => {
    tts = m;
    postMessage({ type: "ready", device, dtype });
    return m;
  }).catch((err) => {
    loading = null;
    postMessage({ type: "error", message: String(err?.message || err) });
    throw err;
  });
  return loading;
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") await load(msg.webgpu);
    if (msg.type === "gen") {
      const m = await load(msg.webgpu);
      const t0 = performance.now();
      const audio = await m.generate(msg.text, { voice: msg.voice, speed: msg.speed || 1 });
      const wav = audio.toWav();
      postMessage({ type: "audio", key: msg.key, wav, ms: performance.now() - t0, dur: audio.audio.length / audio.sampling_rate }, [wav]);
    }
  } catch (err) {
    postMessage({ type: "error", key: msg.key, message: String(err?.message || err) });
  }
};
