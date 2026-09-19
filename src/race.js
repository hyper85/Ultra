/* Race day: a pacing table, a fuelling plan and a kit list, computed from the race (km, vert, date, goal time) and
   the runner (easy pace from the log, experience). Everything here is an estimate and is labelled as one; the
   goal time the runner types always wins over the prediction. */
import { t } from "./i18n.js";

// "12:30", "1:05:00" or "12h30" -> minutes; null when it is not a time.
export const parseTime = (s) => {
  if (!s) return null;
  const m = /^\s*(\d{1,2})\s*[:h.]\s*(\d{1,2})(?:\s*[:m]\s*(\d{1,2}))?\s*$/i.exec(String(s));
  if (!m) return null;
  const min = +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 60 : 0);
  return min > 0 && +m[2] < 60 ? min : null;
};
export const fmtTime = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return m === 60 ? `${h + 1}:00` : `${h}:${String(m).padStart(2, "0")}`; };
export const fmtPace = (minKm) => { const m = Math.floor(minKm), s = Math.round((minKm - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`; };
export const paceToMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] + +m[2] / 60 : null; };

const LEVEL_PACE = { 1: 7.0, 2: 6.25, 3: 5.75, 4: 5.25 }; // easy pace when the log has none yet, min/km

/* Predicted finish in minutes. Climb counts as distance (100 m ≈ 0.8 km of effort), and pace drifts with the
   distance: about +8 % per doubling past a half marathon, less for experienced runners. */
export const predictFinish = ({ km, vert = 0, easyPaceMinKm, level = 2 }) => {
  const pace = easyPaceMinKm || LEVEL_PACE[level] || 6.25;
  const effortKm = km + vert / 125;
  const drift = 1 + (level >= 3 ? 0.06 : 0.08) * Math.max(0, Math.log2(Math.max(1, km / 21)));
  return Math.round(effortKm * pace * drift);
};

/* Splits: checkpoints every 5/10/20 km with a controlled start and a small planned fade (ultras are run by
   effort, and the last third is always slower). Cumulative time, pace and fuel by then. */
export function splits({ km, totalMin, vert = 0, carbsPerHour, mlPerHour }) {
  const step = km <= 30 ? 5 : km <= 120 ? 10 : 20;
  const marks = []; for (let x = step; x < km; x += step) marks.push(x); marks.push(km);
  const n = marks.length;
  const w = marks.map((_, i) => (n === 1 ? 1 : 0.95 + 0.1 * (i / (n - 1)))); // relative pace 0.95 → 1.05
  const segKm = marks.map((x, i) => x - (i ? marks[i - 1] : 0));
  const wsum = segKm.reduce((s, k, i) => s + k * w[i], 0);
  const base = totalMin / wsum; // min per km at multiplier 1
  let cum = 0;
  return marks.map((x, i) => {
    const pace = base * w[i]; cum += segKm[i] * pace;
    const climb = Math.round((vert * segKm[i]) / km);
    const note = i === 0 ? t("Start absurd roligt. Gå hver stigning.") : x === km ? t("Sidste stykke: alt hvad der er tilbage.") : i === Math.floor(n / 2) ? t("Halvvejs. Tjek fødder, salt og humør.") : cum > 240 && cum - segKm[i] * pace <= 240 ? t("Efter 4 timer: skift til rigtig mad, hvis gels kvalmer.") : "";
    return { km: x, segKm: segKm[i], pace, cum, climb, carbs: Math.round((cum / 60) * carbsPerHour), ml: Math.round((cum / 60) * mlPerHour / 100) * 100, note };
  });
}

/* Fuelling for the whole race: carbs, fluid and sodium per hour and in total, and a gel count for the shopping list. */
export function fuelling({ totalMin, hot = false }) {
  const hours = totalMin / 60;
  const carbsPerHour = totalMin <= 150 ? 60 : totalMin <= 360 ? 75 : 85;
  const mlPerHour = hot ? 700 : 500;
  const naPerHour = hot ? 700 : 500;
  const carbs = Math.round(hours * carbsPerHour);
  return { carbsPerHour, mlPerHour, naPerHour, carbs, ml: Math.round(hours * mlPerHour / 100) * 100, na: Math.round(hours * naPerHour / 100) * 100, gels: Math.ceil(carbs / 25), hours,
    tips: [t("Spis fra minut 30, hvert 20.–25. minut, i små portioner."), t("Skift mellem gel, bar, banan og salt-snacks: én smag i 10 timer holder ingen ud."), t("Drik til tørst, men aldrig under 400 ml i timen i varme."), totalMin > 360 ? t("Efter 4–5 timer: rigtig mad ved depoterne (bouillon, kartofler, sandwich).") : t("Kort løb: gels og drik rækker, ingen grund til rigtig mad."), t("Øv det hele på de lange ture. Intet nyt på løbsdagen.")] };
}

/* Kit list by distance, terrain and season. Items carry a stable id so the ticks survive in localStorage. */
export function kitList({ km, vert = 0, dateISO, totalMin = 0 }) {
  const month = dateISO ? +dateISO.slice(5, 7) : 6;
  const winter = month <= 3 || month >= 11, summer = month >= 6 && month <= 8;
  const dark = winter || totalMin > 600 || km >= 80;
  const S = (key, title, items) => ({ key, title, items: items.filter(Boolean).map(([id, name]) => ({ id, name })) });
  return [
    S("body", t("På kroppen"), [["shoes", t("Sko, du har løbet mindst 100 km i")], ["socks", t("Strømper uden sømme")], ["vest", t("Vest eller bælte, testet med fuld last")], ["flasks", t("2 × 500 ml soft flasks")], ["chafe", t("Anti-gnav-creme (lår, brystvorter, fødder)")], ["number", t("Startnummer og nåle/bælte")], ["watch", t("Ur, fuldt opladet")], ["phone", t("Telefon, opladet, i vandtæt pose")], vert >= 1500 && ["poles", t("Stave (hvis løbet tillader dem)")]]),
    S("food", t("Mad og drikke"), [["gels", t("Gels/bars: pakket efter fuelling-planen")], ["salt", t("Salt-tabletter eller elektrolytpulver")], ["real", km >= 50 && t("Rigtig mad til drop bag: sandwich, kartofler, bouillon")], ["cup", t("Foldekop (mange løb har ingen krus)")]]),
    S("weather", winter ? t("Vinter") : summer ? t("Sommer") : t("Vejr"), [dark && ["lamp", t("Pandelampe + reservebatteri")], ["jacket", t("Vind-/regnjakke")], winter && ["gloves", t("Handsker og hue")], winter && ["buff", t("Buff")], winter && ["base", t("Uldundertrøje")], summer && ["cap", t("Kasket")], summer && ["sun", t("Solcreme")], ["blanket", t("Redningstæppe")], ["whistle", t("Fløjte")]]),
    S("bag", t("Drop bag og efter løbet"), [["socks2", t("Skiftestrømper")], ["shoes2", km >= 80 && t("Skiftesko")], ["blister", t("Vabelplaster og tape")], ["pain", t("Smertestillende (kun hvis du har prøvet det før)")], ["dry", t("Tørt tøj til efter mål")], ["money", t("Kontanter/kort og ID")], ["plan", t("Pacing-plan skrevet på armen eller i lommen")]]),
  ];
}

const KIT_KEY = "ultraplan-kit";
export const loadKit = () => { try { return JSON.parse(localStorage.getItem(KIT_KEY) || "{}"); } catch { return {}; } };
export const saveKit = (v) => { try { localStorage.setItem(KIT_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
