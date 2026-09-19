/* Checks the English dictionaries against the source: every key must appear literally somewhere in src/ (or the
   coach plan JSON), so a renamed Danish string cannot silently lose its translation. Run: node scripts/i18n-check.mjs */
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
process.exit(bad ? 1 : 0);
