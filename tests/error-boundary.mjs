/* A crash in one screen never white-screens the app: Overblik's code chunk is made to throw (the panel shows a card,
   the other tabs keep working, the data is untouched), or to be missing as after a deploy (the app reloads once by
   itself, not in a loop). node tests/error-boundary.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(300));
{
  const { browser, ctx, page } = await openApp({ lang: "da", width: 390 });
  await ctx.route("**/assets/Dashboard-*.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: 'throw new Error("boom in Overblik");' }));
  const before = await page.evaluate(() => localStorage.getItem("ultraplan-log"));
  await tab(page, 2); await page.waitForTimeout(500);
  const card = page.locator(".crash");
  ok(await card.count() === 1 && /Noget gik galt her\. Dine data er gemt og ikke rørt\./.test(await card.innerText()), "Overblik crash: a card, not a white screen");
  ok(await page.locator("nav.tabbar").count() === 1, "the tab bar is still there");
  await tab(page, 0);
  ok(await page.locator(".today").count() > 0 || /I dag|Hviledag|km/.test(await page.locator("main").innerText()), "I dag still works after the crash");
  ok(await page.evaluate(() => localStorage.getItem("ultraplan-log")) === before, "data untouched");
  await browser.close();
}
{
  const { browser, ctx, page } = await openApp({ lang: "da", width: 390 });
  let loads = 0; page.on("load", () => loads++);
  await ctx.route("**/assets/Dashboard-*.js", (r) => r.abort());
  await tab(page, 2); await page.waitForTimeout(2500);
  ok(loads === 1, `missing chunk after a deploy: reloads once by itself (${loads})`);
  await page.locator("nav.tabbar button").nth(2).click().catch(() => {}); await page.waitForTimeout(1500);
  ok(loads === 1, `no reload loop (${loads})`);
  const txt = (await page.locator("body").innerText()).replace(/\n/g, " ");
  ok(/Der er kommet en ny udgave af appen\. Genindlæs for at fortsætte\./.test(txt), "then it says a new version is out, with Genindlæs");
  await browser.close();
}
{
  const { browser, ctx, page } = await openApp({ lang: "en", width: 390 });
  await ctx.route("**/assets/Dashboard-*.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: 'throw new Error("boom");' }));
  await tab(page, 2); await page.waitForTimeout(500);
  ok(/Something went wrong here\. Your data is saved and untouched\./.test(await page.locator(".crash").innerText()), "English card");
  await browser.close();
}
done();
