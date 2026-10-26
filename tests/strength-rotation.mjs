/* Strength rotates week by week and, on the coach plan, leans on legs, hips, core and back. node tests/strength-rotation.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(250));
// engine: the week picks the variants, patterns stay, B is back + core with the trail focus
{
  const { buildStrength } = await import("../src/strength.js");
  const names = (w) => buildStrength({ gear: "gym", phase: "Opbygning", week: w, focus: "trail", count: 2 }).sessions.map((s) => s.exercises.map((e) => e.name));
  const [a10, a11, a12] = [10, 11, 12].map(names);
  ok(JSON.stringify(a10) !== JSON.stringify(a11) && JSON.stringify(a11) !== JSON.stringify(a12), "weeks 10, 11 and 12 differ");
  ok(JSON.stringify(names(10)) === JSON.stringify(names(10)), "deterministic for the same week");
  const g = buildStrength({ gear: "gym", phase: "Opbygning", week: 10, focus: "trail", count: 2 });
  const pat = (s) => s.exercises.map((e) => e.pattern);
  ok(g.sessions[0].key === "A" && ["squat", "hinge", "single", "hip", "calf"].every((k) => pat(g.sessions[0]).includes(k)), `A covers the leg patterns (${pat(g.sessions[0]).join(",")})`);
  ok(g.sessions[1].focus === "Ryg og core" && ["pull", "back", "core", "carry"].every((k) => pat(g.sessions[1]).includes(k)) && pat(g.sessions[1]).filter((k) => k === "core").length === 2, `B is back + core (${pat(g.sessions[1]).join(",")})`);
  const b = g.sessions[1].exercises.filter((e) => e.pattern === "core").map((e) => e.name);
  ok(b[0] !== b[1], `two different core exercises (${b.join(" / ")})`);
  ok(["none", "home", "gym"].every((gear) => [0, 1, 2, 3].every((w) => buildStrength({ gear, week: w, focus: "trail" }).sessions.every((s) => s.exercises.every((e) => e.name && e.how)))), "every variant has a name and a cue for every gear level");
}
// screens: Tuesday is Styrke B · Ryg og core, Wednesday Styrke A, and next week's Wednesday is not the same list
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at: "2026-10-27T07:00:00" });
  const tue = (await page.locator(".today").innerText()).replace(/\n/g, " ");
  ok(/Styrke B/.test(tue) && /Ryg og core/.test(tue), `Tuesday card: ${tue.slice(0, 80)}`);
  const exTue = await page.locator(".today .ex b").allInnerTexts();
  ok(exTue.length === 5 && !exTue.some((x) => /Bænk|Skulderpres|OH press|push-up|Armbøj/i.test(x)), `no chest/shoulder press on the trail B (${exTue.join(" · ")})`);
  const figs = await page.locator(".today .ex svg").count(); const page0figures = async () => figs === 5;
  await browser.close();
  // Wednesday is a run + strength day: the session is the "+ Styrke A i dag efter løbet:" line
  const lineOf = async (pg) => ((await pg.locator(".today").innerText()).replace(/\n/g, " ").match(/\+ Styrke A i dag efter løbet: ([^|]*?)(?: Log| ✓|$)/) || [])[1] || "";
  const w10 = await openApp({ lang: "da", width: 390, at: "2026-10-28T07:00:00" });
  const ex10 = await lineOf(w10.page);
  ok(ex10.split(", ").length === 5, `Wednesday week 10: ${ex10}`);
  await w10.browser.close();
  const w11 = await openApp({ lang: "da", width: 390, at: "2026-11-04T07:00:00" });
  const ex11 = await lineOf(w11.page);
  ok(ex11.split(", ").length === 5 && ex11 !== ex10, `Wednesday week 11 differs: ${ex11}`);
  ok(await page0figures(), "every exercise on the Tuesday card has a figure");
  // Mere → Styrke carries the note; the Plan guide for another week shows that week's list
  await tab(w11.page, 4);
  await w11.page.locator("details.acc", { has: w11.page.locator("h2", { hasText: /^Styrke$/ }) }).locator("> summary").click();
  ok(/Øvelserne skifter uge for uge: ben, hofte, core og ryg til Bornholm/.test(await w11.page.locator("main").innerText()), "Mere → Styrke explains the rotation");
  ok(errors.length === 0, "no errors");
  await w11.browser.close();
}
// English
{
  const { browser, page } = await openApp({ lang: "en", width: 360, at: "2026-10-27T07:00:00" });
  const tue = (await page.locator(".today").innerText()).replace(/\n/g, " ");
  ok(/Strength B/.test(tue) && /Back and core/.test(tue), `en Tuesday: ${tue.slice(0, 60)}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "360: no sideways scroll");
  await browser.close();
}
done();
