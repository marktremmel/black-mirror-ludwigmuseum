// Minimal static server with HTTP Range support (needed for audio seeking).
//   node tools/serve.mjs [port]      -> serves ./site
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site");
const PORT = +process.argv[2] || 8765;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  // COOP/COEP make the page cross-origin isolated -> multi-threaded WASM for the on-device models
  const head = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin" };
  if (range) {
    let start = range[1] ? +range[1] : size - +range[2];
    let end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    res.writeHead(206, { ...head, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, "Content-Length": size });
  req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Black Mirror guide on http://localhost:${PORT}`));
