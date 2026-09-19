/* Nutrition that follows the training. Calories by day type from the resting metabolism, then the body goal
   (keep / lean / muscle / fit) and the race goal adjust them; protein by body weight, carbohydrate by the work
   of the day, fat is what is left. Meal ideas follow the diet the runner actually eats and swap for intolerances.
   Numbers are estimates: the runner's own scale and energy decide, and the app says so.
   DAY_TYPES and MEALS are Danish; every label, note, meal and hint returned by the functions is translated. */
import { t, getLang } from "./i18n.js";

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

// Meal ideas. Two variants per meal: "carb" for the days with work, "protein" for the calm ones.
const MEALS = {
  all: {
    morgenmad: { carb: "Havregrød med banan, rosiner og skyr", protein: "Æggemad på rugbrød med skyr og bær" },
    frokost: { carb: "Rugbrød med kylling, kartoffelsalat og grønt", protein: "Stor salat med kylling eller tun, æg og olivenolie" },
    aftensmad: { carb: "Pasta eller ris med laks eller kylling og masser af grønt", protein: "Fisk eller kød med ovnbagte grøntsager og en lille portion kartofler" },
    mellem: { carb: "Banan, dadler eller en skål müsli med mælk", protein: "Skyr med bær, eller et par æg" },
  },
  veg: {
    morgenmad: { carb: "Havregrød med banan, rosiner og skyr", protein: "Æg med rugbrød, hytteost og tomat" },
    frokost: { carb: "Rugbrød med æg, hummus og salat, og et stykke frugt", protein: "Salat med linser, feta, æg og olivenolie" },
    aftensmad: { carb: "Pasta med tomatsauce, bønner og ost, eller ris med tofu og grønt", protein: "Tofu eller tempeh med ovnbagte grøntsager og kikærter" },
    mellem: { carb: "Banan, dadler eller müsli med mælk", protein: "Skyr eller kvark med bær, eller hytteost" },
  },
  vegan: {
    morgenmad: { carb: "Havregrød på havredrik med banan, rosiner og sirup", protein: "Sojaskyr med müsli, frø og bær" },
    frokost: { carb: "Rugbrød med hummus og grønt, plus frugt", protein: "Salat med linser, edamame, kikærter og tahin" },
    aftensmad: { carb: "Ris eller pasta med tofu, bønner og grønt", protein: "Tempeh eller seitan med ovnbagte grøntsager og en lille portion kartofler" },
    mellem: { carb: "Banan, dadler eller tørret mango", protein: "Sojaskyr, edamame eller en shake på ærteprotein" },
  },
  lowcarb: {
    morgenmad: { carb: "Havregrød med banan, kun i dag: turen kræver det", protein: "Æg og bacon eller skyr med frø og bær" },
    frokost: { carb: "Rugbrød med kylling og en banan til turen", protein: "Salat med kylling, æg, avocado og olivenolie" },
    aftensmad: { carb: "Kød eller fisk med ris eller kartofler, mere end du plejer", protein: "Kød eller fisk med grønt i olie eller smør" },
    mellem: { carb: "Dadler eller en gel til turen", protein: "Ost, nødder eller et par æg" },
  },
};
// Swaps for intolerances, on the text in the language it is shown in (the English meals use the English words).
const SWAPS = {
  da: {
    Laktose: [[/\bskyr\b/gi, "laktosefri skyr"], [/\bmælk\b/gi, "havredrik"], [/hytteost/gi, "laktosefri hytteost"], [/\bost\b/gi, "laktosefri ost"], [/kvark/gi, "sojaskyr"]],
    Gluten: [[/rugbrød/gi, "glutenfrit brød"], [/havregrød/gi, "glutenfri havregrød"], [/pasta/gi, "risnudler"], [/seitan/gi, "tofu"]],
    Nødder: [[/nødder/gi, "græskarkerner"]],
  },
  en: {
    Laktose: [[/\bskyr\b/gi, "lactose-free skyr"], [/\bmilk\b/gi, "oat drink"], [/cottage cheese/gi, "lactose-free cottage cheese"], [/(?<!cottage )\bcheese\b/gi, "lactose-free cheese"], [/quark/gi, "soy skyr"]],
    Gluten: [[/rye bread/gi, "gluten-free bread"], [/oat porridge/gi, "gluten-free oat porridge"], [/pasta/gi, "rice noodles"], [/seitan/gi, "tofu"]],
    Nødder: [[/\bnuts\b/gi, "pumpkin seeds"]],
  },
};
const swap = (text, intol = []) => {
  let s = text;
  const rules = SWAPS[getLang()] || SWAPS.da;
  for (const key of intol) for (const [re, to] of rules[key] || []) s = s.replace(re, to);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* mealIdeas({ diet, intol, dayType, body }) -> [{ meal, text }] plus a one-line hint. */
export function mealIdeas({ diet = "all", intol = [], dayType = "rest", body = "keep" } = {}) {
  const lib = MEALS[diet] || MEALS.all;
  const variant = dayType === "long" || dayType === "quality" ? "carb" : "protein";
  const rows = [["Morgenmad", lib.morgenmad[variant]], ["Frokost", lib.frokost[variant]], ["Aftensmad", lib.aftensmad[variant]], ["Mellemmåltid", lib.mellem[variant]]].map(([meal, text]) => ({ meal: t(meal), text: swap(t(text), intol) }));
  const hint = body === "lean" ? t("Halvdelen af tallerkenen er grønt, protein i hvert måltid, og drik vand før du spiser. Sulten efter en lang tur er ægte: spis, men vælg protein og grønt først.")
    : body === "muscle" ? t("Protein i alle fire måltider, og noget at spise inden for en time efter styrke. Et ekstra mellemmåltid på styrkedage.")
    : dayType === "long" ? t("Spis 2–3 timer før turen, tag 40–90 g kulhydrat i timen undervejs, og spis inden for en time efter.") : t("Tre måltider og et mellemmåltid. Protein i hvert af dem.");
  return { rows, hint };
}
