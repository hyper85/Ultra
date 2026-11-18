/* Cloud sync between devices without losing anything. The cloud row is one blob (profile, log, activities); a device
   that was left open for days used to push its whole old copy and wipe what another device wrote meanwhile.
   Now every device remembers WHAT it changed since it last saw the cloud (`pending`): profile fields, log
   week+field pairs, activity ids. When the cloud turns out to be newer than what this device last saw, the cloud is
   the base and only this device's own changes are laid on top – field by field, so a phone's new weight for a week
   and a laptop's typed RPE for the same week both survive. Pure functions; App.jsx holds the state. */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const emptyPending = () => ({ profile: [], log: [], acts: [] });
export const hasPending = (pd) => !!pd && (pd.profile.length > 0 || pd.log.length > 0 || pd.acts.length > 0);

// The top-level keys whose values differ between two objects.
export const changedKeys = (prev = {}, next = {}) => {
  const out = [];
  for (const k of new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])) if (!same(prev?.[k], next?.[k])) out.push(k);
  return out;
};
// Log changes as "week|field" (a week that appears or goes as "week|*").
export const changedLogFields = (prev = {}, next = {}) => {
  const out = [];
  for (const w of changedKeys(prev, next)) {
    if (!prev?.[w] || !next?.[w]) { out.push(`${w}|*`); continue; }
    for (const f of changedKeys(prev[w], next[w])) out.push(`${w}|${f}`);
  }
  return out;
};
export const addPending = (pd, part, keys) => { if (!keys.length) return pd; const s = new Set(pd[part]); for (const k of keys) s.add(k); return { ...pd, [part]: [...s] }; };

/* mergeSync({ remote, local, pending }) -> { profile, log, activities }: the cloud with this device's own changes on top. */
export function mergeSync({ remote = {}, local = {}, pending = emptyPending() }) {
  const profile = { ...(remote.profile || {}) };
  for (const k of pending.profile) { if (local.profile && k in local.profile) profile[k] = local.profile[k]; else delete profile[k]; }
  const log = { ...(remote.log || {}) };
  for (const key of pending.log) {
    const [w, f] = key.split("|");
    if (f === "*") { if (local.log?.[w]) log[w] = { ...(log[w] || {}), ...local.log[w] }; else delete log[w]; continue; }
    if (!local.log?.[w]) continue; // the week went locally, but its "*" entry handles that
    const week = { ...(log[w] || {}) };
    if (f in local.log[w]) week[f] = local.log[w][f]; else delete week[f];
    log[w] = week;
  }
  const activities = { ...(remote.activities || {}) };
  for (const id of pending.acts) { if (local.activities?.[id]) activities[id] = local.activities[id]; else delete activities[id]; }
  return { profile, log, activities };
}
