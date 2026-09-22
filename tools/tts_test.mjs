import { KokoroTTS } from "kokoro-js";
const t0=Date.now();
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: process.env.DT||"fp32", device: "cpu" });
console.log('load', Date.now()-t0);
const text = "Zsófia Keresztes calls her sculptures twenty-first century totems. Her hybrid creature in a rolling container cart is at once menacing and vulnerable, at once sensual and frightening.";
for (const v of ["af_heart","am_michael","bf_emma","bm_george"]) {
  const t=Date.now(); const a = await tts.generate(text,{voice:v});
  await a.save(process.env.TMPDIR+`/t_${v}.wav`);
  console.log(v, 'gen ms', Date.now()-t, 'audio s', a.audio.length/a.sampling_rate);
}
console.log(Object.keys(tts.voices).join(' '));
