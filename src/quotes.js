/* One line for the day. Chosen by the day's type and the date, so the same day shows the same line, and the line
   fits what the runner is about to do. Short, honest, no gloss. Attributed quotes are well-known and brief. */

const Q = {
  rest: [
    "Hvile er ikke en pause fra træningen. Det er den halvdel, hvor kroppen bygger.",
    "Den bedste løber er den, der stadig løber om ti år.",
    "Du bliver ikke stærkere af at træne. Du bliver stærkere af at komme dig efter det.",
    "En hviledag holdt er en skade undgået.",
    "Sov. Det er det billigste dopingmiddel, der findes.",
  ],
  easy: [
    "Rolige ture skal føles for langsomme. Det er meningen.",
    "Langsomt er glat, glat er hurtigt.",
    "Kilometerne, ingen ser, er dem, der bærer dig i mål.",
    "Løb så roligt, at du kunne synge. Så gør du det rigtigt.",
    "Formen bygges i de rolige uger, ikke i de heroiske.",
  ],
  hard: [
    "Første interval skal føles for let. Det sidste må godt gøre ondt.",
    "Hårdt er fint. Ondt er stop.",
    "Du behøver ikke være hurtig. Du skal bare være hurtigere end i sidste uge.",
    "Kvalitet er få minutter, gjort ordentligt.",
  ],
  long: [
    "Ultra er spisning og gang med lidt løb imellem.",
    "Start absurd roligt. Alle, der overhaler dig på de første ti kilometer, ser du igen.",
    "Den lange tur er en øvelse i tålmodighed, ikke i tempo.",
    "Gå stigningerne. Bakkerne er ligeglade med din stolthed.",
    "Spis før du er sulten, drik før du er tørstig, gå før du er nødt til det.",
  ],
  lift: [
    "Stærke hofter er billigere end en fysioterapeut.",
    "Styrke er den træning, du ikke mærker på løbeturen, men på skaden, der udebliver.",
    "Tungt og kort. Så er benene friske i morgen.",
    "Lægløft er senetræning. Langsomt ned er pointen.",
  ],
  taper: [
    "Nedtrapning føles forkert. Det er sådan, den skal føles.",
    "Nu kan du ikke blive bedre. Du kan kun blive frisk.",
    "Høet er i hus. Lad det ligge.",
  ],
  deload: [
    "En let uge er ikke en tabt uge. Det er der, tilpasningen sætter sig.",
    "Skru ned med vilje, så du slipper for at skrue ned af nød.",
  ],
  race: [
    "Du har gjort arbejdet. I dag skal du bare lade det ske.",
    "Ingen nye sko, intet nyt mad, ingen nye planer. Kun det, du har øvet.",
  ],
  general: [
    "Kontinuitet slår alt.",
    "Du behøver ikke være god. Du skal bare møde op.",
    "Det er ikke bjerget foran dig, der slider. Det er stenen i skoen. – Muhammad Ali",
    "Smerten ved disciplin er lettere end smerten ved fortrydelse.",
    "Et almindeligt liv og en ultra kan godt hænge sammen. Det kræver kun planlægning og søvn.",
    "Løb den kilometer, du er i. Resten kommer.",
  ],
};

const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);

/* quoteFor({ type, phase, deload, date }) -> string. type: rest | easy | hard | long | lift | race. */
export function quoteFor({ type = "general", phase, deload = false, date = new Date() } = {}) {
  const key = type === "race" ? "race" : phase === "Nedtrapning" && type !== "rest" ? "taper" : deload && type !== "rest" ? "deload" : Q[type] ? type : "general";
  const list = [...Q[key], ...(key === "general" ? [] : Q.general.slice(0, 2))];
  return list[dayOfYear(date) % list.length];
}
