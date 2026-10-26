/* Full-page screenshots of every tab at a given date: node tests/shots-tabs.mjs <outdir> [at] [lang] */
import { openApp } from "./seed.mjs";
const [out = ".", at = "2026-10-26T07:00:00", lang = "da"] = process.argv.slice(2);
const { browser, page } = await openApp({ lang, width: 390, at });
const tabs = await page.locator("nav.tabbar button").allInnerTexts();
for (let i = 0; i < tabs.length; i++) {
  await page.locator("nav.tabbar button").nth(i).click(); await page.waitForTimeout(300); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/tab-${i}-${tabs[i].replace(/\s+/g, "")}.png`, fullPage: true });
}
await browser.close();
