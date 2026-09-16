/* Stick-figure pictograms for the strength exercises, one per movement pattern. Inline SVG, so they work
   offline and weigh nothing. Drawn in a 64×64 box with round strokes; colour follows the text. */

const P = {
  // legs bent, arms forward
  squat: ["M32 12a4 4 0 1 0 0.1 0", "M30 17 L26 32", "M26 32 L40 36 L38 52", "M26 32 L28 42 L24 52", "M30 20 L46 22", "M20 54 H44"],
  // hip hinge with a bar along the shins
  hinge: ["M42 16a4 4 0 1 0 0.1 0", "M24 30 L38 21", "M24 30 L27 52", "M24 30 L31 52", "M37 22 L38 40", "M30 40 H46", "M18 54 H46"],
  // rear lunge / split squat
  single: ["M32 10a4 4 0 1 0 0.1 0", "M32 15 L32 32", "M32 32 L44 36 L44 52", "M32 32 L24 48 L14 50", "M32 20 L26 30", "M32 20 L38 30", "M12 54 H50"],
  // push-up
  push: ["M52 32a4 4 0 1 0 0.1 0", "M46 36 L14 46", "M44 37 L44 52", "M14 46 L10 52", "M8 54 H56"],
  // pull-up on a bar
  pull: ["M32 16a4 4 0 1 0 0.1 0", "M16 8 H48", "M22 8 L28 20", "M42 8 L36 20", "M32 20 L32 36", "M32 36 L28 50", "M32 36 L36 50"],
  // overhead press
  press: ["M32 16a4 4 0 1 0 0.1 0", "M32 21 L32 38", "M32 38 L27 54", "M32 38 L37 54", "M28 24 L26 8", "M36 24 L38 8", "M18 8 H46"],
  // side plank
  core: ["M14 22a4 4 0 1 0 0.1 0", "M18 30 L54 46", "M18 30 L14 52", "M14 52 H26", "M18 30 L20 12", "M8 54 H56"],
  // farmer's carry
  carry: ["M32 12a4 4 0 1 0 0.1 0", "M32 17 L32 36", "M32 36 L24 54", "M32 36 L40 54", "M27 20 L24 40", "M37 20 L40 40", "M19 40 H29", "M35 40 H45"],
  // single-leg calf raise on a step
  calf: ["M32 10a4 4 0 1 0 0.1 0", "M32 15 L32 34", "M32 34 L33 42 L39 39", "M32 34 L26 42 L28 48", "M32 19 L44 26", "M26 44 H44 L44 56", "M14 56 H44"],
  // Copenhagen plank, top leg on a chair
  hip: ["M12 24a4 4 0 1 0 0.1 0", "M16 32 L52 30", "M16 32 L12 52", "M12 52 H24", "M36 31 L34 44", "M46 30 H58", "M48 30 L48 52", "M56 30 L56 52", "M8 54 H60"],
  // biceps curl with dumbbells
  curl: ["M32 12a4 4 0 1 0 0.1 0", "M32 17 L32 36", "M32 36 L27 54", "M32 36 L37 54", "M27 20 L24 34 L18 24", "M37 20 L40 34 L46 24", "M14 24 H22", "M42 24 H50"],
  // pogo hops, airborne
  hop: ["M32 8a4 4 0 1 0 0.1 0", "M32 13 L32 32", "M32 32 L30 46", "M32 32 L34 46", "M28 17 L18 24", "M36 17 L46 24", "M24 52 L27 49", "M40 52 L37 49", "M16 56 H48"],
  // daily ankle: single-leg balance
  ankle: ["M32 10a4 4 0 1 0 0.1 0", "M32 15 L32 34", "M32 34 L32 54", "M32 34 L24 42 L28 50", "M32 19 L20 22", "M32 19 L44 22", "M22 56 H42"],
};

// Match an exercise (by pattern key, or by name when the key is missing) to its figure.
const byName = (name = "") => {
  const n = name.toLowerCase();
  if (/copenhagen/.test(n)) return "hip";
  if (/lægløft|calf/.test(n)) return "calf";
  if (/udfald|split|bulgarian|lunge/.test(n)) return "single";
  if (/squat/.test(n)) return "squat";
  if (/dødløft|hoftehæv|nordic|rdl|deadlift|hip thrust|bridge/.test(n)) return "hinge";
  if (/armbøj|gulvpres|bænkpres|push-up|bench|floor press/.test(n)) return "push";
  if (/roning|pull-up|pulldown|row/.test(n)) return "pull";
  if (/pike|skulderpres|oh press|overhead|^press/.test(n)) return "press";
  if (/planke|pallof|plank/.test(n)) return "core";
  if (/bæring|carry/.test(n)) return "carry";
  if (/curl|dips|pushdown/.test(n)) return "curl";
  if (/hop|jump/.test(n)) return "hop";
  if (/balance|fodled|inversion|eversion/.test(n)) return "ankle";
  return "squat";
};

export default function Figure({ pattern, name, size = 56, className = "" }) {
  const key = P[pattern] ? pattern : byName(name);
  return (
    <svg className={`figure ${className}`} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[key].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
export const FIGURE_KEYS = Object.keys(P);
