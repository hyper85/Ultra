/* api/garmin.js without Garmin: token parsing, the field search, chunked fetching and a refused endpoint, with a
   fake fetch. node tests/garmin-api.mjs */
import { check } from "./seed.mjs";
import { parseToken, garminDays, garminFetch, exchangeKey, GARMIN } from "../api/garmin.js";
const { ok, done } = check();
const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const t = parseToken(jwt(2000000000));
ok(t && t.exp === 2000000000 * 1000 && t.token.startsWith("h."), "token: the raw JWT, expiry from exp");
ok(parseToken(JSON.stringify({ access_token: jwt(1) })).exp === 1000 && parseToken("") === null, "token: JSON-wrapped or empty");
// field search: v2 daily summaries ({ data: [...] } with resting HR nested), sleep as a bare list with dailySleepDTO, HRV
const d = garminDays({
  summaries: { data: [{ calendarDate: "2026-10-27", heartRate: { restingHeartRate: 48, maxHeartRate: 160 } }, { calendarDate: "2026-10-28", restingHeartRate: 51 }, { calendarDate: "2026-10-26", heartRate: { restingHeartRate: 0 } }] },
  sleeps: [{ dailySleepDTO: { calendarDate: "2026-10-28", sleepTimeSeconds: 24240 } }, { calendarDate: "2026-10-27", sleepTimeSeconds: 19860 }],
  hrvs: { hrvSummaries: [{ calendarDate: "2026-10-28", lastNightAvg: 52, weeklyAvg: 55 }] },
});
ok(JSON.stringify(d.days) === JSON.stringify({ "2026-10-27": { hr: 48, sleep: 5.5 }, "2026-10-28": { hr: 51, sleep: 6.7, hrv: 52 } }), `days: ${JSON.stringify(d.days)}`);
ok(d.found.hr === 2 && d.found.sleep === 2 && d.found.hrv === 1 && !Object.keys(d.fields).length, "found counts, no unknown fields");
const u = garminDays({ summaries: [{ calendarDate: "2026-10-28", rhrValue: 50, steps: 4000 }] });
ok(!Object.keys(u.days).length && u.fields.dagsoversigt.join() === "calendarDate,rhrValue,steps", `unknown shape names its fields: ${JSON.stringify(u.fields)}`);
// fetching: chunks (sleep 31 days, HRV dates in the path), bearer token, a 404 part does not sink the rest
const calls = [];
const fake = async (url, opts) => {
  calls.push({ url: String(url), auth: opts.headers.Authorization });
  const u = new URL(url);
  if (u.pathname.includes("dailysummaries")) return new Response(JSON.stringify({ data: [{ calendarDate: u.searchParams.get("endDate"), restingHeartRate: 50 }] }), { status: 200 });
  if (u.pathname.includes("sleep")) return new Response(JSON.stringify([{ calendarDate: u.searchParams.get("startDate"), sleepTimeSeconds: 25200 }]), { status: 200 });
  return new Response("nope", { status: 404 });
};
const raw = await garminFetch({ token: "TOK", start: "2026-07-01", end: "2026-10-28", fetchImpl: fake });
const sleepCalls = calls.filter((c) => c.url.includes("sleep-service"));
ok(sleepCalls.length === 4 && sleepCalls[0].url.includes("startDate=2026-07-01&endDate=2026-07-31") && calls.every((c) => c.auth === "Bearer TOK" && c.url.startsWith(GARMIN)), `sleep in 31-day chunks with the bearer token (${sleepCalls.length})`);
ok(calls.some((c) => c.url.endsWith("/hrv-service/hrv/daily/2026-07-01/2026-10-28")), "HRV dates in the path");
ok(raw.summaries.length === 1 && raw.sleeps.length === 4 && raw.hrvs.length === 0 && raw.missing.join() === "hrv (404)", `a refused part is named, the rest arrives (${raw.missing})`);
// the key: ApiKey header, 401 → a clear message
let seen = null;
const tk = await exchangeKey("K".repeat(30), async (url, opts) => { seen = opts; return new Response(jwt(2000000000), { status: 200 }); });
ok(seen.method === "POST" && seen.headers.Authorization === `ApiKey ${"K".repeat(30)}` && tk.token.startsWith("h."), "key exchanged with Authorization: ApiKey");
let err = null; try { await exchangeKey("bad", async () => new Response("", { status: 401 })); } catch (e) { err = e; }
ok(err && err.status === 401 && /Garmin afviste nøglen/.test(err.message) && /personalApiToken/.test(err.message), "rejected key: clear message with the page to make a new one");
done();
