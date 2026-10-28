/* FIT straight from the watch: a run the watch never closed (records + timer events, no session – it shows in the
   watch's day total but will not open or sync) is rebuilt from its samples; a finished file uses its session; a
   gzipped one (Strava's archive) is unpacked; a renamed file (".tff") is recognised by its header. Synthetic files
   built here – never commit a real one (it carries the runner's GPS track). node tests/fit-import.mjs */
import { openApp, check } from "./seed.mjs";
import { gzipSync } from "node:zlib";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(200));
const FIT_EPOCH = 631065600;
const build = ({ start, seconds, withSession = false, treadmill = false, name = "Tempo test" }) => {
  const parts = [];
  const def = (local, g, fields) => parts.push(Buffer.from([0x40 | local, 0, 0, g & 255, g >> 8, fields.length, ...fields.flat()]));
  const data = (local, vals) => { const bufs = [Buffer.from([local])]; for (const [s, v, signed] of vals) { const x = Buffer.alloc(s); if (typeof v === "string") x.write(v, "latin1"); else if (s === 1) x.writeUInt8(v); else if (s === 2) x.writeUInt16LE(v); else signed ? x.writeInt32LE(v) : x.writeUInt32LE(v >>> 0); bufs.push(x); } parts.push(Buffer.concat(bufs)); };
  const t0 = Math.floor(start.getTime() / 1000) - FIT_EPOCH;
  def(0, 0, [[0, 1, 0x00], [1, 2, 0x84], [4, 4, 0x86]]); data(0, [[1, 4], [2, 1], [4, t0]]);
  def(1, 12, [[0, 1, 0x00], [1, 1, 0x00]]); data(1, [[1, 1], [1, treadmill ? 1 : 0]]);
  def(2, 26, [[8, 16, 0x07]]); data(2, [[16, name]]);
  def(3, 21, [[253, 4, 0x86], [0, 1, 0x00], [1, 1, 0x00]]);
  const ev = (ts, type) => data(3, [[4, ts], [1, 0], [1, type]]);
  def(4, 20, treadmill ? [[253, 4, 0x86], [5, 4, 0x86], [3, 1, 0x02]] : [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [5, 4, 0x86], [3, 1, 0x02], [78, 4, 0x86]]);
  ev(t0, 0);
  for (let s = 0; s < seconds; s++) {
    if (s === 600) ev(t0 + 600, 4); // a 5 s pause at 10 min
    if (s === 605) ev(t0 + 605, 0);
    if (s >= 600 && s < 605) continue;
    const dist = Math.round(s * 3 * 100), alt = Math.round(((s < 600 ? s / 20 : 30) + 500) * 5), hr = 140;
    data(4, treadmill ? [[4, t0 + s], [4, dist], [1, hr]] : [[4, t0 + s], [4, 667000000 + s * 10, true], [4, 123000000 + s * 10, true], [4, dist], [1, hr], [4, alt]]);
  }
  if (withSession) { def(5, 18, [[253, 4, 0x86], [2, 4, 0x86], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [5, 1, 0x00], [6, 1, 0x00], [16, 1, 0x02], [17, 1, 0x02]]); data(5, [[4, t0 + seconds], [4, t0], [4, seconds * 1000], [4, (seconds - 5) * 1000], [4, seconds * 3 * 100], [1, 1], [1, treadmill ? 1 : 0], [1, 141], [1, 166]]); }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(14); head[0] = 14; head[1] = 16; head.writeUInt16LE(21195, 2); head.writeUInt32LE(body.length, 4); head.write(".FIT", 8, "latin1");
  return Buffer.concat([head, body, Buffer.alloc(2)]);
};
const at = (h) => new Date(Date.UTC(2026, 9, 27, h - 1, 0, 0)); // 27 Oct, Copenhagen = UTC+1
const unfinished = build({ start: at(18), seconds: 1800 });
const finished = build({ start: at(7), seconds: 1200, withSession: true, treadmill: true, name: "Bånd" });
const upload = async (page, files) => { await page.locator("#files input[type=file]").setInputFiles(files); await page.waitForTimeout(900); return (await page.locator("#files .advice").first().innerText()).replace(/\n/g, " "); };
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at: "2026-10-28T09:00:00" });
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  let msg = await upload(page, { name: "2026-10-27-18-00-00.tff", mimeType: "application/octet-stream", buffer: unfinished });
  ok(/Læste 1 aktiviteter \(1 løb\), 1 nye/.test(msg) && /Tempo test var ikke afsluttet på uret\. Turen er regnet ud fra urets målinger: 5\.4 km, 30 min, puls 140\./.test(msg), `unfinished run rebuilt: ${msg.slice(0, 220)}`);
  let A = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ultraplan-activities"))));
  const r = A.find((a) => a.source === "FIT" && a.day === "2026-10-27" && a.km > 5);
  ok(r && r.km === 5.4 && r.min === 30 && r.hr === 140 && r.type === "Run" && r.name === "Tempo test" && !r.treadmill && r.vert >= 25 && r.vert <= 31, `stored: ${JSON.stringify(r && { km: r.km, min: r.min, hr: r.hr, vert: r.vert, type: r.type, name: r.name })}`);
  ok(r.date === "2026-10-27T17:00:00.000Z", `start time 18:00 Copenhagen = 17:00 UTC (${r.date})`);
  msg = await upload(page, { name: "Bånd.fit.gz", mimeType: "application/gzip", buffer: gzipSync(finished) });
  A = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ultraplan-activities"))));
  const tm = A.find((a) => a.name === "Bånd");
  ok(/1 nye/.test(msg) && !/ikke afsluttet/.test(msg) && tm && tm.km === 3.6 && tm.min === 20 && tm.hr === 141 && tm.maxHr === 166 && tm.treadmill === true && !tm.vert, `finished treadmill file uses its session (gzipped): ${JSON.stringify(tm && { km: tm.km, min: tm.min, hr: tm.hr, maxHr: tm.maxHr, treadmill: tm.treadmill })}`);
  msg = await upload(page, { name: "2026-10-27-18-00-00.tff", mimeType: "application/octet-stream", buffer: unfinished });
  ok(/0 nye/.test(msg), `the same file twice: no duplicate (${msg.slice(0, 60)})`);
  msg = await upload(page, { name: "notes.fit", mimeType: "application/octet-stream", buffer: Buffer.from("hello") });
  ok(/notes\.fit: filen hedder \.fit, men er ikke en FIT-fil\./.test(msg), `fake .fit refused: ${msg.slice(0, 80)}`);
  // the day's week now counts the rebuilt run
  const lg = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log")));
  ok(lg["2026-10-26"]?.km >= 5.4, `week of 26 Oct has the km (${lg["2026-10-26"]?.km})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
