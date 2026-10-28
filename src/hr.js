/* Heart-rate zones by heart-rate reserve (Karvonen), as Garmin and Strava do when set to "% of HRR": resting HR plus a
   share of (max − resting). 70 % with resting 49 and max 186 is 49 + 0.7 × 137 = 145. Without a usable resting HR the
   zones fall back to % of max. Every pulse number the app shows (zone table, easy/long caps, session guidance, the
   zone history on Overblik, the coach context) goes through these, so they always agree. */
export const usableRest = ({ maxHR, restHR } = {}) => { const r = +restHR; return r >= 30 && r <= 100 && +maxHR - r >= 60 ? r : 0; };
export const karvonen = (hp) => usableRest(hp) > 0;
// The pulse at a zone share (0.7 → the top of Z2). null without a max.
export const hrAt = (frac, hp = {}) => { if (!(+hp.maxHR > 0)) return null; const r = usableRest(hp); return Math.round(r ? r + frac * (hp.maxHR - r) : hp.maxHR * frac); };
// The zone share of a pulse: the inverse of hrAt.
export const hrShare = (hr, hp = {}) => { const r = usableRest(hp); return r ? (hr - r) / (hp.maxHR - r) : hr / hp.maxHR; };
