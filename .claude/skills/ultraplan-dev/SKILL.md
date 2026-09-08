---
name: ultraplan-dev
description: Working knowledge of the Ultraplan app (repo hyper85/Ultra) – a Vite + React PWA for ultra-running plans with Strava/Garmin import, Supabase login and Vercel deploys. Use this skill whenever the task touches Ultraplan – its code, plan engine, questionnaire, import, login, layout, deploys or Supabase setup – even if the user just says "the app", "planen", "loggen" or pastes a screenshot of it. It tells you where things live, how to build and test with Playwright, how data and sync work, and the conventions that keep the app simple.
---

# Ultraplan – developer skill

Ultraplan is a Danish-language PWA: periodised ultra-running plan, heart-rate zones, nutrition and
ACWR load monitoring, built around the runner's everyday life. Local-first; optional Supabase login
syncs profile, log and activities. Deployed on Vercel from `main` (https://ultra-lime-nu.vercel.app).

## Where things live

| Path | What |
|---|---|
| `src/App.jsx` | Everything except the questionnaire: constants, `buildPlan()` (plan engine), state, sync, the four screens (I dag, Plan, Log, Mere) and the tab bar |
| `src/Onboarding.jsx` | First-login questionnaire (8 steps) plus `goalKcal`, `proteinG`, `dietTips`, `INJURY`, `DIETS` |
| `src/import.js` | Date helpers (`ymd`, `parseLocal`, `addDays`, `mondayOf`), CSV/GPX/TCX/zip parsing, activity classification, de-duplication, weekly totals |
| `src/sync.js` | Supabase client, code login (`verifyCode`), `pullRemote` / `pushRemote` |
| `src/styles.css` | One file; later sections override earlier ones (a "polish layer" sits at the end) |
| `supabase/schema.sql` | Table `ultraplan_user_data` with row-level security |
| `supabase/email-magic-link.html` | Branded login email with `{{ .Token }}` |
| `docs/ux-first-login.md` | UX brief the questionnaire was built from |

## Data model (localStorage keys, mirrored to Supabase when logged in)

- `ultraplan-profile` – the profile `p` (versioned with `v`; `migrateProfile()` upgrades old ones).
  Key fields: race (`raceName/raceDate/raceKm/raceVert`), body (`sex/age/height/weight/restHR/maxHR`),
  form (`level 1–4`, `currentKm`, `breakWeeks`), life (`family`, `maxRunDays`, `sched.A/B` with
  `avail none|short|normal|long`, `time`, `note`; `altWeeks/altStart` for deleordning), `goal`,
  `injury none|sore|injured`, `diet`, `intol[]`, `peakScale`, `startDate` (always a Monday), `onboarded`.
- `ultraplan-log` – keyed by the Monday of the week (`YYYY-MM-DD`): `{ km, rpe, hr, wt, sleep, auto, rpeAuto, n }`.
  `auto` = km came from activities; never re-key by week number.
- `ultraplan-activities` – imported or typed runs keyed by id; `kind()` is recomputed at read time.
- `ultraplan-meta` (`updatedAt`) and `ultraplan-owner` (user id) drive sync and device isolation.

Every user-driven change goes through `setP`, `saveLog` or `saveActs`, which call `touch()` so the
debounced push runs. Loading and pulling use the raw setters so they never count as edits.

## Plan engine rules (buildPlan)

- Weeks from `startDate` to `raceDate`, min 8. Phases: Genopbygning (4 weeks if `breakWeeks ≥ 2`
  or injured) → Opbygning → Ultra-prep → Nedtrapning (3). Deload every 4th build week / 3rd ultra week.
- Peak = min(peakTarget, restart × PEAK_MULT[level]); peakTarget = max(45, 0.95×race, 1.2×current)
  × peakScale × injury factor. Long run capped by LONG_FRAC[level] × race, max 50.
- Sessions are placed only on days with time: short days ≤ 8 km, long run on a `long` day (capped
  if none), quality on the best available day, back-to-back the day after the long run in ultra-prep.
  `unplaced` records what did not fit; the UI says so instead of inventing days.
- Injured: walk/run intervals in rebuild, one run day fewer, long run 5+3i km. Sore: first 3 build
  weeks without hills/intervals.

## ACWR

Load = km × RPE. ACWR = this week ÷ mean of the 4 previous calendar weeks, including weeks before
the plan (typed, imported, or assumed `currentKm × 5`). Estimates are marked with `~`. Advice uses
the last completed week, never the week in progress.

## Build, test, ship

```bash
npm ci && npm run build            # Vite; version stamp comes from git sha via vite.config.js
npx vite preview --port 4174       # serve dist for tests
node scratch/test.mjs              # Playwright: import chromium from /opt/node22/lib/node_modules/playwright/index.mjs
```

Test like a first-time user: fresh storage (`addInitScript` to seed), `timezoneId: "Europe/Copenhagen"`,
viewport 390×844 and 1200×900, assert `document.documentElement.scrollWidth === viewport width`.
To test the login gate without real keys, build with dummy env vars and mock `**/auth/v1/**` routes.
Push to `main` deploys; the footer shows `version · sha · bygget <time>` so users can confirm.

## Supabase (once per project)

Env vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key). Run
`supabase/schema.sql`. Custom SMTP is required before email templates can be edited; the
"Magic link or OTP" template must contain `{{ .Token }}` for code login. URL Configuration needs the
Vercel URL as Site URL and `…/**` as redirect.

## Conventions

- Danish UI copy, du-form, sentence case, no marketing. Numbers in Barlow Condensed, body in Inter.
- One primary action per screen; settings live under "Mere"; nothing scrolls sideways on a phone.
- Keep the engine deterministic and explainable: every number the user sees should be traceable to
  an input, and estimates are labelled.
- Commit messages describe the user-visible change; the footer version is the release note.
