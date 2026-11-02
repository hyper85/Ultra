/* The week's RPE: typed into the week's field it overrides the runs for the load and ACWR – "2" for a week with a
   tempo and a long run made ACWR ~0.4. The field shows the runs' value as placeholder, clearing it goes back to the
   runs, and a typed value 3+ away from them gets a note with "Brug {n}"; the log flags the week. node tests/week-rpe.mjs */
import { openApp, check, mk } from "./seed.mjs";
const { ok, done } = check();
const run = (day, km, min, hr) => ({ [`${day}-Run`]: mk(day, km, min, "Run", hr) });
// week of 26 Oct: easy 135, tempo 157, easy 129, long 140 → about RPE 5 from heart rate (max 186)
const week = { ...run("2026-10-26", 5, 33, 135), ...run("2026-10-28", 9, 50, 157), ...run("2026-10-29", 8, 50, 129), ...run("2026-10-31", 20, 130, 140) };
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at: "2026-10-30T09:00:00", extraActs: week, logPatch: { "2026-10-26": { km: 42, rpe: 2, auto: true } } });
  const card = page.locator(".week-panel");
  ok(/Ugens RPE/.test(await card.innerText()), "the field says it is the WEEK's RPE");
  const note = card.locator(".rpe-off");
  ok(await note.count() === 1 && /Ugens RPE er sat til 2, men dine ture siger cirka 5\. Ugens belastning og ACWR regnes med 2\./.test(await note.innerText()), `note: ${(await note.innerText().catch(() => "")).replace(/\n/g, " ")}`);
  await note.getByRole("button", { name: "Brug 5" }).click(); await page.waitForTimeout(200);
  let l = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log"))["2026-10-26"]);
  ok(l.rpe === 5 && l.rpeAuto === true && await card.locator(".rpe-off").count() === 0, `Brug 5: the runs' value, marked as automatic (${JSON.stringify({ rpe: l.rpe, rpeAuto: l.rpeAuto })})`);
  const input = card.locator('input[aria-label^="RPE"], .weekfields label:first-child input').first();
  await input.fill("2"); await page.waitForTimeout(150);
  ok(await card.locator(".rpe-off").count() === 1, "typing 2 again brings the note back");
  await input.fill(""); await page.waitForTimeout(150);
  l = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log"))["2026-10-26"]);
  ok(l.rpe === 5 && l.rpeAuto === true, `clearing the field goes back to the runs (${l.rpe})`);
  await input.fill("6"); await page.waitForTimeout(150);
  ok(await card.locator(".rpe-off").count() === 0, "a typed 6 is close enough to the runs' 5: no note");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{ // the log flags the finished week, and its ACWR rises once the runs' RPE is used
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-11-02T09:00:00", extraActs: week, logPatch: { "2026-10-26": { km: 42, rpe: 2, auto: true } } });
  await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(250);
  await page.locator(".segment button, [role=tab]").nth(1).click(); await page.waitForTimeout(250);
  const flag = page.locator(".rpe-flag");
  ok(await flag.count() === 1, "the log marks the week with a typed RPE far from its runs");
  const row = page.locator("tr", { has: flag });
  const before = +(await row.locator(".pill").last().innerText()).replace(/[^\d.]/g, "");
  await flag.click(); await page.waitForTimeout(200);
  const note = page.locator(".dayrow .rpe-off");
  ok(await note.count() === 1, "tapping it opens the week with the note");
  await note.getByRole("button", { name: /Brug \d/ }).click(); await page.waitForTimeout(250);
  const after = +(await page.locator("tr", { has: page.locator('button.wk:has(b:text-is("10"))') }).locator(".pill").last().innerText()).replace(/[^\d.]/g, "");
  ok(after > before * 2 && await page.locator(".rpe-flag").count() === 0, `ACWR for the week: ${before} → ${after}, flag gone`);
  await browser.close();
}
{ // English
  const { browser, page } = await openApp({ lang: "en", width: 390, at: "2026-10-30T09:00:00", extraActs: week, logPatch: { "2026-10-26": { km: 42, rpe: 2, auto: true } } });
  ok(/The week's RPE is set to 2, but your runs say about 5\./.test(await page.locator(".week-panel .rpe-off").innerText()), "English note");
  await browser.close();
}
done();
