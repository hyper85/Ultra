/* Checks the English dictionaries against the source: every key must appear literally somewhere in src/ (or the
   coach plan JSON), so a renamed Danish string cannot silently lose its translation, and every literal t()/tn() string needs English.
   Run: node scripts/i18n-check.mjs */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "lang" ? [] : walk(p)) : /\.(jsx?|json)$/.test(f) ? [p] : []; });
const src = walk("src").concat(["api/coach.js"]).map((p) => readFileSync(p, "utf8")).join("\n");
let bad = 0, total = 0;
for (const f of readdirSync("src/lang")) {
  const dict = (await import(`../src/lang/${f}`)).default;
  for (const k of Object.keys(dict)) { total++; if (!src.includes(k)) { bad++; console.log(`${f}: key not found in source: ${JSON.stringify(k)}`); } }
}
console.log(`${total} entries, ${bad} without a matching source string`);
// The other way: every literal t("…") / tn(n, "…", "…") in src/ needs an English entry (words that read the same in
// both languages are listed in SAME).
const en = Object.assign({}, ...(await Promise.all(readdirSync("src/lang").filter((f) => f.startsWith("en-")).map((f) => import(`../src/lang/${f}`)))).map((m) => m.default));
const SAME = /^(Z\d|Z\d–Z\d|HIIT|HRV|VO2 max|ACWR|RPE|Strava|Garmin|OK|km|min)$/;
const missing = new Set();
for (const p of walk("src").filter((p) => /\.jsx?$/.test(p))) {
  const s = readFileSync(p, "utf8");
  for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) if (!(m[1] in en) && /[a-zæøå]/i.test(m[1]) && !SAME.test(m[1])) missing.add(m[1]);
  for (const m of s.matchAll(/\btn\([^,]+,\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"/g)) for (const k of [m[1], m[2]]) if (!(k in en) && !SAME.test(k)) missing.add(k);
}
for (const k of missing) console.log(`missing English: ${JSON.stringify(k)}`);
console.log(`${missing.size} source strings without English`);
process.exit(bad || missing.size ? 1 : 0);
