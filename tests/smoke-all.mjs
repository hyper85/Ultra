/* The whole app, every screen: all five tabs, Plan with its first weeks opened, Fremskridt's Overblik and Log, every
   section under Mere opened – in Danish and English, at 360, 390 and 1280 px. Fails on page errors, console errors,
   horizontal scroll, and buttons/inputs without a name; lists tap targets under 32 px (Android asks for 48 dp, the app
   uses at least 32 for secondary controls). Part of the weekly scan. node tests/smoke-all.mjs [--verbose] */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const verbose = process.argv.includes("--verbose");
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(250));
const audit = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("details:not([open]) > :not(summary)"); };
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || el.getAttribute("placeholder") || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || "").trim();
  const small = [], unnamed = [];
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.height < 32 || r.width < 32) && !(r.height >= 44 && r.width >= 26) && !el.matches("input[type=checkbox], input[type=radio]") && !(el.tagName === "A" && el.closest("p, li"))) small.push(`${el.tagName.toLowerCase()} "${name(el).slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (!name(el)) unnamed.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}${el.type ? "[" + el.type + "]" : ""}`);
  }
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, unnamed };
});
const findings = { small: new Set(), unnamed: new Set() };
for (const lang of ["da", "en"]) for (const width of [360, 390, 1280]) {
  const { browser, page, errors } = await openApp({ lang, width, height: width > 1000 ? 900 : 800, at: "2026-10-22T09:00:00" });
  const consoleErrors = []; page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|\/api\/|net::ERR/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
  const screens = [];
  const look = async (label) => { const a = await audit(page); screens.push(label); if (a.overflow > 0) ok(false, `${lang} ${width}px ${label}: horizontal scroll ${a.overflow}px`); a.small.forEach((x) => findings.small.add(`${label}: ${x}`)); a.unnamed.forEach((x) => findings.unnamed.add(`${lang} ${label}: ${x}`)); };
  await tab(page, 0); await look("I dag");
  await tab(page, 1); await look("Plan");
  const weeks = page.locator("button.wkhead");
  const nw = Math.min(await weeks.count(), 3); for (let i = 0; i < nw; i++) { await weeks.nth(i).click().catch(() => {}); await page.waitForTimeout(120); } if (nw) await look("Plan, uger åbne");
  await tab(page, 2); await look("Fremskridt · Overblik");
  const seg = page.locator(".segment button, [role=tab]"); if (await seg.count() > 1) { await seg.nth(1).click(); await page.waitForTimeout(250); await look("Fremskridt · Log"); }
  await tab(page, 3); await look("Træner");
  await tab(page, 4); await look("Mere");
  const sums = page.locator("details.acc > summary"); const n = await sums.count();
  for (let i = 0; i < n; i++) { const s = sums.nth(i); const open = await s.evaluate((el) => el.parentElement.open); if (!open) { await s.click().catch(() => {}); await page.waitForTimeout(150); } }
  await look(`Mere, ${n} sektioner åbne`);
  ok(errors.length === 0, `${lang} ${width}px: no page errors ${errors.join(" | ").slice(0, 200)}`);
  ok(consoleErrors.length === 0, `${lang} ${width}px: no console errors ${consoleErrors.join(" | ").slice(0, 300)}`);
  if (verbose) console.log(`  ${lang} ${width}px screens: ${screens.join(", ")}`);
  await browser.close();
}
ok(findings.unnamed.size === 0, `every button and input has a name${findings.unnamed.size ? ": " + [...findings.unnamed].slice(0, 12).join("; ") : ""}`);
console.log(`INFO tap targets under 32 px: ${findings.small.size}`); if (verbose || findings.small.size) for (const x of [...findings.small].slice(0, 40)) console.log("  " + x);
done();
