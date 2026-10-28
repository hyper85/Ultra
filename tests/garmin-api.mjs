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
// v2 daily summaries: resting HR under another name inside heartRate; the 7-day average is not today's value
const v2 = garminDays({ summaries: { data: [{ uuid: "x", calendarDate: "2026-10-28", heartRate: { lastSevenDaysAvgRestingValue: 53, restingValue: 50, maxValue: 150 } }] } });
ok(v2.days["2026-10-28"]?.hr === 50, `restingValue inside heartRate (${JSON.stringify(v2.days)})`);
const miss = garminDays({ summaries: { data: [{ calendarDate: "2026-10-28", heartRate: { minValue: 45, maxValue: 150 } }] } });
ok(miss.fields["dagsoversigt.heartRate"]?.join() === "minValue: tal,maxValue: tal", `unknown heartRate names its inner fields: ${JSON.stringify(miss.fields)}`);
const fb = garminDays({ summaries: { data: [{ calendarDate: "2026-10-28", heartRate: { maxValue: 150 } }] }, heartDays: [{ calendarDate: "2026-10-28", restingHeartRate: 49, heartRateValues: [[1, 60]] }] });
ok(fb.days["2026-10-28"]?.hr === 49 && fb.found.hr === 1, "fallback: one-day heart rate gives the resting HR");
// the one-day endpoint answers a single object with samples: it is one day, not a list of samples
const calls2 = [];
const fake2 = async (url) => { calls2.push(String(url)); const u = new URL(url);
  if (u.pathname.includes("dailysummaries")) return new Response(JSON.stringify({ data: [{ calendarDate: "2026-10-28", heartRate: { maxValue: 150 } }] }), { status: 200 });
  if (u.pathname.includes("dailyHeartRate")) return new Response(JSON.stringify({ calendarDate: u.searchParams.get("date"), restingHeartRate: 50, heartRateValues: [[1, 60], [2, 61]] }), { status: 200 });
  return new Response("[]", { status: 200 }); };
const raw2 = await garminFetch({ token: "T", start: "2026-10-01", end: "2026-10-28", fetchImpl: fake2 });
ok(raw2.heartDays.length === 7 && calls2.filter((c) => c.includes("dailyHeartRate?date=")).length === 7 && garminDays(raw2).found.hr === 7, `fallback asks 7 days and gets 7 resting values (${raw2.heartDays.length})`);
// the real v2 shape (28 Oct 2026): heartRate { minValue, maxValue, restingValue }, possibly wrapped or as text
for (const [label, rv] of [["number", 51], ["text", "51"], ["wrapped", { value: 51, unit: "bpm" }]]) {
  const r = garminDays({ summaries: { data: [{ uuid: "u", calendarDate: "2026-10-28", heartRate: { minValue: 44, maxValue: 150, restingValue: rv } }] } });
  ok(r.days["2026-10-28"]?.hr === 51, `restingValue as ${label}`);
}
const empty = garminDays({ summaries: { data: [{ calendarDate: "2026-10-27", heartRate: { minValue: 44, maxValue: 150, restingValue: null } }, { calendarDate: "2026-10-28", heartRate: { minValue: { value: 44 }, maxValue: 150, restingValue: { score: 3 } } }] } });
ok(empty.fields["dagsoversigt.heartRate"]?.join(" | ") === "minValue: {value} | maxValue: tal | restingValue: {score}", `shapes, no values: ${JSON.stringify(empty.fields)}`);
const fake3 = async (url) => { const u = new URL(url);
  if (u.pathname.includes("dailysummaries")) return new Response(JSON.stringify({ data: [{ calendarDate: "2026-10-28", heartRate: { restingValue: null } }] }), { status: 200 });
  if (u.pathname.includes("dailyHeartRate")) return new Response(JSON.stringify({ userProfilePK: 1, startTimestampGMT: "x", heartRateValues: [[1, 60]] }), { status: 200 });
  return new Response("[]", { status: 200 }); };
const r3 = garminDays(await garminFetch({ token: "T", start: "2026-10-20", end: "2026-10-28", fetchImpl: fake3 }));
ok(r3.fields.dagspuls?.join() === "userProfilePK,startTimestampGMT,heartRateValues", `unreadable one-day answer names its keys: ${JSON.stringify(r3.fields)}`);
// only the day and its heartRate section: a "resting…" number in stress is not a pulse; the source path is reported
const st = garminDays({ summaries: { data: [{ calendarDate: "2026-10-28", heartRate: { restingValue: null }, stress: { restingLevel: 30, restingStressDuration: 40 } }] } });
ok(!st.days["2026-10-28"] && st.fields["dagsoversigt.heartRate"]?.join() === "restingValue: tom", `stress numbers ignored (${JSON.stringify(st.days)})`);
const src = garminDays({ summaries: { data: [{ calendarDate: "2026-10-28", heartRate: { restingValue: 50 } }, { calendarDate: "2026-10-27", heartRate: { restingValue: { value: 49 } } }] } });
ok(src.source.hr === "dagsoversigt.heartRate.restingValue" && src.found.hr === 2, `source path: ${src.source.hr}`);
const fb2 = garminDays({ summaries: { data: [{ calendarDate: "2026-10-28", heartRate: { restingValue: null } }] }, heartDays: [{ calendarDate: "2026-10-28", restingHeartRate: 48 }] });
ok(fb2.source.hr === "dagspuls.restingHeartRate" && fb2.days["2026-10-28"].hr === 48, `fallback source: ${fb2.source.hr}`);
done();
