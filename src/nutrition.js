/* Nutrition that follows the training. Calories by day type from the resting metabolism, then the body goal
   (keep / lean / muscle / fit) and the race goal adjust them; protein by body weight, carbohydrate by the work
   of the day, fat is what is left. Meal ideas follow the diet the runner actually eats and swap for intolerances.
   Numbers are estimates: the runner's own scale and energy decide, and the app says so. */

// Mifflin-St Jeor resting metabolism.
export const bmrOf = ({ weight = 80, height = 178, age = 40, sex = "m" }) => Math.round(10 * weight + 6.25 * height - 5 * age + (sex === "f" ? -161 : 5));

export const DAY_TYPES = [
  ["long", "Lang tur / løbsdag"],
  ["quality", "Hård session"],
  ["easy", "Rolig løbedag"],
  ["lift", "Styrkedag"],
  ["rest", "Hviledag"],
];
export const dayTypeLabel = (t) => DAY_TYPES.find(([k]) => k === t)?.[1] || "Hviledag";

// What kind of day it is, from the plan's numbers for that weekday.
export const dayTypeOf = ({ km = 0, isLong = false, isHard = false, isRace = false, lift = false }) => (isRace || (km > 0 && isLong) ? "long" : km > 0 && isHard ? "quality" : km > 0 ? "easy" : lift ? "lift" : "rest");

const KCAL = { long: (b) => b * 1.95, quality: (b) => b * 1.7, easy: (b) => b * 1.45 - 400, lift: (b) => b * 1.5 - 300, rest: (b) => b * 1.3 - 450 };
const CARB = { all: { long: 7, quality: 5, easy: 4, lift: 4, rest: 3 }, lowcarb: { long: 5, quality: 3, easy: 2, lift: 2, rest: 1.5 } };

/* dayTargets({ bmr, weight, body, goal, diet, dayType }) -> { kcal, protein, carbs, fat, note } in kcal and grams. */
export function dayTargets({ bmr, weight = 80, body = "keep", goal = "finish", diet = "all", dayType = "rest" }) {
  const t = KCAL[dayType] ? dayType : "rest";
  let kcal = KCAL[t](bmr);
  if (body === "lean") kcal -= 300;
  if (body === "muscle" && (t === "lift" || t === "quality")) kcal += 200;
  if (goal === "perform" && t === "quality") kcal += 100;
  kcal = Math.max(bmr * 1.15, kcal);
  kcal = Math.round(kcal / 10) * 10;
  const protein = Math.round(weight * (body === "lean" ? 2.2 : 2));
  const perKg = (diet === "lowcarb" ? CARB.lowcarb : CARB.all)[t];
  let carbs = Math.round(weight * perKg);
  const fatMin = Math.round(weight * 0.8);
  let fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  if (fat < fatMin) { fat = fatMin; carbs = Math.max(Math.round(weight * 1.5), Math.round((kcal - protein * 4 - fat * 9) / 4)); }
  const note = t === "long" ? "Kulhydrat er brændstoffet i dag: spis det før, under og efter turen." : t === "quality" ? "Kulhydrat før passet, protein efter." : t === "lift" ? "Protein tæt på passet, resten af dagen som normalt." : t === "rest" ? "Mindre kulhydrat, samme protein. Grønt fylder tallerkenen." : "Rolig dag, rolig kost. Protein i hvert måltid.";
  return { kcal, protein, carbs, fat, note, dayType: t };
}

// Weekly overview: one row per day type the plan uses.
export const weekTargets = (args) => DAY_TYPES.map(([k, label]) => ({ key: k, label, ...dayTargets({ ...args, dayType: k }) }));

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
const swap = (text, intol = []) => {
  let s = text;
  if (intol.includes("Laktose")) s = s.replace(/skyr og bær/gi, "laktosefri skyr og bær").replace(/\bskyr\b/gi, "laktosefri skyr").replace(/\bmælk\b/gi, "havredrik").replace(/hytteost/gi, "laktosefri hytteost").replace(/\bost\b/gi, "laktosefri ost").replace(/kvark/gi, "sojaskyr");
  if (intol.includes("Gluten")) s = s.replace(/rugbrød/gi, "glutenfrit brød").replace(/havregrød/gi, "glutenfri havregrød").replace(/pasta/gi, "risnudler").replace(/seitan/gi, "tofu");
  if (intol.includes("Nødder")) s = s.replace(/nødder/gi, "græskarkerner");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* mealIdeas({ diet, intol, dayType, body }) -> [{ meal, text }] plus a one-line hint. */
export function mealIdeas({ diet = "all", intol = [], dayType = "rest", body = "keep" } = {}) {
  const lib = MEALS[diet] || MEALS.all;
  const variant = dayType === "long" || dayType === "quality" ? "carb" : "protein";
  const rows = [["Morgenmad", lib.morgenmad[variant]], ["Frokost", lib.frokost[variant]], ["Aftensmad", lib.aftensmad[variant]], ["Mellemmåltid", lib.mellem[variant]]].map(([meal, text]) => ({ meal, text: swap(text, intol) }));
  const hint = body === "lean" ? "Halvdelen af tallerkenen er grønt, protein i hvert måltid, og drik vand før du spiser. Sulten efter en lang tur er ægte: spis, men vælg protein og grønt først."
    : body === "muscle" ? "Protein i alle fire måltider, og noget at spise inden for en time efter styrke. Et ekstra mellemmåltid på styrkedage."
    : dayType === "long" ? "Spis 2–3 timer før turen, tag 40–90 g kulhydrat i timen undervejs, og spis inden for en time efter." : "Tre måltider og et mellemmåltid. Protein i hvert af dem.";
  return { rows, hint };
}
