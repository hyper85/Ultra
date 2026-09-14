import { ymd, parseLocal, addDays, mondayOf, kind } from "./import.js";

/* ================= insights: what the app has learned about the runner =================
   Pure functions over the plan, the weekly log and the activities. Everything here is deterministic and
   explainable: each finding names the numbers it comes from, and every action is a plain profile patch the
   user applies with one tap. Nothing is changed behind the runner's back. */

const DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const r1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

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

export function buildInsights({ plan, log = {}, acts = {}, p = {}, todayKey, maxHR, includeHikes = false }) {
  const byDay = runsByDay(acts, includeHikes);
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

  // Easy runs: heart rate against the easy cap (70 % of max).
  const cap = maxHR ? Math.round(maxHR * 0.7) : null;
  const easyRuns = [];
  for (const r of done) for (const i of [0, 1, 2, 3, 4, 5, 6]) {
    if (i === r.longDay || i === r.qDay) continue;
    for (const a of byDay[ymd(addDays(parseLocal(r.key), i))] || []) if (a.hr && a.km >= 3) easyRuns.push({ ...a, week: r.key });
  }
  const easyAbove = cap && easyRuns.length >= 4 ? easyRuns.filter((a) => a.hr > cap + 3).length / easyRuns.length : null;
  const easyHR = easyRuns.length ? Math.round(mean(easyRuns.map((a) => a.hr))) : null;

  // Aerobic efficiency: speed per heartbeat on easy runs, first half of the window vs the last half.
  const eff = easyRuns.filter((a) => a.min > 0 && a.hr > 0).sort((a, b) => (a.day < b.day ? -1 : 1)).map((a) => (a.km / (a.min / 60)) / a.hr);
  let efficiencyPct = null;
  if (eff.length >= 6) { const h = eff.length >> 1; const a = mean(eff.slice(0, h)), b = mean(eff.slice(-h)); if (a > 0) efficiencyPct = Math.round(((b - a) / a) * 100); }

  // Resting heart rate: the last 3 logged weeks against the runner's normal.
  const hrs = weeks.slice(-3).map((w) => w.hr).filter((x) => x > 0);
  const restHRDelta = hrs.length >= 2 && p.restHR ? r1(mean(hrs) - p.restHR) : null;

  // Runs per week against what the runner said they could do.
  const runsPerWeek = withActs.length ? r1(mean(withActs.map((r) => [0, 1, 2, 3, 4, 5, 6].filter((i) => dayKm(r.key, i) > 0).length))) : null;

  const coach = !!plan.coach;
  const findings = [];
  const add = (id, level, text, action) => findings.push({ id, level, text, ...(action ? { action } : {}) });

  if (n === 0) add("empty", "info", "Appen kender dig ikke endnu. Log dine ture i et par uger, så begynder den at se mønstre: hvilke dage du faktisk løber, om planen passer til dig, og om de rolige ture er rolige nok.");
  if (n >= 3 && tendency === "on") add("on-plan", "good", `Du rammer planen: ${hit} af ${n} uger inden for 85–120 % af det planlagte. Bliv ved – det er sådan ultraform bygges.`);
  if (tendency === "under") add("under", "warn", `Du løber typisk ${Math.round(med * 100)} % af det planlagte (${n} uger). Enten er planen for stor til din hverdag, eller også mangler der dage. En lavere top holder du bedre end en plan, du springer over.`,
    coach ? null : { label: "Sænk toppen 10 %", patch: { peakScale: r1(Math.max(0.6, (p.peakScale || 1) - 0.1)) } });
  if (tendency === "over") add("over", "warn", `Du løber typisk ${Math.round(med * 100)} % af det planlagte (${n} uger). Planens tal er et loft. Er ACWR grøn uge efter uge, kan toppen hæves lidt – ellers er det her, skader kommer fra.`,
    coach || (p.peakScale || 1) >= 1.3 ? null : { label: "Hæv toppen 10 %", patch: { peakScale: r1((p.peakScale || 1) + 0.1) } });
  if (skipped) {
    const to = usedFree && usedFree.i !== skipped.i ? usedFree : null;
    const fromAvail = p.sched?.A?.[skipped.i]?.avail || "normal";
    add("skipped-day", "info", `${DAYS[skipped.i].charAt(0).toUpperCase() + DAYS[skipped.i].slice(1)} bliver sprunget over: du løb ${skipped.ranPlanned} af ${skipped.planned} planlagte gange.${to ? ` Til gengæld løber du tit ${DAYS[to.i]} (${to.ranFree} af ${to.free} uger), selv om der ikke stod noget.` : ""}${coach ? " Sig det til din træner – i trænerplanen ligger dagene fast." : ""}`,
      coach ? null : to ? { label: `Flyt løb fra ${DAYS[skipped.i]} til ${DAYS[to.i]}`, patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === skipped.i ? { ...d, avail: "none" } : j === to.i ? { ...d, avail: d.avail === "none" ? fromAvail : d.avail } : d)) } } }
        : { label: `Slå ${DAYS[skipped.i]} fra`, patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === skipped.i ? { ...d, avail: "none" } : d)) } } });
  } else if (usedFree && !coach) {
    add("free-day", "info", `Du løber tit ${DAYS[usedFree.i]} (${usedFree.ranFree} af ${usedFree.free} uger), selv om dagen står som fri. Giv den tid i planen, så bruger den dagen rigtigt.`,
      { label: `Åbn ${DAYS[usedFree.i]} i planen`, patch: { sched: { ...(p.sched || {}), A: (p.sched?.A || []).map((d, j) => (j === usedFree.i ? { ...d, avail: "normal" } : d)) } } });
  }
  if (longRate != null && longRate < 0.5) add("long-short", "warn", `Den lange tur bliver kortere end planlagt i ${longWeeks.length - longDone} af ${longWeeks.length} uger. Det er den vigtigste tur i ultratræning. Kortere hverdagsture og en hel lang tur slår det modsatte.`);
  if (longRate != null && longRate >= 0.8 && n >= 4) add("long-ok", "good", `Den lange tur bliver gennemført ${longDone} af ${longWeeks.length} gange. Det er dér, ultraformen kommer fra.`);
  if (easyAbove != null && easyAbove >= 0.5) add("easy-hard", "warn", `${Math.round(easyAbove * 100)} % af dine rolige ture ligger over pulsloftet på ${cap} (snit ${easyHR}). Rolige ture skal føles for langsomme – ellers er du for træt til de hårde.`);
  if (easyAbove != null && easyAbove < 0.25) add("easy-ok", "good", `Dine rolige ture er rolige (snit puls ${easyHR}, loft ${cap}). Det er den svære disciplin, og du har den.`);
  if (efficiencyPct != null && efficiencyPct >= 3) add("fitter", "good", `Formen stiger: ${efficiencyPct} % mere fart ved samme puls på de rolige ture sammenlignet med starten.`);
  if (efficiencyPct != null && efficiencyPct <= -5) add("slower", "info", `${Math.abs(efficiencyPct)} % mindre fart ved samme puls end i starten. Varme, søvn eller for meget belastning? Hold igen en uge og se, om det retter sig.`);
  if (restHRDelta != null && restHRDelta >= 5) add("resthr-high", "warn", `Hvilepulsen har ligget ${restHRDelta} slag over din normal de sidste uger. Kroppen beder om søvn og mad før den beder om km.`);
  if (restHRDelta != null && restHRDelta <= -3) add("resthr-low", "good", `Hvilepulsen er faldet ${Math.abs(restHRDelta)} slag under din normal. Konditionen stiger.`,
    { label: `Sæt normal hvilepuls til ${Math.round(p.restHR + restHRDelta)}`, patch: { restHR: Math.round(p.restHR + restHRDelta) } });
  if (runsPerWeek != null && p.maxRunDays && runsPerWeek <= p.maxRunDays - 1.5 && withActs.length >= 4) add("fewer-days", "info", `Du løber i snit ${runsPerWeek} dage om ugen, men planen regner med ${p.maxRunDays}. Færre, lidt længere ture passer måske bedre til dit liv.`,
    coach ? null : { label: `Sæt løbedage til ${Math.max(2, Math.round(runsPerWeek))}`, patch: { maxRunDays: Math.max(2, Math.round(runsPerWeek)) } });
  if (streak >= 4) add("streak", "good", `${streak} uger i træk med logget træning. Kontinuitet slår alt.`);

  const order = { warn: 0, info: 1, good: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const summary = { weeksLogged: n, hitRate: n ? r1(hit / n) : null, medianRatio: med != null ? r1(med) : null, tendency, streak, runsPerWeek, longRunRate: longRate != null ? r1(longRate) : null, easyAboveCap: easyAbove != null ? r1(easyAbove) : null, easyHR, easyCap: cap, efficiencyPct, restHRDelta,
    skippedDay: skipped ? DAYS[skipped.i] : null, extraDay: usedFree ? DAYS[usedFree.i] : null };
  return { summary, findings, weeks };
}

/* Compact, anonymous context for the AI coach: numbers only, no name or e-mail. */
export function coachContext({ p, plan, cur, log, acwrFor, insights, todayStr, maxHR, advice }) {
  const rows = plan.rows.filter((r) => r.key <= cur.key).slice(-6).map((r) => { const l = log[r.key] || {}; const a = acwrFor(r.key); return { uge: r.i, fase: r.phase, plan_km: r.km, løbet_km: l.km ?? null, rpe: l.rpe ?? null, hvilepuls: l.hr ?? null, acwr: a ? r1(a.v) : null, i_gang: r.key === cur.key }; });
  return {
    dato: todayStr,
    løber: { alder: p.age, køn: p.sex, vægt_kg: p.weight, højde_cm: p.height, hvilepuls: p.restHR, makspuls: maxHR, niveau: p.level, mål: p.goal, krop: p.injury, skadested: p.injuryArea || null, kost: p.diet, tåler_ikke: p.intol || [], familie: p.family, løbedage_max: p.maxRunDays,
      hverdag: (p.sched?.A || []).map((d, i) => `${DAYS[i]}: ${d.avail}${d.time ? " " + d.time : ""}${d.note ? " (" + d.note + ")" : ""}`) },
    løb: { navn: p.raceName, dato: p.raceDate, km: p.raceKm, højdemeter: p.raceVert },
    plan: { trænerplan: !!plan.coach, uge: cur.i, af: plan.weeks, fase: cur.phase, top_km_uge: plan.peak, denne_uge: { km: cur.km, dage: cur.days, hård_session: cur.quality, lang_tur_km: cur.lng, fokus: cur.focus, justeret: cur.adjusted ? cur.adjusted.reason : null }, råd_i_appen: advice },
    seneste_uger: rows,
    mønstre: insights.summary,
    fund: insights.findings.map((f) => f.text),
  };
}
