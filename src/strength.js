/* Strength for runners with a normal life. Two or three short sessions a week, built from movement patterns
   (squat, hinge, single-leg, push, pull, core, calf), chosen by the equipment the runner actually has, and
   dosed by the plan's phase and the body goal. Pure and deterministic, like the plan engine.
   Principle: strength supports the running. Heavy and short in the build, maintained in ultra-prep, light in the
   taper, nothing in race week. A runner who wants muscle gets more sets and reps, not more days than they have. */

export const BODY = [
  ["keep", "Holde vægten", "Kroppen som den er. Kosten holder vægten stabil, styrken holder dig hel."],
  ["lean", "Tabe mig", "Roligt underskud på ca. 300 kcal/dag, max 0,5 kg/uge, ekstra protein. Styrke i cirkler."],
  ["muscle", "Bygge muskler", "Lidt over behov på styrkedage, 3 styrkepas, flere sæt og gentagelser."],
  ["fit", "Være fit", "Stærk og udholdende. 2 styrkepas, vægten stabil, kosten følger arbejdet."],
];
export const GEAR = [
  ["none", "Uden udstyr", "Krop, trappe, stol og gulv. Kan laves i stuen."],
  ["home", "Håndvægte eller elastik", "Et par håndvægte eller en kettlebell og en elastik."],
  ["gym", "Fitnesscenter", "Stang, stativ, håndvægte og maskiner."],
];
export const bodyLabel = (k) => BODY.find(([x]) => x === k)?.[1] || "Holde vægten";
export const gearLabel = (k) => GEAR.find(([x]) => x === k)?.[1] || "Håndvægte eller elastik";

// One exercise per pattern per equipment level. "how" is the one sentence a tired runner needs.
const EX = {
  squat: {
    none: { name: "Squat med kropsvægt", how: "Fødder skulderbredt, ned til lårene er vandrette, hælene i gulvet. Langsomt ned, hurtigt op." },
    home: { name: "Goblet squat", how: "Hold håndvægten mod brystet, albuerne mellem knæene i bunden. Ryggen lang, hælene i gulvet." },
    gym: { name: "Back squat", how: "Stangen på øverste ryg, ned til lårene er vandrette. Vægt, du kan tage alle sæt med, med 2 gentagelser til gode." },
  },
  hinge: {
    none: { name: "Hoftehæv (glute bridge)", how: "Lig på ryggen, fødderne tæt på numsen, pres hoften op og klem bagdelen i 2 sekunder i toppen." },
    home: { name: "Rumænsk dødløft med håndvægte", how: "Skub hoften bagud med lange ben og lang ryg, vægtene tæt på benene, ned til du mærker baglåret. Op med hoften." },
    gym: { name: "Rumænsk dødløft", how: "Stangen glider langs benene, hoften bagud, ryggen lang. Stop, hvor baglåret spænder, og kør hoften frem." },
  },
  single: {
    none: { name: "Udfald bagud", how: "Træd bagud og sænk bagerste knæ mod gulvet. Forreste knæ over foden, overkroppen oprejst." },
    home: { name: "Split squat med håndvægte", how: "Et ben foran, et bagved, ned til bagerste knæ næsten rører gulvet. Vægtene hænger stille langs siderne." },
    gym: { name: "Bulgarian split squat", how: "Bagerste fod på en bænk, ned til forreste lår er vandret. Kraften fra hælen. Den bygger løbeben." },
  },
  push: {
    none: { name: "Armbøjninger", how: "Kroppen som en planke, albuerne 45 grader fra kroppen, brystet ned til en knytnæve fra gulvet. For svært: hænderne på en stol." },
    home: { name: "Gulvpres med håndvægte", how: "Lig på ryggen, pres vægtene op over brystet, sænk til overarmene rører gulvet." },
    gym: { name: "Bænkpres", how: "Skulderbladene samlet, fødderne i gulvet, stangen til brystet og op. Ikke hoppe med stangen." },
  },
  pull: {
    none: { name: "Roning under bordet", how: "Lig under et solidt bord, grib kanten, træk brystet op til bordet med kroppen som en planke." },
    home: { name: "Roning med håndvægt", how: "Den ene hånd og det ene knæ på en stol, træk vægten op til hoften med albuen tæt på kroppen." },
    gym: { name: "Pull-ups eller lat pulldown", how: "Træk til hagen er over stangen eller stangen ved brystet. Kan du ikke tage 5 pull-ups, så brug maskinen eller en elastik." },
  },
  press: {
    none: { name: "Pike push-ups", how: "Numsen i vejret som et omvendt V, sænk hovedet mod gulvet mellem hænderne, pres op. Skuldre og triceps." },
    home: { name: "Skulderpres med håndvægte", how: "Stående, vægtene ved skuldrene, pres lige op, spænd maven, så ryggen ikke svajer." },
    gym: { name: "Skulderpres med stang", how: "Stående eller siddende, stangen fra kravebenet til strakte arme. Let vægt, ren teknik." },
  },
  core: {
    none: { name: "Sideplanke", how: "På albuen, kroppen som en lige linje fra hoved til fod. Hoften må ikke synke. Skift side." },
    home: { name: "Pallof press med elastik", how: "Elastikken i siden, pres hænderne lige frem og hold 3 sekunder uden at rotere. Skift side." },
    gym: { name: "Pallof press i kabel", how: "Kablet i siden, pres hænderne lige frem, hold 3 sekunder, tilbage. Kroppen må ikke dreje. Skift side." },
  },
  carry: {
    none: { name: "Kufferbæring med vandflaske eller taske", how: "Gå 40 m med en tung taske i den ene hånd, skuldrene lige, skift hånd." },
    home: { name: "Farmer's carry", how: "En tung vægt i hver hånd, gå 40 m med lange skridt og høj brystkasse." },
    gym: { name: "Farmer's carry", how: "Tunge håndvægte eller trap bar, gå 40 m, skuldrene nede og bagud." },
  },
  calf: {
    none: { name: "Lægløft på ét ben på et trin", how: "Op på tæerne på ét ben, 3 sekunder ned til hælen er under trinnet. Lægløft er senetræning, langsomt ned er pointen." },
    home: { name: "Lægløft på ét ben med håndvægt", how: "Vægten i hånden på samme side, 3 sekunder ned under trinnet. Langsomt ned er pointen." },
    gym: { name: "Lægløft på ét ben med vægt", how: "I maskine eller med håndvægt, 3 sekunder ned. Akillessenen elsker langsomme, tunge gentagelser." },
  },
  hip: {
    none: { name: "Copenhagen plank", how: "Sideplanke med øverste ben på en stol, løft underkroppen. Lysken, som beskytter knæ og hofte. 20 sekunder pr. side." },
    home: { name: "Copenhagen plank", how: "Sideplanke med øverste ben på en stol, løft underkroppen. 20 sekunder pr. side." },
    gym: { name: "Copenhagen plank", how: "Sideplanke med øverste ben på en bænk, løft underkroppen. 20 sekunder pr. side." },
  },
  curl: {
    none: { name: "Nordic hamstring (let udgave)", how: "Knæl med fødderne fastholdt, læn dig langsomt frem så langt du kan styre, tag imod med hænderne." },
    home: { name: "Bicepscurl og triceps-dips", how: "Curl med håndvægte, dips på en stol. Til dig, der vil have arme, ikke til løbet." },
    gym: { name: "Bicepscurl og triceps-pushdown", how: "Rolige gentagelser, fuld bevægelse. Til dig, der vil have arme, ikke til løbet." },
  },
  hop: {
    none: { name: "Hop på stedet (pogo)", how: "Små, hurtige hop på forfoden med stive ankler, som et sjippetov uden reb. 20 sekunder." },
    home: { name: "Hop på stedet (pogo)", how: "Små, hurtige hop på forfoden med stive ankler. 20 sekunder." },
    gym: { name: "Kassehop", how: "Hop op på en lav kasse, land blødt, træd ned. Kraft og landing, ikke højde." },
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
   -> { sessions: [{ key, name, focus, minutes, exercises: [{ name, how, sets, reps, label }] }], daily, note } */
export function buildStrength({ body = "keep", gear = "home", phase = "Opbygning", deload = false, isRace = false, count = 2 } = {}) {
  const g = EX.squat[gear] ? gear : "home";
  const pick = (k) => ({ ...EX[k][g], pattern: k });
  const n = Math.max(0, Math.min(3, count));
  if (isRace || n === 0) return { sessions: [], daily: DAILY_ANKLE, note: isRace ? "Løbsuge: ingen styrke. Kun ankelrutinen og hvile." : "Ingen styrkepas valgt. Ankelrutinen hver dag er stadig en god idé." };
  const base = DOSE[phase] || DOSE.Opbygning;
  let sets = base.sets, reps = base.reps, rest = base.rest, note = base.note;
  // Body goal changes the dose, never the movements.
  if (body === "muscle" && phase !== "Nedtrapning") { sets += 1; reps = phase === "Genopbygning" ? "10–12" : "8–12"; rest = "90 s"; note = "Til muskler: et sæt mere, 8–12 gentagelser, og spis efter passet."; }
  if (body === "lean") { reps = phase === "Ultra-prep" ? "8" : "12–15"; rest = "45 s"; note = "Til vægttab: lidt lettere, flere gentagelser, kort pause. Styrken holder musklerne, mens vægten går ned."; }
  if (deload) { sets = Math.max(1, sets - 1); note = "Let uge: et sæt mindre. Teknik, ikke træthed."; }
  const A = { key: "A", name: "Styrke A", focus: "Ben og hofte", exercises: [fmt(sets, reps, pick("squat")), fmt(sets, reps, pick("hinge")), fmt(sets, `${reps}/ben`, pick("single")), fmt(3, "20 s/side", pick("hip")), fmt(3, "12/ben", pick("calf"))] };
  const B = { key: "B", name: "Styrke B", focus: "Overkrop og core", exercises: [fmt(sets, reps, pick("push")), fmt(sets, reps, pick("pull")), fmt(Math.max(2, sets - 1), reps, pick("press")), fmt(3, "40 m", pick("carry")), fmt(3, "8/side", pick("core"))] };
  if (body === "muscle") B.exercises.push(fmt(3, "10–12", pick("curl")));
  const C = { key: "C", name: "Styrke C", focus: body === "muscle" ? "Hele kroppen" : "Kraft og fjedre", exercises: body === "muscle"
    ? [fmt(sets, reps, pick("hinge")), fmt(sets, reps, pick("push")), fmt(sets, `${reps}/ben`, pick("single")), fmt(sets, reps, pick("pull")), fmt(3, "12/ben", pick("calf"))]
    : [fmt(3, "20 s", pick("hop")), fmt(2, `${reps}/ben`, pick("single")), fmt(2, reps, pick("hinge")), fmt(3, "8/side", pick("core")), fmt(3, "12/ben", pick("calf"))] };
  const sessions = [A, B, C].slice(0, n).map((s) => ({ ...s, minutes: 10 + 6 * s.exercises.length + (body === "muscle" ? 10 : 0), rest }));
  return { sessions, daily: DAILY_ANKLE, note };
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
