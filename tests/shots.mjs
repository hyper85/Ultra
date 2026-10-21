/* Screenshots of I dag at given dates for a visual check: node tests/shots.mjs <outdir> */
import { openApp, mk } from "./seed.mjs";
const out = process.argv[2] || ".";
const lift = { ...mk("2026-10-08", 0, 51, "WeightTraining", 110), id: "2026-10-08-WeightTraining", kind: "strength" };
for (const [name, opts] of [["event", { at: "2026-10-22T09:00:00" }], ["long", { at: "2026-10-10T07:00:00" }], ["strength", { todayRun: true, extraActs: { [lift.id]: lift } }]]) {
  const { browser, page } = await openApp({ lang: "da", width: 390, ...opts });
  await page.screenshot({ path: `${out}/r4-${name}.png`, fullPage: false });
  await browser.close();
}
