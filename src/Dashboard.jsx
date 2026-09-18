import { ymd, parseLocal, addDays, kind } from "./import.js";
import { watchHistory } from "./insights.js";

/* Overblik: the runner's numbers on one screen. Stat tiles first (what matters now), then the pictures: weekly km
   against the plan, load and ACWR over time, months from the watch, and sleep / resting heart rate when the log has
   them. Inline SVG, one accent for "you", muted for the plan, the app's green/amber/red for the ACWR states. */

const r1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const acwrClass = (v) => (v == null ? "" : v > 1.5 ? "bad" : v > 1.3 ? "warn" : v >= 0.8 ? "good" : "low");

/* Grouped bars: plan (muted) and ran (accent) per week. */
function Bars({ rows, height = 150, cur }) {
  const W = 640, H = height, padL = 30, padB = 22, padT = 8;
  const max = Math.max(10, ...rows.flatMap((r) => [r.plan || 0, r.ran || 0]));
  const iw = (W - padL) / rows.length, bw = Math.max(3, iw * 0.34);
  const y = (v) => padT + (H - padB - padT) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Km pr. uge, plan og løbet">
      {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text></g>)}
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
      {[lo + pad, hi - pad].map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{format(r1(t))}</text></g>)}
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
  const shown = upTo.slice(-16).map((r) => ({ key: r.key, label: `U${r.i}`, plan: r.km, ran: log[r.key]?.km || 0, deload: r.deload, acwr: acwrFor(r.key)?.v ?? null }));
  const done = upTo.filter((r) => r.key < cur.key);
  const last4 = done.slice(-4).map((r) => log[r.key]?.km).filter((v) => v > 0);
  const d28 = ymd(addDays(parseLocal(todayKey), -28));
  const recent = runs.filter((a) => a.day >= d28);
  const longest = recent.length ? r1(Math.max(...recent.map((a) => a.km))) : null;
  const acwr = acwrFor(cur.key);
  const planKmToDate = done.reduce((s, r) => s + r.km, 0), ranToDate = done.reduce((s, r) => s + (log[r.key]?.km || 0), 0);
  const hit = done.filter((r) => r.km > 0 && (log[r.key]?.km || 0) >= r.km * 0.85 && (log[r.key]?.km || 0) <= r.km * 1.2).length;
  const series = (field, weeks = 12) => plan.rows.filter((r) => r.key <= cur.key).slice(-weeks).map((r) => ({ key: r.key, label: `U${r.i}`, v: log[r.key]?.[field] != null && log[r.key]?.[field] !== "" ? +log[r.key][field] : null }));
  const sleep = series("sleep"), hr = series("hr"), wt = series("wt"), vo2 = series("vo2");
  const latest = (rows) => [...rows].reverse().find((r) => r.v != null)?.v ?? null;
  const avg = (rows) => { const v = rows.map((r) => r.v).filter((x) => x != null); return v.length ? r1(mean(v)) : null; };
  const hist = watchHistory(acts, { includeHikes, months: 12 });
  const monthly = hist.måneder.map((m) => ({ key: m.måned, label: m.måned.slice(5) + "/" + m.måned.slice(2, 4), plan: 0, ran: m.km }));
  const loadRows = shown.map((r) => ({ key: r.key, label: r.label, v: r.acwr, cls: acwrClass(r.acwr) }));
  const pct = cur.km ? Math.min(999, Math.round(((curLog.km || 0) / cur.km) * 100)) : null;
  return (
    <section className="stack dash">
      <div className="row-between"><h1 className="screen-title" style={{ margin: 0 }}>Overblik</h1>{onShare && <button type="button" className="btn ghost" onClick={onShare}>Del ugen</button>}</div>
      {shareMsg && <div className="advice">{shareMsg}</div>}
      <div className="tiles">
        <Tile label="Streak" value={streak} unit={streak === 1 ? " uge" : " uger"} sub={streak >= 4 ? "i træk med træning. Kontinuitet slår alt." : streak > 0 ? "i træk med logget træning" : "log noget i denne uge for at starte"} cls={streak >= 4 ? "good" : ""} />
        <Tile label="Denne uge" value={curLog.km || 0} unit={` / ${cur.km} km`} sub={pct != null ? `${pct} % af planen · uge ${cur.i} af ${plan.weeks}` : `uge ${cur.i} af ${plan.weeks}`} />
        <Tile label="Snit sidste 4 uger" value={last4.length ? Math.round(mean(last4)) : "–"} unit=" km/uge" sub={last4.length ? `${last4.length} uger med data` : "log en uge først"} />
        <Tile label="ACWR nu" value={acwr ? r1(acwr.v).toFixed(2) : "–"} sub={acwr ? (acwr.v > 1.5 ? "Rødt: skær ned, ingen hårde pas" : acwr.v > 1.3 ? "Gult: hold igen" : acwr.v >= 0.8 ? "Grønt: belastningen passer" : "Lavt: der er plads") + (acwr.est ? " · estimat" : "") : "kommer, når ugen har km og RPE"} cls={acwrClass(acwr?.v)} />
        <Tile label="Længste tur, 4 uger" value={longest ?? "–"} unit=" km" sub={recent.length ? `${recent.length} ture · ${r1(recent.length / 4)} pr. uge` : "ingen ture i loggen"} />
        <Tile label="Andre pas denne uge" value={curLog.xn || 0} sub={curLog.xmin ? `${curLog.xmin} min · styrke/HIIT/andet` : liftDays.length ? `${liftDays.length} styrkepas i planen` : "ingen"} />
        <Tile label="Planen indtil nu" value={done.length ? `${Math.round((ranToDate / Math.max(1, planKmToDate)) * 100)} %` : "–"} sub={done.length ? `${Math.round(ranToDate)} af ${Math.round(planKmToDate)} km · ${hit} af ${done.length} uger ramt` : "første uge er i gang"} />
        {avg(sleep) != null && <Tile label="Søvn, snit 12 uger" value={avg(sleep)} unit=" t" sub={latest(sleep) != null ? `seneste uge ${latest(sleep)} t` : ""} cls={avg(sleep) < 6.5 ? "warn" : ""} />}
        {latest(hr) != null && <Tile label="Hvilepuls" value={latest(hr)} sub={avg(hr) != null ? `snit ${avg(hr)}${latest(hr) - avg(hr) >= 5 ? " · høj: sov og skær ned" : ""}` : ""} cls={avg(hr) != null && latest(hr) - avg(hr) >= 5 ? "bad" : ""} />}
        {fitness && <Tile label="Form for din alder" value={`${fitness.percentile} %`} sub={`bedre end ca. ${fitness.percentile} % · ${fitness.category.toLowerCase()}`} cls={fitness.percentile >= 70 ? "good" : fitness.percentile >= 30 ? "" : "warn"} />}
        {fitness && <Tile label="Fitnessalder" value={fitness.fitnessAge} unit=" år" sub={fitness.ageDiff > 0 ? `${fitness.ageDiff} år yngre end dit pas` : fitness.ageDiff < 0 ? `${-fitness.ageDiff} år ældre end dit pas` : "som din alder"} cls={fitness.ageDiff >= 5 ? "good" : fitness.ageDiff <= -5 ? "warn" : ""} />}
        {latest(vo2) != null && !fitness?.measured && <Tile label="VO2 max" value={latest(vo2)} sub="fra dit ur" />}
        {latest(wt) != null && <Tile label="Vægt" value={latest(wt)} unit=" kg" sub={p.weight ? `profil ${p.weight} kg` : ""} />}
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="row-between"><h2 style={{ margin: 0 }}>Km pr. uge</h2><span className="muted"><i className="sw plan" /> plan <i className="sw ran" /> løbet</span></div>
          {shown.length ? <Bars rows={shown} cur={cur.key} /> : <p className="muted">Planen er ikke begyndt endnu.</p>}
          <p className="muted">Prikken markerer en let uge. Planens tal er et loft: en uge under er fint, en uge langt over er et signal.</p>
        </div>
        <div className="panel">
          <div className="row-between"><h2 style={{ margin: 0 }}>ACWR</h2><span className="muted">grønt bånd 0,8–1,3</span></div>
          {loadRows.filter((r) => r.v != null).length >= 2 ? <Line rows={loadRows} band={[0.8, 1.3]} color="acwr" format={(v) => v.toFixed(1)} cur={cur.key} /> : <p className="muted">ACWR tegnes, når mindst to uger har km og RPE.</p>}
          <p className="muted">Denne uges belastning delt med snittet af de fire før. Over 1,5 er rødt: næste uge højst 75 % og ingen hårde pas.</p>
        </div>
        {monthly.length >= 2 && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>Måned for måned</h2><span className="muted">{hist.km_i_alt} km i alt · længste {hist.længste_tur_nogensinde_km} km</span></div>
            <Bars rows={monthly} height={130} />
            <p className="muted">Fra dit ur siden {hist.første_aktivitet ? parseLocal(hist.første_aktivitet).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : "starten"}. Bedste måned: {hist.bedste_måned ? `${hist.bedste_måned.km} km` : "–"}.</p>
          </div>
        )}
        {sleep.filter((r) => r.v != null).length >= 3 && (
          <div className="panel">
            <h2 style={{ margin: 0 }}>Søvn, timer pr. nat</h2>
            <Line rows={sleep} band={[7, 9]} color="sleep" cur={cur.key} />
            <p className="muted">Båndet er 7–9 timer. Under 6,5 i snit koster restitution, og trænerrådet skærer ned.</p>
          </div>
        )}
        {hr.filter((r) => r.v != null).length >= 3 && (
          <div className="panel">
            <h2 style={{ margin: 0 }}>Hvilepuls</h2>
            <Line rows={hr} color="hr" cur={cur.key} />
            <p className="muted">7 slag over din normale er et stopsignal: sov, og skær 30–50 % af ugen.</p>
          </div>
        )}
        {fitness && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>Din form i forhold til andre</h2><span className="muted">VO2 max {fitness.vo2}{fitness.measured ? "" : " (anslået)"}</span></div>
            <div className="scale">
              {["Meget lav", "Lav", "Middel", "God", "Fremragende", "Elite"].map((c, i) => <div key={c} className={`scale-seg ${fitness.category === c ? "on" : ""}`}><small>{c}</small></div>)}
              <i className="scale-pin" style={{ left: `${fitness.percentile}%` }} title={`${fitness.percentile} %`} />
            </div>
            <p className="muted">Din kondition ligger i gruppen <b>{fitness.category.toLowerCase()}</b> for {fitness.sexUsed === "f" ? "kvinder" : "mænd"} på {p.age || "din"} år: bedre end cirka {fitness.percentile} % af dem. Det svarer til en gennemsnitlig {fitness.fitnessAge}-årig, altså en fitnessalder på {fitness.fitnessAge} år. {fitness.note} Normerne er Cooper Institutes tabeller, og tallet er et estimat, ikke en dom: det flytter sig med rolige kilometer og søvn.</p>
          </div>
        )}
        {insights?.findings?.length > 0 && (
          <div className="panel">
            <div className="row-between"><h2 style={{ margin: 0 }}>Mønstre</h2><button type="button" className="linkbtn" onClick={() => onGo?.("coach")}>Træneren ›</button></div>
            <div className="findings">{insights.findings.slice(0, 4).map((f) => <div key={f.id} className={`finding ${f.level || ""}`}><span>{f.text}</span></div>)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
