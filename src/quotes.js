/* One line for the day. Chosen by the day's type and the date, so the same day shows the same line, and the line
   fits what the runner is about to do. Short, honest, no gloss. Attributed quotes are well-known and brief.
   Q is Danish, Q_EN the English set with the same keys and the same number of lines per key, so the same day picks
   the same line in both languages. */
import { getLang } from "./i18n.js";

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

const Q_EN = {
  rest: [
    "Rest is not a break from training. It is the half where the body builds.",
    "The best runner is the one still running in ten years.",
    "You don't get stronger from training. You get stronger from recovering from it.",
    "A rest day kept is an injury avoided.",
    "Sleep. It is the cheapest performance enhancer there is.",
  ],
  easy: [
    "Easy runs should feel too slow. That is the point.",
    "Slow is smooth, smooth is fast.",
    "The kilometres nobody sees are the ones that carry you to the finish.",
    "Run so easy you could sing. Then you are doing it right.",
    "Fitness is built in the easy weeks, not the heroic ones.",
  ],
  hard: [
    "The first interval should feel too easy. The last one is allowed to hurt.",
    "Hard is fine. Pain is stop.",
    "You don't need to be fast. You just need to be faster than last week.",
    "Quality is a few minutes, done properly.",
  ],
  long: [
    "Ultra is eating and walking with a bit of running in between.",
    "Start absurdly slow. Everyone who passes you in the first ten kilometres, you will see again.",
    "The long run is an exercise in patience, not pace.",
    "Walk the climbs. The hills don't care about your pride.",
    "Eat before you are hungry, drink before you are thirsty, walk before you have to.",
  ],
  lift: [
    "Strong hips are cheaper than a physiotherapist.",
    "Strength is the training you don't notice on the run, but in the injury that never comes.",
    "Heavy and short. Then the legs are fresh tomorrow.",
    "Calf raises are tendon training. Slowly down is the point.",
  ],
  taper: [
    "The taper feels wrong. That is how it is supposed to feel.",
    "You can't get fitter now. You can only get fresh.",
    "The hay is in the barn. Leave it there.",
  ],
  deload: [
    "An easy week is not a lost week. It is where the adaptation settles in.",
    "Ease off on purpose, so you don't have to ease off out of necessity.",
  ],
  race: [
    "You have done the work. Today you just let it happen.",
    "No new shoes, no new food, no new plans. Only what you have practised.",
  ],
  general: [
    "Consistency beats everything.",
    "You don't have to be good. You just have to show up.",
    "It isn't the mountains ahead to climb that wear you out; it's the pebble in your shoe. – Muhammad Ali",
    "The pain of discipline is lighter than the pain of regret.",
    "An ordinary life and an ultra can go together. It only takes planning and sleep.",
    "Run the kilometre you are in. The rest will come.",
  ],
};

const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);

/* quoteFor({ type, phase, deload, date }) -> string. type: rest | easy | hard | long | lift | race. */
export function quoteFor({ type = "general", phase, deload = false, date = new Date() } = {}) {
  const key = type === "race" ? "race" : phase === "Nedtrapning" && type !== "rest" ? "taper" : deload && type !== "rest" ? "deload" : Q[type] ? type : "general";
  const src = getLang() === "en" ? Q_EN : Q;
  const list = [...src[key], ...(key === "general" ? [] : src.general.slice(0, 2))];
  return list[dayOfYear(date) % list.length];
}
