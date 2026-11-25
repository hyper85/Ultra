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

/* Training modes (App.jsx modeOf, the questionnaire's first step, Mere → Træningsform). Danish; shown with t(). */
export const MODES = [
  ["race", "Løb mod et løb", "5 km til ultra. En plan frem til løbsdagen med nedtrapning."],
  ["hybrid", "Hybrid – løb og styrke", "Styrke og løb vægtes lige: op til 6 styrkepas som split og en lidt lavere løbetop. Med eller uden løb."],
  ["strength", "Kun styrke", "Styrkeprogram 2–6 dage om ugen. Ingen løbeplan; ture og cardio kan stadig logges."],
  ["fitness", "Form uden løb", "Løb for formens skyld: 4-ugers blokke, der bygger op og holder formen. Ingen løbsdato."],
];
