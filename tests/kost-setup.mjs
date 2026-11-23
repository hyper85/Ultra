/* Dagens kost without weight, height or age: there is no energy to compute, so the card asks for them (it read
   "10 kcal · 0 g protein") and "Udfyld Dig" opens Mere → Dig. With them it shows the day's numbers. node tests/kost-setup.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
{
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-23T09:00:00", patch: { weight: "", height: "", age: "" } });
  const card = page.locator(".panel.kost").first();
  const txt = (await card.innerText()).replace(/\s+/g, " ");
  ok(/Skriv din vægt, højde og alder under Mere → Dig/.test(txt) && !/kcal/.test(txt), `blank body data: the card asks for it (${txt.slice(0, 90)})`);
  await card.getByRole("button", { name: "Udfyld Dig" }).click(); await page.waitForTimeout(400);
  ok(await page.locator("details#dig").evaluate((d) => d.open), "Udfyld Dig opens Mere → Dig");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{
  const { browser, page } = await openApp({ lang: "da", at: "2026-11-23T09:00:00" });
  const txt = (await page.locator(".panel.kost").first().innerText()).replace(/\s+/g, " ");
  ok(/\d{4} kcal · \d{3} g protein/.test(txt), `with body data: the day's numbers (${txt.slice(0, 80)})`);
  await browser.close();
}
done();
