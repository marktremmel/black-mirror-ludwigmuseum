// Hand-in code: packs the countable answers (top 3, moods, temperature, choices) into
// "BM-XXXX-XXXX" so a teacher can tally a class from pasted codes alone.
// Layout (40 bits): top3 3×6 | moods 10 | temp 4 | part3 2 | part4 1 | remix 1 | checksum 4
export const VIBES = [
  { id: "dread", e: "🫥", c: "#9aa3b5", t: "something is off and nobody says it" },
  { id: "absurd", e: "🤡", c: "#f2c94c", t: "so absurd it’s actually funny" },
  { id: "ruins", e: "🏚️", c: "#c8845a", t: "a future that already fell apart" },
  { id: "watched", e: "👁️", c: "#6fcf97", t: "someone is always watching" },
  { id: "sadpretty", e: "🌅", c: "#f4a6c4", t: "pretty, but it makes me a bit sad" },
  { id: "fight", e: "✊", c: "#ef6b6b", t: "stubborn, wants to fight back" },
  { id: "dream", e: "🌀", c: "#a88be6", t: "weird dream logic, doesn’t add up" },
  { id: "hope", e: "🌱", c: "#a3e36a", t: "weirdly hopeful" },
  { id: "stuck", e: "🧠", c: "#f5a25d", t: "stuck in my head, can’t stop thinking about it" },
  { id: "cold", e: "🧊", c: "#86cfee", t: "honestly left me cold" },
];
const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I L O U

export function encode(r, ids) {
  let v = 0n;
  const put = (x, bits) => { v = (v << BigInt(bits)) | BigInt(x & ((1 << bits) - 1)); };
  for (let k = 0; k < 3; k++) { const i = ids.indexOf(r.top?.[k]?.id); put(i < 0 ? 63 : i, 6); }
  let m = 0; VIBES.forEach((vb, i) => { if (r.vibes?.includes(vb.id)) m |= 1 << i; }); put(m, 10);
  put(Math.max(0, Math.min(15, r.temp || 0)), 4);
  put({ A: 1, B: 2, C: 3 }[r.p3?.mode] || 0, 2);
  put(r.p4?.mode === "2080" ? 1 : 0, 1);
  put(r.remix ? 1 : 0, 1);
  let sum = 0n; for (let x = v; x > 0n; x >>= 4n) sum += x & 15n;
  put(Number(sum % 16n), 4);
  let s = "";
  for (let i = 0; i < 8; i++) { s = ALPH[Number(v & 31n)] + s; v >>= 5n; }
  return `BM-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function decode(code, ids) {
  const s = String(code).toUpperCase().replace(/^BM-?/, "").replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8) return null;
  let v = 0n;
  for (const ch of s) { const i = ALPH.indexOf(ch); if (i < 0) return null; v = (v << 5n) | BigInt(i); }
  const take = (bits) => { const x = Number(v & ((1n << BigInt(bits)) - 1n)); v >>= BigInt(bits); return x; };
  const check = take(4);
  let rest = v, sum = 0n; for (let x = rest; x > 0n; x >>= 4n) sum += x & 15n;
  if (Number(sum % 16n) !== check) return null;
  const remix = take(1), p4 = take(1), p3 = take(2), temp = take(4), m = take(10);
  const t3 = take(6), t2 = take(6), t1 = take(6);
  return {
    top: [t1, t2, t3].map((i) => (i < ids.length ? ids[i] : null)),
    vibes: VIBES.filter((_, i) => m & (1 << i)).map((x) => x.id),
    temp, p3: ["", "A", "B", "C"][p3], p4: p4 ? "2080" : "six", remix: !!remix,
  };
}
