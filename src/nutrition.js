/* Nutrition that follows the training. Calories by day type from the resting metabolism, then the body goal
   (keep / lean / muscle / fit) and the race goal adjust them; protein by body weight, carbohydrate by the work
   of the day, fat is what is left. Meal ideas follow the diet the runner actually eats and swap for intolerances.
   Numbers are estimates: the runner's own scale and energy decide, and the app says so.
   DAY_TYPES and MEALS are Danish; every label, note, meal and hint returned by the functions is translated. */
import { t, getLang } from "./i18n.js";
import { MEALS } from "./meals.js";

// Mifflin-St Jeor resting metabolism.
export const bmrOf = ({ weight = 80, height = 178, age = 40, sex = "m" }) => Math.round(10 * weight + 6.25 * height - 5 * age + (sex === "f" ? -161 : 5));

export const DAY_TYPES = [
  ["long", "Lang tur / løbsdag"],
  ["quality", "Hård session"],
  ["easy", "Rolig løbedag"],
  ["lift", "Styrkedag"],
  ["rest", "Hviledag"],
];
export const dayTypeLabel = (k) => t(DAY_TYPES.find(([x]) => x === k)?.[1] || "Hviledag");

// What kind of day it is, from the plan's numbers for that weekday.
export const dayTypeOf = ({ km = 0, isLong = false, isHard = false, isRace = false, lift = false }) => (isRace || (km > 0 && isLong) ? "long" : km > 0 && isHard ? "quality" : km > 0 ? "easy" : lift ? "lift" : "rest");

const KCAL = { long: (b) => b * 1.95, quality: (b) => b * 1.7, easy: (b) => b * 1.45 - 400, lift: (b) => b * 1.5 - 300, rest: (b) => b * 1.3 - 450 };
const CARB = { all: { long: 7, quality: 5, easy: 4, lift: 4, rest: 3 }, lowcarb: { long: 5, quality: 3, easy: 2, lift: 2, rest: 1.5 } };

/* dayTargets({ bmr, weight, body, goal, diet, dayType }) -> { kcal, protein, carbs, fat, note } in kcal and grams. */
export function dayTargets({ bmr, weight = 80, body = "keep", goal = "finish", diet = "all", dayType = "rest" }) {
  const k = KCAL[dayType] ? dayType : "rest";
  let kcal = KCAL[k](bmr);
  if (body === "lean") kcal -= 300;
  if (body === "muscle" && (k === "lift" || k === "quality")) kcal += 200;
  if (goal === "perform" && k === "quality") kcal += 100;
  kcal = Math.max(bmr * 1.15, kcal);
  kcal = Math.round(kcal / 10) * 10;
  const protein = Math.round(weight * (body === "lean" ? 2.2 : 2));
  const perKg = (diet === "lowcarb" ? CARB.lowcarb : CARB.all)[k];
  let carbs = Math.round(weight * perKg);
  const fatMin = Math.round(weight * 0.8);
  let fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  if (fat < fatMin) { fat = fatMin; carbs = Math.max(Math.round(weight * 1.5), Math.round((kcal - protein * 4 - fat * 9) / 4)); }
  const note = k === "long" ? t("Kulhydrat er brændstoffet i dag: spis det før, under og efter turen.") : k === "quality" ? t("Kulhydrat før passet, protein efter.") : k === "lift" ? t("Protein tæt på passet, resten af dagen som normalt.") : k === "rest" ? t("Mindre kulhydrat, samme protein. Grønt fylder tallerkenen.") : t("Rolig dag, rolig kost. Protein i hvert måltid.");
  return { kcal, protein, carbs, fat, note, dayType: k };
}

// Weekly overview: one row per day type the plan uses.
export const weekTargets = (args) => DAY_TYPES.map(([k, label]) => ({ key: k, label: t(label), ...dayTargets({ ...args, dayType: k }) }));

// Swaps for intolerances, on the text in the language it is shown in (the English meals use the English words).
const SWAPS = {
  da: {
    Laktose: [[/chokolademælk/gi, "kakao på havredrik"], [/\bskyr\b/gi, "laktosefri skyr"], [/\bmælk\b/gi, "havredrik"], [/hytteost/gi, "laktosefri hytteost"], [/\bost\b/gi, "laktosefri ost"], [/kvark/gi, "sojaskyr"]],
    Gluten: [[/rugbrød/gi, "glutenfrit brød"], [/havregrød/gi, "glutenfri havregrød"], [/havregryn/gi, "glutenfri havregryn"], [/pastasalat/gi, "risnudelsalat"], [/pasta/gi, "risnudler"], [/(?<!ris)nudler/gi, "risnudler"], [/lasagne/gi, "glutenfri lasagne"], [/pandekager/gi, "glutenfri pandekager"], [/rosinbolle/gi, "glutenfri bolle"], [/sandwich/gi, "glutenfri sandwich"], [/müsli/gi, "glutenfri müsli"], [/\bwrap\b/gi, "majstortilla"], [/seitan/gi, "tofu"]],
    Nødder: [[/peanutbutter/gi, "solsikkesmør"], [/peanutsauce/gi, "sesamsauce"], [/nødder/gi, "græskarkerner"]],
  },
  en: {
    Laktose: [[/chocolate milk/gi, "cocoa on oat drink"], [/\bskyr\b/gi, "lactose-free skyr"], [/\bmilk\b/gi, "oat drink"], [/cottage cheese/gi, "lactose-free cottage cheese"], [/(?<!cottage )\bcheese\b/gi, "lactose-free cheese"], [/quark/gi, "soy skyr"]],
    Gluten: [[/rye bread/gi, "gluten-free bread"], [/oat porridge/gi, "gluten-free oat porridge"], [/\boats\b/gi, "gluten-free oats"], [/pasta salad/gi, "rice-noodle salad"], [/pasta/gi, "rice noodles"], [/(?<!rice )noodles/gi, "rice noodles"], [/lasagne/gi, "gluten-free lasagne"], [/pancakes/gi, "gluten-free pancakes"], [/raisin bun/gi, "gluten-free bun"], [/sandwich/gi, "gluten-free sandwich"], [/muesli/gi, "gluten-free muesli"], [/\bwrap\b/gi, "corn tortilla"], [/seitan/gi, "tofu"]],
    Nødder: [[/peanut butter/gi, "sunflower-seed butter"], [/peanut sauce/gi, "sesame sauce"], [/\bnuts\b/gi, "pumpkin seeds"]],
  },
};
const swap = (text, intol = []) => {
  let s = text;
  const rules = SWAPS[getLang()] || SWAPS.da;
  for (const key of intol) for (const [re, to] of rules[key] || []) s = s.replace(re, to);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// What is in season in Denmark, by month: one line under the meals, so the plate follows the year.
const SEASON = [
  [[12, 1, 2], "Sæsonens grønt: grønkål, rosenkål, rødbeder, porrer og æbler."],
  [[3, 4, 5], "Sæsonens grønt: asparges, radiser, spinat, nye kartofler og rabarber."],
  [[6, 7, 8], "Sæsonens grønt: jordbær, ærter, tomater, agurk og nye kartofler."],
  [[9, 10, 11], "Sæsonens grønt: græskar, æbler, kål, rodfrugter og svampe."],
];
const seasonLine = (date) => t(SEASON.find(([m]) => m.includes(date.getMonth() + 1))[1]);
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000);

const SLOTS = [["morgenmad", "Morgenmad", 0.25], ["frokost", "Frokost", 0.3], ["aftensmad", "Aftensmad", 0.3], ["mellem", "Mellemmåltid", 0.15]];
// Which meal comes right before and right after a session at that time of day.
const AROUND = { morning: ["morgenmad", "frokost"], noon: ["morgenmad", "frokost"], evening: ["mellem", "aftensmad"] };

/* mealIdeas({ diet, intol, dayType, body, time, km, carbsPerHour, protein, weight, date, shift })
   -> { rows: [{ meal, tag, text, protein }], fuel, season, hint }.
   The day of the year (plus `shift`, the "other ideas" button) picks one of four ideas per meal, so the card changes
   every day. A session with a time of day tags the meal before it (carbohydrate) and the one after (protein and
   carbohydrate within the hour); `fuel` is the line for what to take during a long run. */
export function mealIdeas({ diet = "all", intol = [], dayType = "rest", body = "keep", time = "", km = 0, carbsPerHour = "40–60", protein = 160, weight = 80, date = new Date(), shift = 0 } = {}) {
  const lib = MEALS[diet] || MEALS.all;
  const work = dayType === "long" || dayType === "quality";
  const session = dayType === "lift" ? "lift" : km > 0 || work ? "run" : null;
  const [pre, post] = session && AROUND[time] ? AROUND[time] : [null, null];
  const n = dayOfYear(date) + shift * 3;
  const rows = SLOTS.map(([key, label, share], i) => {
    const variant = key === post ? "recover" : key === pre ? "carb" : work ? "carb" : "protein";
    const list = lib[key][variant];
    const tag = key === pre ? (session === "lift" ? t("før styrken") : t("før turen")) : key === post ? (session === "lift" ? t("efter styrken") : t("efter turen")) : "";
    return { meal: t(label), tag, text: swap(t(list[(n + i) % list.length]), intol), protein: Math.round((protein * share) / 5) * 5 };
  });
  const fuel = dayType === "long" ? (km >= 10 ? t("Undervejs: {g} g kulhydrat i timen, fx 2–3 geler eller banan og dadler, og 4–6 dl at drikke i timen.", { g: carbsPerHour }) : t("Undervejs: vand er nok under en time; tag en gel eller en banan med, hvis turen trækker ud.")) : null;
  const after = session && post ? t("Inden for en time efter: ca. {p} g protein og noget kulhydrat.", { p: Math.max(25, Math.min(40, Math.round(weight * 0.3 / 5) * 5)) }) : null;
  const hint = body === "lean" ? t("Halvdelen af tallerkenen er grønt, protein i hvert måltid, og drik vand før du spiser. Sulten efter en lang tur er ægte: spis, men vælg protein og grønt først.")
    : body === "muscle" ? t("Protein i alle fire måltider, og noget at spise inden for en time efter styrke. Et ekstra mellemmåltid på styrkedage.")
    : dayType === "long" ? t("Spis 2–3 timer før turen, tag 40–90 g kulhydrat i timen undervejs, og spis inden for en time efter.") : t("Tre måltider og et mellemmåltid. Protein i hvert af dem.");
  return { rows, fuel, after, season: seasonLine(date), hint };
}
