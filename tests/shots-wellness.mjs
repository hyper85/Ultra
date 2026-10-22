/* Screenshot of Overblik with 28 days of resting HR: node tests/shots-wellness.mjs <outdir> */
import { openApp } from "./seed.mjs";
const out = process.argv[2] || ".";
const wellness = {}; for (let i = 27; i >= 0; i--) { const d = new Date(Date.UTC(2026, 9, 8) - i * 86400000).toISOString().slice(0, 10); wellness[d] = { hr: i === 0 ? 55 : 46 + ((i * 7) % 5) }; }
const { browser, page } = await openApp({ lang: "da", width: 390, patch: { wellness } });
await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(300);
await page.locator("#chart-hr-days").scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
await page.locator("#chart-hr-days").screenshot({ path: `${out}/hr-days.png` });
await browser.close();
