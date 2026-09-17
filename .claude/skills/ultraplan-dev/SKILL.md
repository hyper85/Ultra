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
| `src/App.jsx` | Everything except the questionnaire: constants, `buildPlan()` (plan engine), state, sync, the five screens (I dag, Plan, Log, Træner, Mere) and the tab bar |
| `src/Onboarding.jsx` | First-login questionnaire (8 steps) plus `goalKcal`, `proteinG`, `dietTips`, `INJURY`, `DIETS` |
| Trænerplan vs. beregnet plan | `p.coachMode !== false` → `buildCoachPlan` uses `coach-plan.json` `weeks[]` as-is (fixed `start` dates from 2026-08-24, 23 weeks, "· trænerplan" in the headers); otherwise `buildPlan(p)` generates from `p.startDate`. The questionnaire (`Onboarding` `choose`) and an applied AI proposal set `coachMode: false` – that is why a re-run questionnaire shows "uge 1 af 20" instead of "uge 4 af 23". Guards: the questionnaire's last step shows a "Trænerplan · Din træner" card (only when `raceDate` equals the coach plan's race, or the profile is already on it) that sets `coachMode: true` and the coach plan's dates; "I dag" and "Plan" show `coachOfferBox` (red advice + "Brug trænerplanen") while a computed plan is shown for the coach's race. `coachContext.plan.kilde` tells the AI coach which plan is active. |
| `api/strava.js`, `supabase/strava.sql` | One function, `POST { op }`: `config` (public clientId), `exchange { code, scope }` (code → tokens, upserted into `strava_tokens` with the service role), `status`, `sync` (refreshes the token when < 5 min left, pages `/athlete/activities?after=` from last_sync − 3 days or 120 days back, returns `{ stravaId, startLocal, km, min, hr, type, name }`), `disconnect` (deauthorize + delete). Caller = Supabase Bearer token. Env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Client (`sync.js`): `stravaConnectURL` builds the authorize URL (state in `ultraplan-strava-state`, redirect = origin + pathname, scope `read,activity:read_all`), `stravaExchange/Status/Sync/Disconnect`. App: the `?code&state&scope` return is handled in an effect once `user && ready && pulled` (exchange → sync, opens Log), otherwise `status` + a silent sync once per load; `activityFromStrava` (import.js) maps to `mk` with source "Strava", file `strava:<id>`; `xLabel` maps Strava sport types to Danish. Test with the same-origin dummy build and `page.route("**/oauth/authorize**")` returning a 302 back with the state. |
| `src/strength.js` | `BODY` (keep/lean/muscle/fit), `GEAR` (none/home/gym), `buildStrength({ body, gear, phase, deload, isRace, count })` → `{ sessions: [{ key, name, focus, minutes, rest, exercises: [{ pattern, name, how, sets, reps, label }] }], daily, note }` (movement patterns × equipment, dose by phase, body goal changes sets/reps only, race week = none), `pickLiftDays(sched, { longDay, qualityDay, count })`, `DAILY_ANKLE`. |
| `src/nutrition.js` | `bmrOf`, `dayTypeOf({ km, isLong, isHard, isRace, lift })` → long/quality/easy/lift/rest, `dayTargets({ bmr, weight, body, goal, diet, dayType })` → kcal + P/C/F (lean −300, muscle +200 on lift/quality, floor 1.15 × BMR, carbs g/kg by day type, low-carb table), `weekTargets`, `mealIdeas({ diet, intol, dayType, body })` (carb vs protein variants, intolerance swaps). |
| `src/figures.jsx`, `src/Strength.jsx` | `Figure` inline SVG stick figures per pattern (matched by `pattern` or by name, English coach-plan names included); `StrengthSession` (figure + sets×reps + "Sådan" details) and `NutritionCard` (macros + meals details). |
| `src/import.js` | Date helpers (`ymd`, `parseLocal`, `addDays`, `mondayOf`), CSV/GPX/TCX/zip parsing, `readExcel` (an .xlsx is read with the same no-library zip reader: shared strings, `cellXfs` styles decide date/time cells, each sheet becomes CSV text `{ name, text }` and goes through the CSV parsers – `App.jsx` routes each sheet to wellness or activities and only reports side-sheet errors when no sheet gave data), activity classification, de-duplication, weekly totals; `isWellnessCSV` / `isReportCSV` / `wellnessFromCSV` turn Garmin reports into `{ monday: { sleep, hr, wt, vo2, hrv, stress, endurance } }` (`WELLNESS_METRICS` maps headers; daily rows are averaged per week, week labels like "Sep 8-14" / "Dec 30, 2025 - Jan 5, 2026" (unquoted commas split the label, glued back), month labels like "Oct 2025" fan out to that month's Mondays; unknown reports throw a Danish message instead of reaching the activity parser; a sheet with `Km`/`Tid`/`RPE`/`Min` headers is an activity list, never a report – `activitiesFromCSV` reads those columns so a hand-kept spreadsheet imports out of the box) |
| `src/sync.js` | Supabase client, code login (`verifyCode`), `pullRemote` / `pushRemote` |
| `src/insights.js` | `buildInsights()` – deterministic "what the app has learned" (adherence, skipped/extra weekdays, long-run completion, easy-run HR vs cap, aerobic efficiency, resting-HR drift, streak) with one-tap profile patches; `watchSummary()` – last N weeks from activities (km, runs, longest, HR, pace); `coachContext()` – anonymous JSON for the AI coach incl. `fra_uret_12_uger` |
| `api/invite.js` | Vercel function: signed-in user (Bearer access token, verified with the anon client) invites a friend via `auth.admin.inviteUserByEmail`; needs `SUPABASE_SERVICE_ROLE_KEY`. Client: `inviteFriend()` in `src/sync.js`, UI under Mere → Konto |
| `src/sessions.js` | `describeSession(quality, { maxHR, easyPace })` turns a session name ("6×2 min tærskel", "Bakker 8×90 s", "Løbstempo 2×15 min" …) into how-to-run text with the runner's HR numbers; `describeLong`, `describeEasy`. Shown on I dag and under the week on Plan |
| `src/coach.js` | Client for the AI coach: `askCoach()`, chat persisted in `ultraplan-coach` (device only, never synced), suggested questions |
| `api/coach.js` | Vercel serverless function: the AI coach. Provider by key: `OPENCODE_API_KEY` → OpenCode Zen (default `glm-5.3-flash`), `ZAI_API_KEY` → Z.ai (`https://api.z.ai/api/paas/v4`, default `glm-5.3-flash`), `ANTHROPIC_API_KEY` → Anthropic (`claude-opus-5`, effort medium, server-side fallbacks). Wire format follows the model id: `claude-…` → Anthropic Messages API (SDK, gateway baseURL), anything else → OpenAI-style `chat/completions` via plain fetch. `COACH_PROVIDER` / `COACH_MODEL` override. `mode: "plan"` asks for plan parameters as JSON (`peakScale, level, maxRunDays, longDay, currentKm, note`), clamped server-side; the app shows the diff and applies it with `setP` (also opens the long day as `long`). The model never writes the plan itself. 503 with a Danish message without a key, 502 naming the model when the provider does not know it. `vercel.json` excludes `/api/` from the SPA rewrite |
| Chat details | `.chat` is a fixed-height scroll window (`min(52vh, 460px)`, flex column, `chatRef` scrolls to the bottom on every change); `chatCompletion` uses `max_tokens` 8000 for thinking models and, when a reply has only `reasoning_content` and no `content`, re-asks once with a nudge in the last user message ("Svar direkte og kort på dansk …") and otherwise returns a 502 with a Danish message – reasoning text is never shown as the reply. `api/invite.js` maps Supabase's "not authorized" (built-in mailer only delivers to project members), "signups not allowed", rate limits and SMTP errors to Danish messages that name the Supabase setting to change. |
| `src/data/coach-plan.json` | The coach's fixed 23-week plan (trænerplan) used as-is when `coachMode` is on |
| `src/styles.css` | One file; later sections override earlier ones (a "polish layer" sits at the end) |
| `supabase/schema.sql` | Table `ultraplan_user_data` with row-level security |
| `supabase/email-*.html` | Branded Supabase email templates: magic link (code), confirm sign up (code), invite (link only), reset password (there is no password: it just sends a new code). Each carries `{{ .ConfirmationURL }}`; the code ones carry `{{ .Token }}` |
| `docs/ux-first-login.md` | UX brief the questionnaire was built from |

## Data model (localStorage keys, mirrored to Supabase when logged in)

- `ultraplan-profile` – the profile `p` (versioned with `v`; `migrateProfile()` upgrades old ones).
  Key fields: race (`raceName/raceDate/raceKm/raceVert`), body (`sex/age/height/weight/restHR/maxHR`),
  form (`level 1–4`, `currentKm`, `breakWeeks`), life (`family`, `maxRunDays`, `sched.A/B` with
  `avail none|short|normal|long`, `time`, `note`; `altWeeks/altStart` for deleordning), `goal`,
  `injury none|sore|injured`, `diet`, `intol[]`, `peakScale`, `startDate` (always a Monday), `onboarded`.
- `ultraplan-log` – keyed by the Monday of the week (`YYYY-MM-DD`): `{ km, rpe, hr, wt, sleep, vo2, hrv, stress, endurance, auto, rpeAuto, <field>Auto, n }`.
  `auto` = km came from activities, `<field>Auto` = imported from a Garmin report (typing clears the flag); vo2/hrv/stress/endurance are not shown in the table but feed insights and the coach context; never re-key by week number.
- Account switch: `ultraplan-owner` holds the user id the device's data belongs to; the login effect wipes the device (`clearLocal`) when the session's user differs from that mark or from the previous user in the tab (`prevUserRef`), shows "Skiftet til <e-mail>…" as sync message, and never pushes the old data to the new account. The pull races a 12 s timeout so the splash never hangs.
- Profile v5: `goal` is the race goal only (finish/perform); `body` is the body goal, `gear` the equipment, `liftDays` the strength weekdays (onboarding picks them with `pickLiftDays`; the coach plan uses its own). Migration v4→v5 turns `goal: "lean"` into `body: "lean"`. `strengthPlan` (App.jsx, after `cur`) is the coach's sessions or `buildStrength` for the current week; `sessionFor(ti)` maps a weekday to a session; `nutritionFor(dayType)` gives today's targets + meals; `coachExtra()` adds krop_mål/styrke/kost_i_dag to the AI context.
- Sessions without km (strength, HIIT, cycling …): `kind()` returns "strength" or "other"; `activitiesFromCSV` keeps km-0 rows of those kinds when they have minutes; `manualActivity({ type })` with `XTYPES`/`xLabel`; ids for km-0 sessions are `day-slot-x-<type>-<min>`; `findDuplicate` compares type + minutes (±20 %). `weeklyTotals` adds `xmin`, `xn`, `xload` (min × RPE, RPE 6 default) and `applyActivities` writes them to the week log; `loadOf` = km × RPE + xload ÷ 12 (half weight). In App: `otherByDay` (not counted, not hike, has minutes), `otherText`, the day form's type chips, ✓ marks on Ugen/Plan/Log tiles, today's `didOther`/`didStrength` decide `done` and the button labels ("Log styrken" on a run+lift day). `actKind` is the un-shadowed `kind` for the today block.
- `ultraplan-activities` – imported or typed runs keyed by id; `kind()` is recomputed at read time.
- `ultraplan-meta` (`updatedAt`) and `ultraplan-owner` (user id) drive sync and device isolation.

Every user-driven change goes through `setP`, `saveLog` or `saveActs`, which call `touch()` so the
debounced push runs. Loading and pulling use the raw setters so they never count as edits.

## Plan engine rules (buildPlan)

- Restart = current × 1.1 (floor 15 km, 12 for beginners); after a break/injury 65 % (floor 20). Week 1 of the build sits at the restart volume, never a jump.
- Weeks from `startDate` to `raceDate`, min 8. Phases: Genopbygning (4 weeks if `breakWeeks ≥ 2`
  or injured) → Opbygning → Ultra-prep → Nedtrapning (3). Deload every 4th build week / 3rd ultra week.
- Peak = min(peakTarget, restart × PEAK_MULT[level]) × peakScale, floored at restart × 1.1 and capped at 120;
  peakTarget = max(45, 0.95×race, 1.2×current) × injury factor. peakScale (Minimum 0.8 / Balanceret 1.0 / Volumen 1.15,
  and the AI proposal) scales the final top so the models always differ. Long run capped by LONG_FRAC[level] × race, max 50.
- Sessions are placed only on days with time: short days ≤ 8 km, long run on a `long` day (capped
  if none), quality on the best available day, back-to-back the day after the long run in ultra-prep.
  `unplaced` records what did not fit; the UI says so instead of inventing days.
- Injured: walk/run intervals in rebuild, one run day fewer, long run 5+3i km. Sore: first 3 build
  weeks without hills/intervals.

## ACWR

Load = km × RPE. ACWR = this week ÷ mean of the 4 previous calendar weeks, including weeks before
the plan (typed, imported, or assumed `currentKm × 5`). Estimates are marked with `~`. Advice uses
the last completed week, never the week in progress.
- Trænerråd (ACWR > 1.5, > 140 % of plan, or resting HR +7) rewrites the week in progress and stores it in `log[week].adjusted`. That write is derived state: it goes through the raw setters, never `touch()`, so a stale device cannot outrank the cloud copy.
- Today screen has three extra states: before the plan starts, race day (`Løbsdag`, race km), and after the race ("Sæt et nyt løb" reruns the questionnaire). A deload week is labelled "let uge", never "nedtrapning" (that is the taper phase).

## Build, test, ship

```bash
npm ci && npm run build            # Vite; version stamp comes from git sha via vite.config.js
npx vite preview --port 4174       # serve dist for tests
node scratch/test.mjs              # Playwright: import chromium from /opt/node22/lib/node_modules/playwright/index.mjs
# Auth/sync tests: build with a SAME-ORIGIN dummy Supabase URL (VITE_SUPABASE_URL=http://localhost:4175/sb) so Playwright page.route
# can fulfill /sb/auth/v1/user, /sb/auth/v1/token and /sb/rest/v1/** without CORS preflights (a cross-origin dummy host hangs the pull);
# the session key is then sb-localhost-auth-token. An invite link is http://localhost:4175/#access_token=…&refresh_token=…&type=invite.
# insights.js and api/coach.js are plain modules: unit-test them in node (mock the Anthropic endpoint with ANTHROPIC_BASE_URL).
```

Test like a first-time user: fresh storage (`addInitScript` to seed), `timezoneId: "Europe/Copenhagen"`,
viewport 390×844 and 1200×900, assert `document.documentElement.scrollWidth === viewport width`.
To test the login gate without real keys, build with dummy env vars and mock `**/auth/v1/**` routes.
Push to `main` deploys; the footer shows `version · sha · bygget <time>` so users can confirm.

## Supabase (once per project)

Env vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key); `OPENCODE_API_KEY`, `ZAI_API_KEY` or `ANTHROPIC_API_KEY` for the AI coach (`COACH_MODEL` picks the model). Run
`supabase/schema.sql`. Custom SMTP is required before email templates can be edited; the
"Magic link or OTP" template must contain `{{ .Token }}` for code login. URL Configuration needs the
Vercel URL as Site URL and `…/**` as redirect.

## Conventions

- Danish UI copy, du-form, sentence case, no marketing. Numbers in Barlow Condensed, body in Inter.
- One primary action per screen; settings live under "Mere"; nothing scrolls sideways on a phone.
- Desktop (≥ 1000 px): `main.wrap` is a two-column grid keyed by `data-view` (today: card | week + race; plan: week + guide | chart, table full width; coach: `.coach-grid` findings | chat; more: settings | zones + food). Phone stays one column, max 720 px.
- Keep the engine deterministic and explainable: every number the user sees should be traceable to
  an input, and estimates are labelled.
- Commit messages describe the user-visible change; the footer version is the release note.
