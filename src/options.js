/* The option lists the questionnaire and the settings share. Kept out of Onboarding.jsx so the app can load the
   questionnaire lazily (first run only) and still render the Mere sections. Danish keys for t(). */
export const INJURY = [
  ["none", "Ingen skavanker", "Planen kører som normalt."],
  ["sore", "Lidt ømhed, kan løbe", "3 uger uden bakker og intervaller."],
  ["injured", "Skadet, kan ikke løbe lige nu", "4 ugers gå/løb-genopbygning først."],
];
export const AREAS = ["Knæ", "Akillessene", "Læg", "Skinneben", "Fod", "Hofte / ryg", "Andet"];
export const DIETS = [
  ["all", "Spiser alt", "Kød, fisk, æg og mejeri er på menuen."],
  ["veg", "Vegetarisk", "Ingen kød og fisk. Æg og mejeri ok."],
  ["vegan", "Vegansk", "Kun plantebaseret."],
  ["lowcarb", "Lavkulhydrat i hverdagen", "Få kulhydrater til daglig. Lange ture kræver stadig sukker."],
];
export const INTOL = ["Laktose", "Gluten", "Nødder"];
