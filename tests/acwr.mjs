/* ACWR = this week's load ÷ the average of the 4 weeks before. A week inside the plan with nothing logged (sick, lost
   week) counts as 0, not skipped: 40, 40, 40, –, then 50 km gives 250 ÷ 150 = 1.67 (red), not 250 ÷ 200 = 1.25.
   The trænerråd then cuts the next week with that reason. node tests/acwr.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const w = (km) => ({ km, rpe: 5 });
const logPatch = { "2026-10-19": w(40), "2026-10-26": w(40), "2026-11-02": w(40), "2026-11-16": w(50) }; // 9 Nov: nothing
{
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-23T09:00:00", logPatch });
  const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok(/Trænerråd \(ACWR 1\.67\)/.test(txt) || /ACWR 1\.67/.test(txt), `the week after the jump is cut for ACWR 1.67 (${(txt.match(/Trænerråd[^.]*\./) || [""])[0]})`);
  await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(400);
  const over = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok(/1[.,]67/.test(over), "Fremskridt shows the same 1.67 for the last full week");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{ // no gap: 40, 40, 40, 40, then 50 → 1.25, and no trænerråd
  const { browser, page } = await openApp({ lang: "da", at: "2026-11-23T09:00:00", logPatch: { ...logPatch, "2026-11-09": w(40) } });
  const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok(!/Trænerråd/.test(txt), "a steady block then 50 km: ACWR 1.25, no trænerråd");
  await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(400);
  ok(/1[.,]25/.test((await page.locator("main").innerText()).replace(/\s+/g, " ")), "Fremskridt shows 1.25");
  await browser.close();
}
done();
