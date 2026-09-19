/* Form in relation to others: VO2 max (measured by the watch, or estimated from resting and maximum heart rate),
   placed against age- and sex-specific norms, giving a category, a rough percentile among people of the same age
   and sex, and a "fitness age": the age at which the average person has the same VO2 max.
   Estimates, and the app says so. Norms are the widely used Cooper Institute tables (ml/kg/min). */
import { t } from "./i18n.js";

// Category bounds per age band: [very poor top, poor top, fair top, good top, excellent top]; above = superior.
const NORMS = {
  m: [[29, 33, 36.4, 42.4, 46.4, 52.4], [39, 31.4, 35.4, 40.9, 44.9, 49.4], [49, 30.1, 33.5, 38.9, 43.7, 48], [59, 26, 30.9, 35.7, 40.9, 45.3], [99, 20.4, 26, 32.2, 36.4, 44.2]],
  f: [[29, 23.5, 28.9, 32.9, 36.9, 41], [39, 22.7, 26.9, 31.4, 35.6, 40], [49, 20.9, 24.4, 28.9, 32.8, 36.9], [59, 20.1, 22.7, 26.9, 31.4, 35.7], [99, 17.4, 20.1, 24.4, 30.2, 31.4]],
};
// Population average VO2 max by age (midpoints), used for the fitness age. Roughly the middle of "fair/good".
const AVG = { m: [[20, 46], [25, 44], [35, 41.5], [45, 39], [55, 35.5], [65, 32], [75, 28]], f: [[20, 37], [25, 35], [35, 32.5], [45, 30], [55, 27.5], [65, 25], [75, 22]] };
const CATS = ["Meget lav", "Lav", "Middel", "God", "Fremragende", "Elite"];
// Percentile edges that the category bounds roughly correspond to.
const PCT = [0, 10, 30, 50, 70, 90, 100];

// Uth et al.: VO2 max ≈ 15.3 × HRmax / HRrest. Validated on young, fit men, so it runs high with age; a decline of
// 0.85 % per year past 25 brings it in line with what watches report for runners in their forties and fifties.
export const estimateVO2 = ({ restHR, maxHR, age = 30 }) => (restHR > 25 && maxHR > 100 ? Math.round(15.3 * (maxHR / restHR) * Math.max(0.6, 1 - 0.0085 * Math.max(0, (+age || 30) - 25)) * 10) / 10 : null);

const band = (sex, age) => (NORMS[sex] || NORMS.m).find((b) => age <= b[0]);

/* fitnessReport({ age, sex, restHR, maxHR, vo2 }) -> { vo2, measured, category, categoryIndex, percentile, fitnessAge, note }
   category is translated; categoryIndex (0–5, into CATS) is the stable value to compare against. */
export function fitnessReport({ age, sex = "m", restHR, maxHR, vo2 }) {
  const s = sex === "f" ? "f" : "m";
  const a = +age > 0 ? +age : 40;
  const measured = vo2 > 0;
  const v = measured ? +vo2 : estimateVO2({ restHR, maxHR, age: a });
  if (!v) return null;
  const b = band(s, a);
  const bounds = [0, ...b.slice(1), Math.max(b[5] + 8, v + 1)];
  let percentile = 99;
  for (let i = 0; i < 6; i++) {
    if (v < bounds[i + 1]) { const lo = bounds[i], hi = bounds[i + 1]; percentile = Math.round(PCT[i] + (PCT[i + 1] - PCT[i]) * ((v - lo) / Math.max(0.1, hi - lo))); break; }
  }
  percentile = Math.max(1, Math.min(99, percentile));
  const idx = bounds.findIndex((x, i) => i > 0 && v < x);
  const categoryIndex = idx < 0 ? 5 : Math.min(5, idx - 1);
  const category = t(CATS[categoryIndex]);
  // Fitness age: the age whose average equals the runner's VO2 max, by linear interpolation; clamped to 18–80.
  const avg = AVG[s];
  let fitnessAge;
  if (v >= avg[0][1]) fitnessAge = Math.round(avg[0][0] - (v - avg[0][1]) * 1.5);
  else if (v <= avg[avg.length - 1][1]) fitnessAge = Math.round(avg[avg.length - 1][0] + (avg[avg.length - 1][1] - v) * 2.5);
  else for (let i = 0; i < avg.length - 1; i++) { const [a0, v0] = avg[i], [a1, v1] = avg[i + 1]; if (v <= v0 && v >= v1) { fitnessAge = Math.round(a0 + (v0 - v) / (v0 - v1) * (a1 - a0)); break; } }
  fitnessAge = Math.max(20, Math.min(80, fitnessAge));
  const note = measured ? t("VO2 max fra dit ur (Garmin-rapport).") : t("VO2 max anslået fra hvile- og makspuls (15,3 × maks/hvile). Hent Garmins VO2 max-rapport for et bedre tal.");
  return { vo2: v, measured, category, categoryIndex, percentile, fitnessAge, ageDiff: a - fitnessAge, sexUsed: s, note };
}
