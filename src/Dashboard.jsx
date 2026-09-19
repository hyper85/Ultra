import { ymd, parseLocal, addDays, kind } from "./import.js";
import { watchHistory } from "./insights.js";
import { t, tn, locale } from "./i18n.js";

/* Overblik: the runner's numbers on one screen. Stat tiles first (what matters now), then the pictures: weekly km
   against the plan, load and ACWR over time, months from the watch, and sleep / resting heart rate when the log has
   them. Inline SVG, one accent for "you", muted for the plan, the app's green/amber/red for the ACWR states. */

const r1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const acwrClass = (v) => (v == null ? "" : v > 1.5 ? "bad" : v > 1.3 ? "warn" : v >= 0.8 ? "good" : "low");
// The fitness categories as the engine names them (Danish); shown through t().
const CATS = ["Meget lav", "Lav", "Middel", "God", "Fremragende", "Elite"];

/* Grouped bars: plan (muted) and ran (accent) per week. */
function Bars({ rows, height = 150, cur }) {
  const W = 640, H = height, padL = 30, padB = 22, padT = 8;
  const max = Math.max(10, ...rows.flatMap((r) => [r.plan || 0, r.ran || 0]));
  const iw = (W - padL) / rows.length, bw = Math.max(3, iw * 0.34);
  const y = (v) => padT + (H - padB - padT) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Km pr. uge, plan og løbet")}>
      {ticks.map((v) => <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={padL - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text></g>)}
      {rows.map((r, i) => {
        const x = padL + i * iw + (iw - 2 * bw - 2) / 2;
        return (
          <g key={r.key}>
            {r.plan > 0 && <rect x={x} y={y(r.plan)} width={bw} height={H - padB - y(r.plan)} className="bar plan" />}
            {r.ran > 0 && <rect x={x + bw + 2} y={y(r.ran)} width={bw} height={H - padB - y(r.ran)} className={`bar ran ${r.key === cur ? "cur" : ""}`} />}
            {(i % Math.ceil(rows.length / 8) === 0 || r.key === cur) && <text x={x + bw + 1} y={H - 6} className={`tick ${r.key === cur ? "cur" : ""}`} textAnchor="middle">{r.label}</text>}
            {r.deload && <circle cx={x + bw + 1} cy={H - padB + 4} r={2} className="dot" />}
          </g>
        );
      })}
    </svg>
  );
}

/* A line with an optional good band. */
function Line({ rows, height = 130, band, color = "accent", format = (v) => v, cur }) {
  const W = 640, H = height, padL = 34, padB = 22, padT = 8;
  const vals = rows.map((r) => r.v).filter((v) => v != null);
  if (vals.length < 2) return null;
  let lo = Math.min(...vals, band ? band[0] : Infinity), hi = Math.max(...vals, band ? band[1] : -Infinity);
  if (hi - lo < 0.2) { lo -= 0.2; hi += 0.2; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const iw = (W - padL) / rows.length;
  const x = (i) => padL + i * iw + iw / 2, y = (v) => padT + (H - padB - padT) * (1 - (v - lo) / (hi - lo));
  const pts = rows.map((r, i) => (r.v == null ? null : `${x(i)},${y(r.v)}`));
  const d = pts.reduce((acc, p, i) => (p == null ? acc : acc + (acc && pts[i - 1] != null ? " L" : " M") + p), "");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {band && <rect x={padL} y={y(band[1])} width={W - padL} height={y(band[0]) - y(band[1])} className="band" />}
      {[lo + pad, hi - pad].map((v) => <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={padL - 6} y={y(v) + 4} className="tick" textAnchor="end">{format(r1(v))}</text></g>)}
      <path d={d.trim()} className={`line ${color}`} />
      {rows.map((r, i) => r.v != null && <circle key={r.key} cx={x(i)} cy={y(r.v)} r={r.key === cur ? 4 : 2.5} className={`pt ${color} ${r.cls || ""} ${r.key === cur ? "cur" : ""}`} />)}
      {rows.map((r, i) => (i % Math.ceil(rows.length / 8) === 0 || r.key === cur) && <text key={"t" + r.key} x={x(i)} y={H - 6} className={`tick ${r.key === cur ? "cur" : ""}`} textAnchor="middle">{r.label}</text>)}
    </svg>
  );
}

const Tile = ({ label, value, unit, sub, cls = "" }) => (
  <div className={`tile ${cls}`}><small>{label}</small><b>{value}{unit && <span>{unit}</span>}</b>{sub && <small className="sub">{sub}</small>}</div>
);

export default function Dashboard({ plan, cur, log, acts, p, acwrFor, insights, liftDays = [], todayKey, includeHikes, fitness, streak = 0, onShare, shareMsg, onGo }) {
  const counted = (a) => { const k = kind(a.type); return k === "run" || (includeHikes && k === "hike"); };
  const runs = Object.values(acts).filter(counted);
  const curLog = log[cur.key] || {};
  const upTo = plan.rows.filter((r) => r.key <= cur.key);
  const weekLabel = (r) => t("U{i}", { i: r.i });
  const shown = upTo.slice(-16).map((r) => ({ key: r.key, label: weekLabel(r), plan: r.km, ran: log[r.key]?.km || 0, deload: r.deload, acwr: acwrFor(r.key)?.v ?? null }));
  const done = upTo.filter((r) => r.key < cur.key);
  const last4 = done.slice(-4).map((r) => log[r.key]?.km).filter((v) => v > 0);
  const d28 = ymd(addDays(parseLocal(todayKey), -28));
  const recent = runs.filter((a) => a.day >= d28);
  const longest = recent.length ? r1(Math.max(...recent.map((a) => a.km))) : null;
  const acwr = acwrFor(cur.key);
  const planKmToDate = done.reduce((s, r) => s + r.km, 0), ranToDate = done.reduce((s, r) => s + (log[r.key]?.km || 0), 0);
  const rated = done.filter((r) => r.km > 0);
  const hit = rated.filter((r) => (log[r.key]?.km || 0) >= r.km * 0.85 && (log[r.key]?.km || 0) <= r.km * 1.2).length;
  const over = rated.filter((r) => (log[r.key]?.km || 0) > r.km * 1.2).length, under = rated.length - hit - over;
  // ACWR is judged on completed weeks; the week in progress is provisional until most of it is run.
  const lastDone = done[done.length - 1];
  const acwrLast = lastDone ? acwrFor(lastDone.key) : null;
  const weekYoung = (curLog.km || 0) < (cur.km || 1) * 0.6;
  const series = (field, weeks = 12) => plan.rows.filter((r) => r.key <= cur.key).slice(-weeks).map((r) => ({ key: r.key, label: weekLabel(r), v: log[r.key]?.[field] != null && log[r.key]?.[field] !== "" ? +log[r.key][field] : null }));
  const sleep = series("sleep"), hr = series("hr"), wt = series("wt"), vo2 = series("vo2");
  const latest = (rows) => [...rows].reverse().find((r) => r.v != null)?.v ?? null;
  const avg = (rows) => { const v = rows.map((r) => r.v).filter((x) => x != null); return v.length ? r1(mean(v)) : null; };
  const hist = watchHistory(acts, { includeHikes, months: 12 });
  const monthly = hist.måneder.map((m) => ({ key: m.måned, label: m.måned.slice(5) + "/" + m.måned.slice(2, 4), plan: 0, ran: m.km }));
  const loadRows = shown.map((r) => ({ key: r.key, label: r.label, v: r.acwr, cls: acwrClass(r.acwr) }));
  const pct = cur.km ? Math.min(999, Math.round(((curLog.km || 0) / cur.km) * 100)) : null;
  const est = fitness?.measured ? "" : ` ${t("(anslået)")}`;
  const category = fitness ? t(fitness.category) : "";
  return (
    <section className="stack dash">
      <div className="row-between"><h1 className="screen-title" style={{ margin: 0 }}>{t("Overblik")}</h1>{onShare && <button type="button" className="btn ghost" onClick={onShare}>{t("Del ugen")}</button>}</div>
      {shareMsg && <div className="advice">{shareMsg}</div>}
      <div className="tiles">
        <Tile label={t("Streak")} value={streak} unit={` ${tn(streak, "uge", "uger")}`} sub={streak >= 4 ? t("i træk med træning. Kontinuitet slår alt.") : streak > 0 ? t("i træk med logget træning") : t("log noget i denne uge for at starte")} cls={streak >= 4 ? "good" : ""} />
        <Tile label={t("Denne uge")} value={curLog.km || 0} unit={` / ${cur.km} km`} sub={pct != null ? t("{pct} % af planen · uge {i} af {n}", { pct, i: cur.i, n: plan.weeks }) : t("uge {i} af {n}", { i: cur.i, n: plan.weeks })} />
        <Tile label={t("Snit sidste 4 uger")} value={last4.length ? Math.round(mean(last4)) : "–"} unit={` ${t("km/uge")}`} sub={last4.length ? tn(last4.length, "1 uge med data", "{n} uger med data") : t("log en uge først")} />
        {(() => { const a = weekYoung && acwrLast ? acwrLast : acwr; const label = weekYoung && acwrLast ? t("ACWR, uge {i}", { i: lastDone.i }) : t("ACWR nu"); const verdict = a ? (a.v > 1.5 ? t("Rødt: skær ned, ingen hårde pas") : a.v > 1.3 ? t("Gult: hold igen") : a.v >= 0.8 ? t("Grønt: belastningen passer") : t("Lavt: der er plads")) + (a.est ? ` · ${t("estimat")}` : "") : t("kommer, når ugen har km og RPE"); return (
          <Tile label={label} value={a ? r1(a.v).toFixed(2) : "–"} sub={weekYoung && acwrLast ? `${verdict} · ${t("denne uge er i gang")}${acwr ? ` (${t("{v} indtil nu", { v: r1(acwr.v).toFixed(2) })})` : ""}` : verdict} cls={acwrClass(a?.v)} />); })()}
        <Tile label={t("Længste tur, 4 uger")} value={longest ?? "–"} unit=" km" sub={recent.length ? tn(recent.length, "1 tur · {per} pr. uge", "{n} ture · {per} pr. uge", { per: r1(recent.length / 4) }) : t("ingen ture i loggen")} />
        <Tile label={t("Andre pas denne uge")} value={curLog.xn || 0} sub={curLog.xmin ? t("{min} min · styrke/HIIT/andet", { min: curLog.xmin }) : liftDays.length ? tn(liftDays.length, "1 styrkepas i planen", "{n} styrkepas i planen") : t("ingen")} />
        <Tile label={t("Planen indtil nu")} value={done.length ? `${Math.round((ranToDate / Math.max(1, planKmToDate)) * 100)} %` : "–"} sub={done.length ? t("{ran} af {plan} km i alt · uge for uge: {hit} på planen", { ran: Math.round(ranToDate), plan: Math.round(planKmToDate), hit }) + (over ? t(", {n} over", { n: over }) : "") + (under ? t(", {n} under", { n: under }) : "") : t("første uge er i gang")} cls={rated.length && hit === 0 && over > 0 ? "warn" : ""} />
        {avg(sleep) != null && <Tile label={t("Søvn, snit 12 uger")} value={avg(sleep)} unit={t(" t")} sub={latest(sleep) != null ? t("seneste uge {n} t", { n: latest(sleep) }) : ""} cls={avg(sleep) < 6.5 ? "warn" : ""} />}
        {latest(hr) != null && <Tile label={t("Hvilepuls")} value={latest(hr)} sub={avg(hr) != null ? t("snit {n}", { n: avg(hr) }) + (latest(hr) - avg(hr) >= 5 ? ` · ${t("høj: sov og skær ned")}` : "") : ""} cls={avg(hr) != null && latest(hr) - avg(hr) >= 5 ? "bad" : ""} />}
        {fitness && <Tile label={t("Form for din alder")} value={`${fitness.percentile} %`} sub={t("bedre end ca. {pct} % · {cat}", { pct: fitness.percentile, cat: category.toLowerCase() })} cls={fitness.percentile >= 70 ? "good" : fitness.percentile >= 30 ? "" : "warn"} />}
        {fitness && <Tile label={t("Fitnessalder")} value={fitness.fitnessAge} unit={` ${t("år")}`} sub={t("VO2 max {vo2}{est} · som en gennemsnitlig {age}-årig", { vo2: fitness.vo2, est, age: fitness.fitnessAge })} cls={fitness.ageDiff >= 5 ? "good" : fitness.ageDiff <= -5 ? "warn" : ""} />}
        {latest(vo2) != null && !fitness?.measured && <Tile label="VO2 max" value={latest(vo2)} sub={t("fra dit ur")} />}
        {latest(wt) != null && <Tile label={t("Vægt")} value={latest(wt)} unit=" kg" sub={p.weight ? t("profil {kg} kg", { kg: p.weight }) : ""} />}
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="row-between"><h2 style={{ margin: 0 }}>{t("Km pr. uge")}</h2><span className="muted"><i className="sw plan" /> {t("plan")} <i className="sw ran" /> {t("løbet")}</span></div>
          {shown.length ? <Bars rows={shown} cur={cur.key} /> : <p className="muted">{t("Planen er ikke begyndt endnu.")}</p>}
          <p className="muted">{t("Prikken markerer en let uge. Planens tal er et loft: en uge under er fint, en uge langt over er et signal.")}</p>
        </div>
        <div className="panel">
          <div className="row-between"><h2 style={{ margin: 0 }}>ACWR</h2><span className="muted">{t("grønt bånd 0,8–1,3")}</span></div>
          {loadRows.filter((r) => r.v != null).length >= 2 ? <Line rows={loadRows} band={[0.8, 1.3]} color="acwr" format={(v) => v.toFixed(1)} cur={cur.key} /> : <p className="muted">{t("ACWR tegnes, når mindst to uger har km og RPE.")}</p>}
          <p className="muted">{t("Denne uges belastning delt med snittet af de fire før. Over 1,5 er rødt: næste uge højst 75 % og ingen hårde pas.")}</p>
        </div>
        {monthly.length >= 2 && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>{t("Måned for måned")}</h2><span className="muted">{t("{total} km i alt · længste {longest} km", { total: hist.km_i_alt, longest: hist.længste_tur_nogensinde_km })}</span></div>
            <Bars rows={monthly} height={130} />
            <p className="muted">{t("Fra dit ur siden {since}. Bedste måned: {best}.", { since: hist.første_aktivitet ? parseLocal(hist.første_aktivitet).toLocaleDateString(locale(), { month: "long", year: "numeric" }) : t("starten"), best: hist.bedste_måned ? `${hist.bedste_måned.km} km` : "–" })}</p>
          </div>
        )}
        {sleep.filter((r) => r.v != null).length >= 3 && (
          <div className="panel">
            <h2 style={{ margin: 0 }}>{t("Søvn, timer pr. nat")}</h2>
            <Line rows={sleep} band={[7, 9]} color="sleep" cur={cur.key} />
            <p className="muted">{t("Båndet er 7–9 timer. Under 6,5 i snit koster restitution, og trænerrådet skærer ned.")}</p>
          </div>
        )}
        {hr.filter((r) => r.v != null).length >= 3 && (
          <div className="panel">
            <h2 style={{ margin: 0 }}>{t("Hvilepuls")}</h2>
            <Line rows={hr} color="hr" cur={cur.key} />
            <p className="muted">{t("7 slag over din normale er et stopsignal: sov, og skær 30–50 % af ugen.")}</p>
          </div>
        )}
        {fitness && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>{t("Din form i forhold til andre")}</h2><span className="muted">VO2 max {fitness.vo2}{est}</span></div>
            <div className="scale">
              {CATS.map((c) => <div key={c} className={`scale-seg ${fitness.category === c || fitness.category === t(c) ? "on" : ""}`}><small>{t(c)}</small></div>)}
              <i className="scale-pin" style={{ left: `${fitness.percentile}%` }} title={`${fitness.percentile} %`} />
            </div>
            <p className="muted">{t("Din kondition ligger i gruppen")} <b>{category.toLowerCase()}</b> {t("for {sex} på {age} år: bedre end cirka {pct} % af dem. Fitnessalderen er den alder, hvor en gennemsnitsperson i befolkningen har samme VO2 max som dig{floor}. Det er befolkningen generelt, ikke andre løbere: blandt trænede løbere på din alder er {vo2} et almindeligt godt tal.", { sex: fitness.sexUsed === "f" ? t("kvinder") : t("mænd"), age: p.age || t("din"), pct: fitness.percentile, floor: fitness.fitnessAge <= 20 ? t(", og din ligger over gennemsnittet for 20-årige, så den kan ikke blive lavere") : "", vo2: fitness.vo2 })} {fitness.note} {t("Normerne er Cooper Institutes tabeller, og tallet er et estimat, ikke en dom: det flytter sig med rolige kilometer og søvn.")}</p>
          </div>
        )}
        {insights?.findings?.length > 0 && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>{t("Mønstre")}</h2><button type="button" className="linkbtn" onClick={() => onGo?.("coach")}>{t("Træneren ›")}</button></div>
            <div className="findings">{insights.findings.slice(0, 4).map((f) => <div key={f.id} className={`finding ${f.level || ""}`}><span>{f.text}</span></div>)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
