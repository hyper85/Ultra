import { ymd, parseLocal, addDays, mondayOf, kind, restingHRSeries } from "./import.js";
import { t } from "./i18n.js";
import { hrAt, hrShare, karvonen } from "./hr.js";

/* ================= insights: what the app has learned about the runner =================
   Pure functions over the plan, the weekly log and the activities. Everything here is deterministic and
   explainable: each finding names the numbers it comes from, and every action is a plain profile patch the
   user applies with one tap. Nothing is changed behind the runner's back. */

const DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]; // Danish: coachContext uses them as is, findings use t()
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100; // ACWR with two decimals, as Overblik shows it
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* The runner's MEASURED resting-HR normal before a week (YYYY-MM-DD Monday): Garmin's daily values (median of the 28
   days before the week, at least 10 of them), else the weekly log (median of up to 8 weeks before, at least 3), else
   the number typed in the profile. The profile value also sets the heart-rate zones, and a runner may keep it low on
   purpose (to match Strava's zones), so warnings about a high resting HR must not be judged against it when
   measurements exist. Returns { normal, source: "garmin" | "log" | "profile", n } or null. */
export function restingBaseline({ wellness, log = {}, profileRest, beforeKey }) {
  if (beforeKey) {
    const d = restingHRSeries(wellness || {}, { days: 28, until: ymd(addDays(parseLocal(beforeKey), -1)) });
    if (d.rows.length >= 10) return { normal: d.normal, source: "garmin", n: d.rows.length };
    const ws = Object.keys(log || {}).filter((k) => k < beforeKey && +log[k]?.hr > 0).sort().slice(-8).map((k) => +log[k].hr);
    if (ws.length >= 3) return { normal: Math.round(median(ws)), source: "log", n: ws.length };
  }
  return +profileRest > 0 ? { normal: +profileRest, source: "profile", n: 0 } : null;
}

// Activities that count as running, grouped by day.
const runsByDay = (acts, includeHikes) => {
  const m = {};
  for (const a of Object.values(acts || {})) {
    const k = kind(a.type);
    if (!(k === "run" || (includeHikes && k === "hike"))) continue;
    (m[a.day] ||= []).push(a);
  }
  return m;
};

/* What the watch says: the last `n` completed weeks from imported/typed activities, one row per week. */
/* The whole history from the watch, month by month, so the coach sees years, not weeks: km, runs, longest run,
   heart rate, pace and minutes of other sessions per month, plus a few totals. Compact enough for the model. */
export function watchHistory(acts = {}, { includeHikes = false, months = 36 } = {}) {
  const runs = {}, other = {};
  for (const a of Object.values(acts)) {
    const k = kind(a.type); const m = String(a.day).slice(0, 7);
    if (k === "run" || (includeHikes && k === "hike")) (runs[m] ||= []).push(a);
    else if (k !== "hike" && a.min > 0) other[m] = (other[m] || 0) + a.min;
  }
  const keys = [...new Set([...Object.keys(runs), ...Object.keys(other)])].sort().slice(-months);
  const rows = keys.map((m) => {
    const rs = runs[m] || [];
    const km = rs.reduce((a, r) => a + r.km, 0);
    const withHR = rs.filter((r) => r.hr > 0), withMin = rs.filter((r) => r.min > 0);
    return { måned: m, km: r1(km), ture: rs.length, længste_km: rs.length ? r1(Math.max(...rs.map((r) => r.km))) : 0,
      snit_puls: withHR.length ? Math.round(withHR.reduce((a, r) => a + r.hr * r.km, 0) / withHR.reduce((a, r) => a + r.km, 0)) : null,
      snit_tempo_min_km: withMin.length ? r1(withMin.reduce((a, r) => a + r.min, 0) / withMin.reduce((a, r) => a + r.km, 0)) : null,
      andre_pas_min: other[m] ? Math.round(other[m]) : 0 };
  });
  const all = Object.values(acts).filter((a) => kind(a.type) === "run" || (includeHikes && kind(a.type) === "hike"));
  const best = rows.reduce((b, r) => (r.km > (b?.km || 0) ? r : b), null);
  return {
    måneder: rows,
    første_aktivitet: all.length ? all.map((a) => a.day).sort()[0] : null,
    måneder_med_data: rows.filter((r) => r.ture > 0).length,
    km_i_alt: r1(all.reduce((a, r) => a + r.km, 0)),
    ture_i_alt: all.length,
    længste_tur_nogensinde_km: all.length ? r1(Math.max(...all.map((a) => a.km))) : null,
    bedste_måned: best ? { måned: best.måned, km: best.km } : null,
  };
}

export function watchSummary(acts = {}, { includeHikes = false, todayKey, weeks = 12 } = {}) {
  const byDay = runsByDay(acts, includeHikes);
  const rows = [];
  for (let k = weeks; k >= 1; k--) {
    const start = addDays(parseLocal(todayKey), -7 * k);
    const runs = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => byDay[ymd(addDays(start, i))] || []);
    if (!runs.length) { rows.push({ uge_start: ymd(start), km: 0, ture: 0 }); continue; }
    const km = runs.reduce((a, r) => a + r.km, 0);
    const withHR = runs.filter((r) => r.hr > 0), withMin = runs.filter((r) => r.min > 0);
    const hr = withHR.length ? Math.round(withHR.reduce((a, r) => a + r.hr * r.km, 0) / withHR.reduce((a, r) => a + r.km, 0)) : null;
    const pace = withMin.length ? r1(withMin.reduce((a, r) => a + r.min, 0) / withMin.reduce((a, r) => a + r.km, 0)) : null;
    rows.push({ uge_start: ymd(start), km: r1(km), ture: runs.length, længste_km: r1(Math.max(...runs.map((r) => r.km))), snit_puls: hr, snit_tempo_min_km: pace });
  }
  const withData = rows.filter((r) => r.ture > 0);
  const last4 = rows.slice(-4).filter((r) => r.ture > 0);
  return {
    uger: rows,
    uger_med_data: withData.length,
    snit_km_sidste_4: last4.length ? Math.round(last4.reduce((a, r) => a + r.km, 0) / last4.length) : null,
    længste_tur_km: withData.length ? Math.max(...withData.map((r) => r.længste_km)) : null,
    ture_pr_uge: withData.length ? r1(mean(withData.map((r) => r.ture))) : null,
  };
}

export function buildInsights({ plan, log = {}, acts = {}, p = {}, todayKey, maxHR, includeHikes = false }) {
  const byDay = runsByDay(acts, includeHikes);
  const watch = watchSummary(acts, { includeHikes, todayKey, weeks: 4 });
  const dayKm = (key, i) => (byDay[ymd(addDays(parseLocal(key), i))] || []).reduce((s, a) => s + a.km, 0);
  const done = plan.rows.filter((r) => r.key < todayKey && !r.isRace);           // completed plan weeks
  const logged = done.filter((r) => log[r.key]?.km > 0);
  const weeks = logged.map((r) => ({ key: r.key, i: r.i, plan: r.km, ran: log[r.key].km, ratio: r.km ? log[r.key].km / r.km : null, rpe: log[r.key].rpe ?? null, hr: log[r.key].hr ?? null }));
  const ratios = weeks.map((w) => w.ratio).filter((x) => x != null);
  const n = weeks.length;
  const hit = ratios.filter((x) => x >= 0.85 && x <= 1.2).length;
  const med = median(ratios);
  const tendency = n >= 3 && med != null ? (med < 0.8 ? "under" : med > 1.15 ? "over" : "on") : null;

  // Streak: consecutive completed weeks with anything logged, counted back from the last completed week.
  let streak = 0;
  for (let k = done.length - 1; k >= 0; k--) { if (log[done[k].key]?.km > 0) streak++; else break; }

  // Weekday pattern: planned run days that get skipped, and free days the runner uses anyway.
  const pattern = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ i, planned: 0, ranPlanned: 0, free: 0, ranFree: 0 }));
  const withActs = done.filter((r) => [0, 1, 2, 3, 4, 5, 6].some((i) => dayKm(r.key, i) > 0));
  for (const r of withActs) for (const d of pattern) {
    const planned = r.days[d.i] > 0, ran = dayKm(r.key, d.i) > 0;
    if (planned) { d.planned++; if (ran) d.ranPlanned++; } else { d.free++; if (ran) d.ranFree++; }
  }
  const skipped = pattern.filter((d) => d.planned >= 3 && d.ranPlanned / d.planned <= 0.34).sort((a, b) => a.ranPlanned / a.planned - b.ranPlanned / b.planned)[0] || null;
  const usedFree = pattern.filter((d) => d.free >= 3 && d.ranFree >= 2 && d.ranFree / d.free >= 0.5).sort((a, b) => b.ranFree / b.free - a.ranFree / a.free)[0] || null;

  // Long runs: did the long day get at least 80 % of what was planned?
  const longWeeks = withActs.filter((r) => r.longDay != null && r.lng > 0);
  const longDone = longWeeks.filter((r) => dayKm(r.key, r.longDay) >= r.lng * 0.8).length;
  const longRate = longWeeks.length >= 3 ? longDone / longWeeks.length : null;

  // Easy runs: heart rate against the easy cap (the top of Z2: 70 % of the heart-rate reserve, or of max without a resting HR).
  const cap = hrAt(0.7, { maxHR, restHR: p.restHR });
  const easyRuns = [];
  for (const r of done) for (const i of [0, 1, 2, 3, 4, 5, 6]) {
    if (i === r.longDay || i === r.qDay) continue;
    for (const a of byDay[ymd(addDays(parseLocal(r.key), i))] || []) if (a.hr && a.km >= 3) easyRuns.push({ ...a, week: r.key });
  }
  const easyAbove = cap && easyRuns.length >= 4 ? easyRuns.filter((a) => a.hr > cap + 3).length / easyRuns.length : null;
  const easyHR = easyRuns.length ? Math.round(mean(easyRuns.map((a) => a.hr))) : null;
  // The runner's typical easy pace: median min/km of easy runs at or under the cap.
  const easyPaces = easyRuns.filter((a) => a.min > 0 && (!cap || a.hr <= cap + 3)).map((a) => a.min / a.km);
  // Without heart rate (a watch or Strava setting), the easy pace is the median of the ordinary weekday runs
  // (3–16 km, not the long or hard day, RPE at most 5 when typed) over the last 8 finished weeks – marked as estimated.
  let easyPaceMinKm = easyPaces.length >= 3 ? median(easyPaces) : null, easyPaceEst = false;
  if (!easyPaceMinKm) {
    const plain = [];
    for (const r of done.slice(-8)) for (const i of [0, 1, 2, 3, 4, 5, 6]) {
      if (i === r.longDay || i === r.qDay) continue;
      for (const a of byDay[ymd(addDays(parseLocal(r.key), i))] || []) if (a.min > 0 && a.km >= 3 && a.km <= 16 && !(a.rpe > 5)) plain.push(a.min / a.km);
    }
    if (plain.length >= 3) { easyPaceMinKm = median(plain); easyPaceEst = true; }
  }
  const easyPace = easyPaceMinKm ? `${Math.floor(easyPaceMinKm)}:${String(Math.round((easyPaceMinKm % 1) * 60)).padStart(2, "0")}` : null;

  // Aerobic efficiency: speed per heartbeat on easy runs, first half of the window vs the last half.
  const eff = easyRuns.filter((a) => a.min > 0 && a.hr > 0).sort((a, b) => (a.day < b.day ? -1 : 1)).map((a) => (a.km / (a.min / 60)) / a.hr);
  let efficiencyPct = null;
  if (eff.length >= 6) { const h = eff.length >> 1; const a = mean(eff.slice(0, h)), b = mean(eff.slice(-h)); if (a > 0) efficiencyPct = Math.round(((b - a) / a) * 100); }

  // Resting heart rate: the last 3 logged weeks against the runner's normal.
  const last3 = weeks.slice(-3); const hrs = last3.map((w) => w.hr).filter((x) => x > 0);
  const base = last3.length ? restingBaseline({ wellness: p.wellness, log, profileRest: p.restHR, beforeKey: last3[0].key }) : null;
  const restHRDelta = hrs.length >= 2 && base?.normal ? r1(mean(hrs) - base.normal) : null;

  // Runs per week against what the runner said they could do.
  const runsPerWeek = withActs.length ? r1(mean(withActs.map((r) => [0, 1, 2, 3, 4, 5, 6].filter((i) => dayKm(r.key, i) > 0).length))) : null;

  const coach = !!plan.coach;
  // Weekday name for a finding, translated; capitalised at the start of a sentence.
  const day = (i, cap = false) => { const d = t(DAYS[i]); return cap ? d.charAt(0).toUpperCase() + d.slice(1) : d; };
  const findings = [];
  const add = (id, level, text, action) => findings.push({ id, level, text, ...(action ? { action } : {}) });

  // The watch knows the base better than the questionnaire did: offer to use it.
  if (watch.uger_med_data >= 3 && watch.snit_km_sidste_4 != null && p.currentKm != null && Math.abs(watch.snit_km_sidste_4 - p.currentKm) >= Math.max(5, 0.15 * p.currentKm))
    add("watch-base", "info", t("Dit ur siger {km} km/uge de sidste 4 uger, planen regner med {base}.{tail}", { km: watch.snit_km_sidste_4, base: p.currentKm, tail: coach ? t(" Det påvirker ACWR-baselinen.") : t(" Planen og ACWR bliver mere præcise med det rigtige tal.") }),
      { label: t("Brug {km} km/uge som base", { km: watch.snit_km_sidste_4 }), patch: { currentKm: watch.snit_km_sidste_4 } });
  if (n >= 3 && tendency === "on" && hit / n >= 0.5) add("on-plan", "good", t("Du rammer planen: {hit} af {n} uger inden for 85–120 %.", { hit, n }));
  if (tendency === "under") add("under", "warn", t("Du løber typisk {pct} % af det planlagte ({n} uger). Enten er planen for stor til din hverdag, eller også mangler der dage. En lavere top holder du bedre end en plan, du springer over.", { pct: Math.round(med * 100), n }),
    coach ? null : { label: t("Sænk toppen 10 %"), patch: { peakScale: r1(Math.max(0.6, (p.peakScale || 1) - 0.1)) } });
  if (tendency === "over") add("over", "warn", t("Du løber typisk {pct} % af det planlagte ({n} uger). Planens tal er et loft. Er ACWR grøn uge efter uge, kan toppen hæves lidt – ellers er det her, skader kommer fra.", { pct: Math.round(med * 100), n }),
    coach || (p.peakScale || 1) >= 1.3 ? null : { label: t("Hæv toppen 10 %"), patch: { peakScale: r1((p.peakScale || 1) + 0.1) } });
  if (skipped) {
    const to = usedFree && usedFree.i !== skipped.i ? usedFree : null;
    const fromAvail = p.sched?.A?.[skipped.i]?.avail || "normal";
    add("skipped-day", "info", t("{day} springes over ({ran} af {planned}).{instead}{coach}", { day: day(skipped.i, true), ran: skipped.ranPlanned, planned: skipped.planned, instead: to ? t(" Til gengæld løber du tit {day} ({ran} af {free}).", { day: day(to.i), ran: to.ranFree, free: to.free }) : "", coach: coach ? t(" Sig det til din træner – i trænerplanen ligger dagene fast.") : "" }),
      coach ? null : to ? { label: t("Flyt løb fra {from} til {to}", { from: day(skipped.i), to: day(to.i) }), patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === skipped.i ? { ...d, avail: "none" } : j === to.i ? { ...d, avail: d.avail === "none" ? fromAvail : d.avail } : d)) } } }
        : { label: t("Slå {day} fra", { day: day(skipped.i) }), patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === skipped.i ? { ...d, avail: "none" } : d)) } } });
  } else if (usedFree && !coach) {
    add("free-day", "info", t("Du løber tit {day} ({ran} af {free} uger), selv om dagen står som fri. Giv den tid i planen, så bruger den dagen rigtigt.", { day: day(usedFree.i), ran: usedFree.ranFree, free: usedFree.free }),
      { label: t("Åbn {day} i planen", { day: day(usedFree.i) }), patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === usedFree.i ? { ...d, avail: "normal" } : d)) } } });
  }
  if (longRate != null && longRate < 0.5) add("long-short", "warn", t("Den lange tur blev kortere end planlagt i {short} af {n} uger. Det er den vigtigste tur – kort hverdagstur og hel lang tur slår det modsatte.", { short: longWeeks.length - longDone, n: longWeeks.length }));
  if (longRate != null && longRate >= 0.8 && n >= 4) add("long-ok", "good", t("Den lange tur bliver gennemført {done} af {n} gange. Det er dér, ultraformen kommer fra.", { done: longDone, n: longWeeks.length }));
  if (easyAbove != null && easyAbove >= 0.5) add("easy-hard", "warn", t("{pct} % af dine rolige ture ligger over pulsloftet {cap} (snit {hr}). Rolige ture skal føles for langsomme.", { pct: Math.round(easyAbove * 100), cap, hr: easyHR }));
  if (easyAbove != null && easyAbove < 0.25 && easyHR <= cap) add("easy-ok", "good", t("Dine rolige ture er rolige (snit puls {hr}, loft {cap}). Det er den svære disciplin, og du har den.", { hr: easyHR, cap }));
  if (efficiencyPct != null && efficiencyPct >= 3) add("fitter", "good", t("Formen stiger: {pct} % mere fart ved samme puls på de rolige ture sammenlignet med starten.", { pct: efficiencyPct }));
  if (efficiencyPct != null && efficiencyPct <= -5) add("slower", "info", t("{pct} % mindre fart ved samme puls end i starten. Varme, søvn eller for meget belastning? Hold igen en uge og se, om det retter sig.", { pct: Math.abs(efficiencyPct) }));
  if (restHRDelta != null && restHRDelta >= 5) add("resthr-high", "warn", t("Hvilepulsen har ligget {n} slag over din normal de sidste uger. Kroppen beder om søvn og mad før den beder om km.", { n: restHRDelta }));
  if (restHRDelta != null && restHRDelta <= -3) add("resthr-low", "good", t("Hvilepulsen er faldet {n} slag under din normal. Konditionen stiger.", { n: Math.abs(restHRDelta) }),
    { label: t("Sæt normal hvilepuls til {hr}", { hr: Math.round(p.restHR + restHRDelta) }), patch: { restHR: Math.round(p.restHR + restHRDelta) } });
  if (runsPerWeek != null && p.maxRunDays && runsPerWeek <= p.maxRunDays - 1.5 && withActs.length >= 4) add("fewer-days", "info", t("Du løber {n} dage om ugen, planen regner med {max}. Færre, lidt længere ture passer måske bedre.", { n: runsPerWeek, max: p.maxRunDays }),
    coach ? null : { label: t("Sæt løbedage til {n}", { n: Math.max(2, Math.round(runsPerWeek)) }), patch: { maxRunDays: Math.max(2, Math.round(runsPerWeek)) } });
  // Sleep: the last 3 logged weeks with hours.
  const sleeps = weeks.slice(-3).map((w) => log[w.key]?.sleep).filter((x) => x > 0);
  const sleepAvg = sleeps.length >= 2 ? r1(mean(sleeps)) : null;
  if (sleepAvg != null && sleepAvg < 6.5) add("sleep-low", "warn", t("Du sover {h} timer i snit de sidste uger. Under 7 timer bygger kroppen ikke det, træningen beder om. En time mere søvn slår en time mere løb.", { h: sleepAvg }));
  if (sleepAvg != null && sleepAvg >= 7.5) add("sleep-ok", "good", t("{h} timers søvn i snit. Det er den bedste restitution, der findes.", { h: sleepAvg }));
  // Fitness metrics from the watch (VO2 max, HRV), when a report has been imported.
  const series = (key, n = 8) => done.slice(-n).map((r) => log[r.key]?.[key]).filter((x) => x > 0);
  const vo2 = series("vo2"); const hrv = series("hrv");
  if (vo2.length >= 3 && vo2.at(-1) - vo2[0] >= 1) add("vo2-up", "good", t("VO2 max fra uret er gået fra {from} til {to}. Motoren vokser.", { from: vo2[0], to: vo2.at(-1) }));
  if (vo2.length >= 3 && vo2[0] - vo2.at(-1) >= 2) add("vo2-down", "info", t("VO2 max fra uret er faldet fra {from} til {to}. Det følger tit lav volumen eller sygdom – ikke noget at jage, men værd at kende.", { from: vo2[0], to: vo2.at(-1) }));
  if (hrv.length >= 4) { const base = mean(hrv.slice(0, -1)); const last = hrv.at(-1); if (base > 0 && last < base * 0.85) add("hrv-low", "warn", t("HRV er {last} mod normalt {base}. Kroppen er under pres – sov, spis, og hold ugen rolig.", { last, base: Math.round(base) })); }

  if (findings.length === 0) add("empty", "info", t("Appen kender dig ikke endnu. Log dine ture i et par uger, så dukker mønstrene op her."));
  const order = { warn: 0, info: 1, good: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const summary = { sleepAvg, easyPace, easyPaceMinKm, easyPaceEst, weeksLogged: n, hitRate: n ? r1(hit / n) : null, medianRatio: med != null ? r1(med) : null, tendency, streak, runsPerWeek, longRunRate: longRate != null ? r1(longRate) : null, easyAboveCap: easyAbove != null ? r1(easyAbove) : null, easyHR, easyCap: cap, efficiencyPct, restHRDelta,
    skippedDay: skipped ? day(skipped.i) : null, extraDay: usedFree ? day(usedFree.i) : null };
  return { summary, findings, weeks };
}

/* ================= heart rate from the watch: peak and zones over time ================= */
// The highest max heart rate on a run in the last year. A single top more than 4 above the next one is a sensor spike
// (a wrist strap on the treadmill), not a max: it is skipped and reported. Returns { hr, day, name, skipped } or null.
export function hrPeak(acts = {}, { until, days = 365 } = {}) {
  const from = until ? ymd(addDays(parseLocal(until), -days)) : "";
  const list = Object.values(acts).filter((a) => kind(a.type) === "run" && a.maxHr > 100 && (!until || (a.day >= from && a.day <= until))).sort((x, y) => y.maxHr - x.maxHr);
  if (list.length < 3) return null;
  const skipped = [];
  if (list[0].maxHr - list[1].maxHr > 4) skipped.push(list.shift()); // one lone top at most: a second high run confirms the max
  const top = list[0];
  return { hr: top.maxHr, day: top.day, name: top.name || "", n: list.length, skipped: skipped.map((a) => ({ hr: a.maxHr, day: a.day })) };
}
// Run minutes per week by the zone of each run's average heart rate, as a share of the heart-rate reserve (Karvonen,
// hr.js; % of max without a resting HR): easy Z1–Z2 (< 70 %), Z3 (70–80 %), hard Z4–Z5 (>= 80 %). The watch's own
// time-in-zone is not in its exports, so a run counts whole in its average's zone.
export const ZONE_BANDS = [["easy", 0, 0.7], ["mid", 0.7, 0.8], ["hard", 0.8, 9]];
export function hrZoneWeeks(acts = {}, { maxHR, restHR, until, weeks = 12, includeHikes = false } = {}) {
  if (!maxHR || !until) return { rows: [], last4: null };
  const end = mondayOf(parseLocal(until));
  const keys = Array.from({ length: weeks }, (_, i) => ymd(addDays(end, -7 * (weeks - 1 - i))));
  const rows = keys.map((key) => ({ key, easy: 0, mid: 0, hard: 0, none: 0, n: 0 }));
  const at = Object.fromEntries(rows.map((r) => [r.key, r]));
  for (const a of Object.values(acts)) {
    const k = kind(a.type);
    if (!(k === "run" || (includeHikes && k === "hike")) || a.day > until) continue;
    const r = at[ymd(mondayOf(parseLocal(a.day)))]; if (!r) continue;
    const min = a.min || Math.round((a.km || 0) * 6.5); if (!(min > 0)) continue;
    const pct = a.hr ? hrShare(a.hr, { maxHR, restHR }) : null;
    const z = pct == null ? "none" : ZONE_BANDS.find(([, lo, hi]) => pct >= lo && pct < hi)[0];
    r[z] += min; r.n++;
  }
  for (const r of rows) for (const z of ["easy", "mid", "hard", "none"]) r[z] = Math.round(r[z]);
  // The last four weeks with heart rate (this week included): share of run time per zone.
  const recent = rows.slice(-4); const tot = recent.reduce((s, r) => s + r.easy + r.mid + r.hard, 0);
  const share = (z) => Math.round((recent.reduce((s, r) => s + r[z], 0) / tot) * 100);
  const last4 = tot >= 60 ? { easy: share("easy"), mid: share("mid"), hard: share("hard"), min: tot, unknown: recent.reduce((s, r) => s + r.none, 0) } : null;
  return { rows, last4 };
}

/* Compact, anonymous context for the AI coach: numbers only, no name or e-mail. */
export function coachContext({ p, plan, cur, log, acts = {}, acwrFor, insights, todayStr, maxHR, advice, extra = {} }) {
  const ur = watchSummary(acts, { includeHikes: !!p.includeHikes, todayKey: ymd(mondayOf(parseLocal(todayStr))), weeks: 12 });
  const rows = plan.rows.filter((r) => r.key <= cur.key).slice(-6).map((r) => { const l = log[r.key] || {}; const a = acwrFor(r.key); return { uge: r.i, fase: r.phase, plan_km: r.km, løbet_km: l.km ?? null, højdemeter: l.vert ?? null, rpe: l.rpe ?? null, andre_pas_min: l.xmin ?? null, hvilepuls: l.hr ?? null, søvn_t: l.sleep ?? null, vægt: l.wt ?? null, vo2max: l.vo2 ?? null, hrv: l.hrv ?? null, stress: l.stress ?? null, ...(r.key === cur.key ? { acwr_hidtil: a ? r2(a.v) : null } : { acwr: a ? r2(a.v) : null }), i_gang: r.key === cur.key }; });
  // Where the runner is right now: weekday, km so far, what is left, and the ACWR the way Overblik shows it (the last
  // completed week while this one is young), so the model never reads a half week as a verdict.
  const di = (parseLocal(todayStr).getDay() + 6) % 7;
  const curLog = log[cur.key] || {};
  const done = plan.rows.filter((r) => r.key < cur.key); const lastDone = done[done.length - 1];
  const aNow = acwrFor(cur.key), aLast = lastDone ? acwrFor(lastDone.key) : null;
  const weekYoung = (curLog.km || 0) < (cur.km || 1) * 0.6;
  const byDay = runsByDay(acts, !!p.includeHikes);
  const perDay = [0, 1, 2, 3, 4, 5, 6].map((i) => r1((byDay[ymd(addDays(parseLocal(cur.key), i))] || []).reduce((a, x) => a + x.km, 0)));
  const status_nu = {
    dato: todayStr, ugedag: DAYS[di], dag_i_ugen: di + 1, dage_tilbage_i_ugen: 6 - di, uge: cur.i, fase: cur.phase,
    plan_km: cur.km, løbet_km_hidtil: curLog.km ?? 0, plan_rest_km: r1(Math.max(0, (cur.km || 0) - (curLog.km || 0))), højdemeter_hidtil: curLog.vert ?? 0,
    løbet_pr_dag: perDay, plan_pr_dag: cur.days, andre_pas_min_hidtil: curLog.xmin ?? 0,
    acwr: weekYoung && aLast ? { værdi: r2(aLast.v), grundlag: `sidste hele uge (uge ${lastDone.i}); ugen i gang er for ung til en dom` } : aNow ? { værdi: r2(aNow.v), grundlag: "ugen i gang" } : null,
    acwr_ugen_hidtil: aNow ? r2(aNow.v) : null,
  };
  const daily = restingHRSeries(p.wellness, { days: 28, until: todayStr });
  const hvilepuls_dagligt = daily.rows.length ? { normal_28d: daily.normal, seneste: daily.rows[daily.rows.length - 1], sidste_28_dage: daily.rows.map((r) => [r.day, r.hr]) } : null;
  const hp = { maxHR, restHR: p.restHR };
  const zw = hrZoneWeeks(acts, { ...hp, until: todayStr, weeks: 8, includeHikes: !!p.includeHikes });
  const peak = hrPeak(acts, { until: todayStr });
  const pulszoner = zw.last4 ? {
    grundlag: `${karvonen(hp) ? `pulsreserve (Karvonen): hvilepuls ${hp.restHR}, makspuls ${maxHR}` : `% af makspuls ${maxHR}`}; hvert løb tæller i zonen for sin gennemsnitspuls: rolig under ${hrAt(0.7, hp)}, z3 ${hrAt(0.7, hp)}–${hrAt(0.8, hp)}, hård fra ${hrAt(0.8, hp)}`,
    sidste_4_uger_pct: { rolig: zw.last4.easy, z3: zw.last4.mid, hård: zw.last4.hard },
    pr_uge_min: zw.rows.map((r) => ({ uge_fra: r.key, rolig: r.easy, z3: r.mid, hård: r.hard, uden_puls: r.none })),
  } : null;
  return {
    dato: todayStr,
    status_nu,
    hvilepuls_dagligt,
    pulszoner,
    pulszoner_grænser: maxHR ? { model: karvonen(hp) ? "pulsreserve (Karvonen)" : "% af makspuls", z1: [hrAt(0.5, hp), hrAt(0.6, hp)], z2: [hrAt(0.6, hp), hrAt(0.7, hp)], z3: [hrAt(0.7, hp), hrAt(0.8, hp)], z4: [hrAt(0.8, hp), hrAt(0.9, hp)], z5: [hrAt(0.9, hp), maxHR] } : null,
    makspuls_målt: peak ? { puls: peak.hr, dato: peak.day, sprunget_over_som_fejlmåling: peak.skipped } : null,
    hvilepuls_normal_målt: (() => { const b = restingBaseline({ wellness: p.wellness, log, profileRest: p.restHR, beforeKey: cur.key }); return b && b.source !== "profile" ? { puls: b.normal, kilde: b.source === "garmin" ? "Garmin, 28 dage før ugen" : "ugeloggen, op til 8 uger før" } : null; })(),
    løber: { alder: p.age, køn: p.sex, vægt_kg: p.weight, højde_cm: p.height, hvilepuls: p.restHR, makspuls: maxHR, niveau: p.level, mål: p.goal, krop: p.injury, skadested: p.injuryArea || null, kost: p.diet, tåler_ikke: p.intol || [], familie: p.family, løbedage_max: p.maxRunDays,
      hverdag: (p.sched?.A || []).map((d, i) => `${DAYS[i]}: ${d.avail}${d.time ? " " + d.time : ""}${d.note ? " (" + d.note + ")" : ""}`) },
    løb: { navn: p.raceName, dato: p.raceDate, km: p.raceKm, højdemeter: p.raceVert },
    plan: { trænerplan: !!plan.coach, kilde: plan.coach ? `trænerens egen plan (${plan.weeks} uger med faste datoer fra ${plan.rows[0].key}); tallene er et loft` : `beregnet af appen ud fra spørgeskemaet (${plan.weeks} uger fra ${plan.rows[0].key})`, uge: cur.i, af: plan.weeks, fase: cur.phase, top_km_uge: plan.peak, niveau: p.level, top_skala: p.peakScale || 1, løbedage: p.maxRunDays, lang_tur_dag: p.longDay, nuværende_base_km_uge: p.currentKm, denne_uge: { km: cur.km, dage: cur.days, hård_session: cur.quality, lang_tur_km: cur.lng, fokus: cur.focus, justeret: cur.adjusted ? cur.adjusted.reason : null }, råd_i_appen: advice },
    seneste_uger: rows,
    fra_uret_12_uger: ur,
    historik_fra_uret: watchHistory(acts, { includeHikes: !!p.includeHikes }),
    mønstre: insights.summary,
    fund: insights.findings.map((f) => f.text),
    ...extra,
  };
}
