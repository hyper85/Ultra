/* Quick log: "8 km på 48 min, føltes tungt" → the fields of the log form. The text can be typed or dictated; the
   runner always sees the filled form and saves it themselves, so a wrong guess costs one correction, not a wrong log.
   Danish and English. → { type, km, min, rpe } with "" for what was not said, or null when nothing was understood. */
const num = (s) => +String(s).replace(",", ".");
const TYPES = [
  ["Strength", /\b(styrke\w*|vægt\w*|strength|weights?|gym|løft\w*)\b/i],
  ["HIIT", /\b(hiit|crossfit|cirkeltræning|circuit)\b/i],
  ["Ride", /\b(cykl\w*|cykel\w*|spinning|bike|biked|ride|rode|cycling)\b/i],
  ["Walk", /\b(gik|gå\w*|gang|vandr\w*|walk\w*|hik\w*)\b/i],
  ["Run", /\b(løb\w*|jog\w*|run|ran|running|tur|trail)\b/i],
];
const FEEL = [
  [9, /\b(maks\w*|max\w*|alt ud|all[- ]out|udmattet|exhausted)\b/i],
  [7, /\b(hårdt?|tungt?|sej\w*|hard|tough|heavy)\b/i],
  [5, /\b(moderat|ok|okay|fint?|middel|steady|moderate)\b/i],
  [3, /\b(let|nemt?|roligt?|stille|easy|light|relaxed)\b/i],
];

export function parseQuick(text) {
  const s = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  let km = "", min = "", rpe = "";
  const k = s.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kilometer\w*|k\b)/);
  if (k) km = num(k[1]);
  const clock = s.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (clock) {
    // 1:05:30 is hours; 48:30 is minutes; 1:15 with nothing else is read as hours and minutes when it would be an unlikely pace
    const [a, b, c] = [+clock[1], +clock[2], clock[3] != null ? +clock[3] : null];
    min = c != null ? a * 60 + b + Math.round(c / 60) : a <= 5 ? a * 60 + b : a + Math.round(b / 60);
  } else {
    const h = s.match(/(\d+(?:[.,]\d+)?)\s*(?:timer?|t\b|hours?|hrs?|h\b)/);
    const m = s.match(/(\d+)\s*(?:minutter|minutes|mins?|min\b|m\b)/);
    const total = (h ? num(h[1]) * 60 : 0) + (m ? +m[1] : 0);
    if (total > 0) min = Math.round(total);
  }
  const r = s.match(/\brpe\s*(\d{1,2})\b/) || s.match(/\b(\d{1,2})\s*\/\s*10\b/);
  if (r && +r[1] >= 1 && +r[1] <= 10) rpe = +r[1];
  else { const f = FEEL.find(([, re]) => re.test(s)); if (f) rpe = f[0]; }
  let type = (TYPES.find(([, re]) => re.test(s)) || [])[0] || null;
  if (!type) type = km ? "Run" : min ? "Workout" : null;
  if (!type || (!km && !min)) return null;
  if (type !== "Run" && type !== "Walk") km = "";
  return { type, km, min, rpe };
}

// The browser's own speech recognition (Chrome, Edge, Safari); null where it does not exist.
export const speechCtor = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null);
