/* Strength for runners with a normal life. Two or three short sessions a week, built from movement patterns
   (squat, hinge, single-leg, push, pull, core, calf), chosen by the equipment the runner actually has, and
   dosed by the plan's phase and the body goal. Pure and deterministic, like the plan engine.
   Principle: strength supports the running. Heavy and short in the build, maintained in ultra-prep, light in the
   taper, nothing in race week. A runner who wants muscle gets more sets and reps, not more days than they have.
   BODY, GEAR and DAILY_ANKLE are Danish constants (the screens render them with t()); everything buildStrength,
   bodyLabel and gearLabel return is translated. */
import { t } from "./i18n.js";

export const BODY = [
  ["keep", "Holde vægten", "Vægten stabil, kroppen hel."],
  ["lean", "Tabe mig", "Ca. 300 kcal under behov, max 0,5 kg/uge."],
  ["muscle", "Bygge muskler", "3 styrkepas, lidt over behov på styrkedage."],
  ["fit", "Være fit", "2 styrkepas, vægten stabil."],
];
export const GEAR = [
  ["none", "Uden udstyr", "Krop, trappe, stol og gulv. Kan laves i stuen."],
  ["home", "Håndvægte eller elastik", "Et par håndvægte eller en kettlebell og en elastik."],
  ["gym", "Fitnesscenter", "Stang, stativ, håndvægte og maskiner."],
];
export const bodyLabel = (k) => t(BODY.find(([x]) => x === k)?.[1] || "Holde vægten");
export const gearLabel = (k) => t(GEAR.find(([x]) => x === k)?.[1] || "Håndvægte eller elastik");

// Exercises per pattern per equipment level, as lists of variants: the week picks one, so the sessions change from
// week to week while the patterns stay (squat, hinge, single-leg, calf, hip, pull, back, core, carry, push, press).
// "how" is the one sentence a tired runner needs.
const EX = {
  squat: {
    none: [{ name: "Squat med kropsvægt", how: "Fødder skulderbredt, ned til lårene er vandrette, hælene i gulvet. Langsomt ned, hurtigt op." },
      { name: "Tempo-squat (3 s ned)", how: "Som en squat, men tre sekunder ned og pause i bunden. Det er tiden under spænding, der bygger benene." },
      { name: "Squat til stol på ét ben", how: "Sæt dig ned på en stol på ét ben, så langsomt du kan, og rejs dig på samme ben. Byt ben." }],
    home: [{ name: "Goblet squat", how: "Hold håndvægten mod brystet, albuerne mellem knæene i bunden. Ryggen lang, hælene i gulvet." },
      { name: "Squat med elastik om knæene", how: "Elastikken lige over knæene, pres knæene udad hele vejen ned og op. Hofte og knæ holder sporet." },
      { name: "Tempo-goblet squat (3 s ned)", how: "Vægten mod brystet, tre sekunder ned, pause i bunden, op. Tiden under spænding bygger benene." }],
    gym: [{ name: "Back squat", how: "Stangen på øverste ryg, ned til lårene er vandrette. Vægt, du kan tage alle sæt med, med 2 gentagelser til gode." },
      { name: "Front squat", how: "Stangen på forsiden af skuldrene, albuerne højt, ned til lårene er vandrette. Lettere end back squat, hårdere for ryg og core." },
      { name: "Tung goblet squat", how: "Den tungeste håndvægt mod brystet, ned til albuerne rører knæene. Ryggen lang, hælene i gulvet." }],
  },
  hinge: {
    none: [{ name: "Hoftehæv (glute bridge)", how: "Lig på ryggen, fødderne tæt på numsen, pres hoften op og klem bagdelen i 2 sekunder i toppen." },
      { name: "Hoftehæv på ét ben", how: "Som hoftehæv, men det ene ben strakt i luften. Hoften lige, klem bagdelen i toppen. Byt ben." },
      { name: "Nordic hamstring (let udgave)", how: "Knæl med fødderne fastholdt, læn dig langsomt frem så langt du kan styre, tag imod med hænderne." }],
    home: [{ name: "Rumænsk dødløft med håndvægte", how: "Skub hoften bagud med lange ben og lang ryg, vægtene tæt på benene, ned til du mærker baglåret. Op med hoften." },
      { name: "Kettlebell-swing", how: "Hoften bagud, armene lange, svinget kommer fra hoften, ikke armene. Ryggen lang hele vejen. Kraft til stigningerne." },
      { name: "Hip thrust med vægt på sofaen", how: "Skulderbladene på sofakanten, vægten over hoften, pres hoften op til kroppen er vandret, klem bagdelen i toppen." }],
    gym: [{ name: "Rumænsk dødløft", how: "Stangen glider langs benene, hoften bagud, ryggen lang. Stop, hvor baglåret spænder, og kør hoften frem." },
      { name: "Trap bar-dødløft", how: "Stå i stangen, hoften bagud, lang ryg, pres gulvet væk. Den tungeste øvelse i ugen. Teknik før kilo." },
      { name: "Hip thrust med stang", how: "Skulderbladene på bænken, stangen over hoften, pres op til kroppen er vandret, klem bagdelen i toppen." }],
  },
  single: {
    none: [{ name: "Udfald bagud", how: "Træd bagud og sænk bagerste knæ mod gulvet. Forreste knæ over foden, overkroppen oprejst." },
      { name: "Step-up på et højt trin", how: "Hele foden på trinnet, pres dig op uden afsæt fra det nederste ben, langsomt ned. Det er vandretrinnet på Bornholm." },
      { name: "Gående udfald", how: "Lange skridt, bagerste knæ næsten i gulvet, overkroppen oprejst. 10 skridt frem, vend, 10 tilbage." }],
    home: [{ name: "Split squat med håndvægte", how: "Et ben foran, et bagved, ned til bagerste knæ næsten rører gulvet. Vægtene hænger stille langs siderne." },
      { name: "Step-up med håndvægte", how: "Et højt trin eller en stabil stol, hele foden på, pres op uden afsæt, langsomt ned. Bornholms stigninger i stuen." },
      { name: "Udfald bagud med håndvægte", how: "Træd bagud, bagerste knæ mod gulvet, forreste knæ over foden. Vægtene stille langs siderne." }],
    gym: [{ name: "Bulgarian split squat", how: "Bagerste fod på en bænk, ned til forreste lår er vandret. Kraften fra hælen. Den bygger løbeben." },
      { name: "Step-up på høj kasse med håndvægte", how: "Kassen til knæhøjde, hele foden på, pres op uden afsæt fra det nederste ben, langsomt ned. Trappen til Hammerknuden." },
      { name: "Gående udfald med håndvægte", how: "Lange skridt, bagerste knæ næsten i gulvet, overkroppen oprejst. 10 skridt frem, vend, 10 tilbage." }],
  },
  push: {
    none: [{ name: "Armbøjninger", how: "Kroppen som en planke, albuerne 45 grader fra kroppen, brystet ned til en knytnæve fra gulvet. For svært: hænderne på en stol." }],
    home: [{ name: "Gulvpres med håndvægte", how: "Lig på ryggen, pres vægtene op over brystet, sænk til overarmene rører gulvet." }],
    gym: [{ name: "Bænkpres", how: "Skulderbladene samlet, fødderne i gulvet, stangen til brystet og op. Ikke hoppe med stangen." }],
  },
  pull: {
    none: [{ name: "Roning under bordet", how: "Lig under et solidt bord, grib kanten, træk brystet op til bordet med kroppen som en planke." },
      { name: "Roning med håndklæde i dørkarmen", how: "Håndklædet om dørkarmen, læn dig bagud med strakte arme, træk brystet mod karmen. Jo mere du læner, jo hårdere." }],
    home: [{ name: "Roning med håndvægt", how: "Den ene hånd og det ene knæ på en stol, træk vægten op til hoften med albuen tæt på kroppen." },
      { name: "Roning med elastik", how: "Elastikken om fødderne, sid ret op, træk albuerne bagud, klem skulderbladene sammen, hold 1 sekund." },
      { name: "Roning med håndvægte, begge arme", how: "Hoften bagud som i dødløft, ryggen lang, træk begge vægte op til hoften, albuerne tæt på kroppen." }],
    gym: [{ name: "Pull-ups eller lat pulldown", how: "Træk til hagen er over stangen eller stangen ved brystet. Kan du ikke tage 5 pull-ups, så brug maskinen eller en elastik." },
      { name: "Roning med stang", how: "Hoften bagud, ryggen lang, træk stangen til maven, albuerne tæt på kroppen. Ingen svaj i lænden." },
      { name: "Enarms roning med håndvægt", how: "Hånd og knæ på bænken, træk vægten til hoften med albuen tæt på kroppen, 1 sekund i toppen. Byt side." }],
  },
  back: {
    none: [{ name: "Superman (rygløft på gulvet)", how: "Lig på maven, løft bryst, arme og ben lidt fra gulvet, hold 2 sekunder, ned. Lænden og skulderbladene, der bærer vesten." },
      { name: "Bird dog", how: "På alle fire, stræk modsat arm og ben, hold 2 sekunder uden at ryggen drejer. Skift. Rygsøjlen i ro under belastning." }],
    home: [{ name: "Superman (rygløft på gulvet)", how: "Lig på maven, løft bryst, arme og ben lidt fra gulvet, hold 2 sekunder, ned. Lænden og skulderbladene, der bærer vesten." },
      { name: "Bird dog med håndvægt", how: "På alle fire, en let håndvægt i hånden, stræk modsat arm og ben, hold 2 sekunder. Skift." },
      { name: "Good morning med elastik", how: "Elastikken under fødderne og om nakken, hoften bagud med lang ryg til du mærker baglåret, op. Lænden lærer at holde." }],
    gym: [{ name: "Rygstræk (back extension)", how: "I rygstræk-bænken, sænk overkroppen roligt, op til kroppen er lige, ikke højere. Hold vægtpladen mod brystet, når det er for let." },
      { name: "Good morning med stang", how: "Let stang på ryggen, hoften bagud med lang ryg til du mærker baglåret, op. Lænden og baglåret, der holder dig oprejst på time 10." },
      { name: "Superman (rygløft på gulvet)", how: "Lig på maven, løft bryst, arme og ben lidt fra gulvet, hold 2 sekunder, ned." }],
  },
  press: {
    none: [{ name: "Pike push-ups", how: "Numsen i vejret som et omvendt V, sænk hovedet mod gulvet mellem hænderne, pres op. Skuldre og triceps." }],
    home: [{ name: "Skulderpres med håndvægte", how: "Stående, vægtene ved skuldrene, pres lige op, spænd maven, så ryggen ikke svajer." }],
    gym: [{ name: "Skulderpres med stang", how: "Stående eller siddende, stangen fra kravebenet til strakte arme. Let vægt, ren teknik." }],
  },
  core: {
    none: [{ name: "Sideplanke", how: "På albuen, kroppen som en lige linje fra hoved til fod. Hoften må ikke synke. Skift side." },
      { name: "Dead bug", how: "På ryggen med arme og knæ i luften, lænden i gulvet, stræk modsat arm og ben langsomt ud, tilbage. Lænden bliver i gulvet." },
      { name: "Planke med skulder-tap", how: "Planke på hænderne, rør modsat skulder med hånden uden at hoften drejer. Langsomt. Skift hånd." },
      { name: "Hollow hold", how: "På ryggen, lænden i gulvet, skuldre og ben løftet, armene langs ørerne. Hold 20 sekunder uden at lænden slipper gulvet." }],
    home: [{ name: "Pallof press med elastik", how: "Elastikken i siden, pres hænderne lige frem og hold 3 sekunder uden at rotere. Skift side." },
      { name: "Dead bug", how: "På ryggen med arme og knæ i luften, lænden i gulvet, stræk modsat arm og ben langsomt ud, tilbage. Lænden bliver i gulvet." },
      { name: "Sideplanke med benløft", how: "Sideplanke på albuen, løft øverste ben 10 gange uden at hoften synker. Skift side." },
      { name: "Planke med skulder-tap", how: "Planke på hænderne, rør modsat skulder med hånden uden at hoften drejer. Langsomt. Skift hånd." }],
    gym: [{ name: "Pallof press i kabel", how: "Kablet i siden, pres hænderne lige frem, hold 3 sekunder, tilbage. Kroppen må ikke dreje. Skift side." },
      { name: "Dead bug", how: "På ryggen med arme og knæ i luften, lænden i gulvet, stræk modsat arm og ben langsomt ud, tilbage. Lænden bliver i gulvet." },
      { name: "Sideplanke med benløft", how: "Sideplanke på albuen, løft øverste ben 10 gange uden at hoften synker. Skift side." },
      { name: "Ab wheel eller planke-udrulning", how: "På knæene, rul hjulet eller stangen frem så langt du kan holde lænden lige, tilbage. Færre, rene gentagelser." }],
  },
  carry: {
    none: [{ name: "Kufferbæring med vandflaske eller taske", how: "Gå 40 m med en tung taske i den ene hånd, skuldrene lige, skift hånd." },
      { name: "Bæring over hovedet med taske", how: "Tasken strakt over hovedet, gå 30 m med spændt mave og ribbenene nede. Skift arm. Skuldre og core, der holder stavene." }],
    home: [{ name: "Farmer's carry", how: "En tung vægt i hver hånd, gå 40 m med lange skridt og høj brystkasse." },
      { name: "Kufferbæring", how: "Én tung vægt i den ene hånd, gå 40 m uden at hælde til siden. Skift hånd. Siden af kroppen, der holder dig lige på skrå stier." },
      { name: "Bæring over hovedet", how: "En håndvægt strakt over hovedet, gå 30 m med spændt mave. Skift arm." }],
    gym: [{ name: "Farmer's carry", how: "Tunge håndvægte eller trap bar, gå 40 m, skuldrene nede og bagud." },
      { name: "Kufferbæring", how: "Én tung håndvægt, gå 40 m uden at hælde til siden. Skift hånd. Siden af kroppen, der holder dig lige på skrå stier." },
      { name: "Bæring over hovedet", how: "En håndvægt strakt over hovedet, gå 30 m med spændt mave. Skift arm." }],
  },
  calf: {
    none: [{ name: "Lægløft på ét ben på et trin", how: "Op på tæerne på ét ben, 3 sekunder ned til hælen er under trinnet. Lægløft er senetræning, langsomt ned er pointen." },
      { name: "Lægløft med bøjet knæ (soleus)", how: "Siddende eller med let bøjet knæ, op på tæerne, 3 sekunder ned. Den dybe lægmuskel, der bærer de lange nedløb." }],
    home: [{ name: "Lægløft på ét ben med håndvægt", how: "Vægten i hånden på samme side, 3 sekunder ned under trinnet. Langsomt ned er pointen." },
      { name: "Lægløft med bøjet knæ (soleus)", how: "Siddende med vægten på knæet, op på tæerne, 3 sekunder ned. Den dybe lægmuskel, der bærer de lange nedløb." }],
    gym: [{ name: "Lægløft på ét ben med vægt", how: "I maskine eller med håndvægt, 3 sekunder ned. Akillessenen elsker langsomme, tunge gentagelser." },
      { name: "Siddende lægløft (soleus)", how: "I maskinen eller med vægt på knæene, op på tæerne, 3 sekunder ned. Den dybe lægmuskel til de lange nedløb." }],
  },
  hip: {
    none: [{ name: "Copenhagen plank", how: "Sideplanke med øverste ben på en stol, løft underkroppen. Lysken, som beskytter knæ og hofte. 20 sekunder pr. side." },
      { name: "Sideliggende benløft", how: "På siden, løft øverste ben lige op med tåen pegende frem, 2 sekunder i toppen. Hoftens side, der holder knæet i sporet." },
      { name: "Clamshell med elastik", how: "På siden med bøjede knæ og elastik om knæene, åbn knæene som en musling uden at hoften ruller. Skift side." }],
    home: [{ name: "Copenhagen plank", how: "Sideplanke med øverste ben på en stol, løft underkroppen. 20 sekunder pr. side." },
      { name: "Monster walk med elastik", how: "Elastikken om anklerne, let hug, gå sidelæns 10 skridt hver vej uden at knæene falder ind." },
      { name: "Clamshell med elastik", how: "På siden med bøjede knæ og elastik om knæene, åbn knæene som en musling uden at hoften ruller. Skift side." }],
    gym: [{ name: "Copenhagen plank", how: "Sideplanke med øverste ben på en bænk, løft underkroppen. 20 sekunder pr. side." },
      { name: "Hofteabduktion i kabel eller maskine", how: "Før benet ud til siden mod modstand, 2 sekunder i yderstillingen, roligt tilbage. Byt ben." },
      { name: "Monster walk med elastik", how: "Elastikken om anklerne, let hug, gå sidelæns 10 skridt hver vej uden at knæene falder ind." }],
  },
  curl: {
    none: [{ name: "Nordic hamstring (let udgave)", how: "Knæl med fødderne fastholdt, læn dig langsomt frem så langt du kan styre, tag imod med hænderne." }],
    home: [{ name: "Bicepscurl og triceps-dips", how: "Curl med håndvægte, dips på en stol. Til dig, der vil have arme, ikke til løbet." }],
    gym: [{ name: "Bicepscurl og triceps-pushdown", how: "Rolige gentagelser, fuld bevægelse. Til dig, der vil have arme, ikke til løbet." }],
  },
  hop: {
    none: [{ name: "Hop på stedet (pogo)", how: "Små, hurtige hop på forfoden med stive ankler, som et sjippetov uden reb. 20 sekunder." }],
    home: [{ name: "Hop på stedet (pogo)", how: "Små, hurtige hop på forfoden med stive ankler. 20 sekunder." }],
    gym: [{ name: "Kassehop", how: "Hop op på en lav kasse, land blødt, træd ned. Kraft og landing, ikke højde." }],
  },
};

// Daily ankle routine, five minutes, every day. The cheapest injury insurance an ultra runner can buy.
export const DAILY_ANKLE = ["Lægløft på ét ben 3×12", "Balance på ét ben 2×60 s", "Fodled ud/ind med elastik 2×15"];

// Dose by phase: sets × reps and rest. Ultra-prep keeps strength without stealing legs from the long runs.
const DOSE = {
  Genopbygning: { sets: 2, reps: "10–12", rest: "60 s", note: "Let vægt, ren teknik. Kroppen skal huske bevægelserne." },
  Opbygning: { sets: 3, reps: "6–8", rest: "90 s", note: "Tungt nok til at de sidste 2 gentagelser er hårde. Her bygges styrken." },
  "Ultra-prep": { sets: 2, reps: "5–6", rest: "90 s", note: "Tungt og kort. Vedligehold, så benene er friske til de lange ture." },
  Nedtrapning: { sets: 2, reps: "6", rest: "90 s", note: "Let. Bevægelserne holdes ved lige, intet må gøre ømt." },
};

const fmt = (sets, reps, ex) => ({ ...ex, sets, reps, label: `${ex.name} ${sets}×${reps}` });

/* buildStrength({ body, gear, phase, deload, isRace, count })
   -> { sessions: [{ key, name, focus, minutes, exercises: [{ name, how, sets, reps, label }] }], daily, note }
   `week` rotates the variants (the plan's week number); focus "trail" makes session B back + core. */
export function buildStrength({ body = "keep", gear = "home", phase = "Opbygning", deload = false, isRace = false, count = 2, week = 0, focus = "default" } = {}) {
  const g = EX.squat[gear] ? gear : "home";
  // The week picks the variant; a different offset per pattern, so two patterns do not flip together.
  const OFF = { squat: 0, hinge: 1, single: 2, pull: 1, back: 0, core: 2, carry: 1, calf: 0, hip: 2, push: 0, press: 0, curl: 0, hop: 0 };
  const pick = (k, extra = 0) => { const list = EX[k][g]; const ex = list[(Math.max(0, week) + (OFF[k] || 0) + extra) % list.length]; return { ...ex, name: t(ex.name), how: t(ex.how), pattern: k }; };
  const n = Math.max(0, Math.min(3, count));
  const daily = DAILY_ANKLE.map((x) => t(x));
  if (isRace || n === 0) return { sessions: [], daily, note: isRace ? t("Løbsuge: ingen styrke. Kun ankelrutinen og hvile.") : t("Ingen styrkepas valgt. Ankelrutinen hver dag er stadig en god idé.") };
  const base = DOSE[phase] || DOSE.Opbygning;
  let sets = base.sets, reps = base.reps, rest = base.rest, note = base.note;
  // Body goal changes the dose, never the movements.
  if (body === "muscle" && phase !== "Nedtrapning") { sets += 1; reps = phase === "Genopbygning" ? "10–12" : "8–12"; rest = "90 s"; note = "Til muskler: et sæt mere, 8–12 gentagelser, og spis efter passet."; }
  if (body === "lean") { reps = phase === "Ultra-prep" ? "8" : "12–15"; rest = "45 s"; note = "Til vægttab: lidt lettere, flere gentagelser, kort pause. Styrken holder musklerne, mens vægten går ned."; }
  if (deload) { sets = Math.max(1, sets - 1); note = "Let uge: et sæt mindre. Teknik, ikke træthed."; }
  const perLeg = t("{reps}/ben", { reps }), perSide = "8/side", calf = t("12/ben"), hip = "20 s/side";
  const A = { key: "A", name: t("Styrke A"), focus: t("Ben og hofte"), exercises: [fmt(sets, reps, pick("squat")), fmt(sets, reps, pick("hinge")), fmt(sets, perLeg, pick("single")), fmt(3, hip, pick("hip")), fmt(3, calf, pick("calf"))] };
  const B = { key: "B", name: t("Styrke B"), focus: t("Overkrop og core"), exercises: [fmt(sets, reps, pick("push")), fmt(sets, reps, pick("pull")), fmt(Math.max(2, sets - 1), reps, pick("press")), fmt(3, "40 m", pick("carry")), fmt(3, perSide, pick("core"))] };
  if (body === "muscle") B.exercises.push(fmt(3, "10–12", pick("curl")));
  const C = { key: "C", name: t("Styrke C"), focus: body === "muscle" ? t("Hele kroppen") : t("Kraft og fjedre"), exercises: body === "muscle"
    ? [fmt(sets, reps, pick("hinge")), fmt(sets, reps, pick("push")), fmt(sets, perLeg, pick("single")), fmt(sets, reps, pick("pull")), fmt(3, calf, pick("calf"))]
    : [fmt(3, "20 s", pick("hop")), fmt(2, perLeg, pick("single")), fmt(2, reps, pick("hinge")), fmt(3, perSide, pick("core")), fmt(3, calf, pick("calf"))] };
  // Trail focus (the owner's choice for a mountain ultra): the second session is back and core instead of chest and
  // shoulders, and the single-leg work leans on step-ups. Two core exercises, never the same two as the week before.
  if (focus === "trail") {
    B.focus = t("Ryg og core");
    B.exercises = [fmt(sets, reps, pick("pull")), fmt(3, "10–12", pick("back")), fmt(3, perSide, pick("core")), fmt(3, perSide, pick("core", 1)), fmt(3, "40 m", pick("carry"))];
  }
  const sessions = [A, B, C].slice(0, n).map((s) => ({ ...s, minutes: 10 + 6 * s.exercises.length + (body === "muscle" ? 10 : 0), rest }));
  return { sessions, daily, note: t(note), rotates: true };
}

// Which weekdays get strength: days with time that are not the long run, not the quality day, and not the day
// before the long run, spread over the week. Falls back to Tuesday/Thursday.
export function pickLiftDays(sched = [], { longDay = 5, qualityDay = 2, count = 2 } = {}) {
  const n = Math.max(0, Math.min(3, count));
  if (!n) return [];
  const before = (longDay + 6) % 7;
  const order = [1, 3, 4, 0, 2, 6, 5]; // Tue, Thu, Fri, Mon, Wed, Sun, Sat
  const free = order.filter((i) => (sched[i]?.avail || "normal") !== "none" && i !== longDay && i !== qualityDay && i !== before);
  const some = free.length >= n ? free : order.filter((i) => i !== longDay);
  return some.slice(0, n).sort((a, b) => a - b);
}
