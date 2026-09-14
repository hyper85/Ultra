# Ultraplan

Periodiseret ultra-træningsplan, pulszoner, kost og ACWR-belastningstjek – regner selv ud fra dine tal.
Bygget med Vite + React. PWA: kan lægges på hjemmeskærmen som app.

## Kør lokalt
    npm install
    npm run dev

## Deploy til Vercel (2 minutter)
1. Læg mappen i et GitHub-repo (eller kør `npx vercel` i mappen).
2. På vercel.com → Add New Project → vælg repoet. Framework: Vite. Build: `npm run build`. Output: `dist`.
3. Deploy. Du får en URL som https://ultraplan.vercel.app.

## På telefonen
- Android (Chrome): åbn URL'en → menu (⋮) → "Føj til startskærm" / "Installer app". Kører som app uden browserbjælke.
- iPhone (Safari): Del-knappen → "Føj til hjemmeskærm".
- Rigtig APK: kør `npx @capacitor/cli init` + `npx cap add android` og byg i Android Studio – eller brug pwabuilder.com, som pakker PWA'en til en APK/Play Store-pakke.

Data (profil + log) gemmes lokalt på enheden (localStorage). Ingen server, ingen konto.

## Login og sync (valgfrit)

Appen virker uden konto – alt gemmes lokalt på telefonen. Vil du kunne logge ind og få dine indstillinger,
log og importerede ture med på tværs af enheder, kobles den på et gratis Supabase-projekt:

1. Opret et projekt på https://supabase.com (Free plan rækker).
2. SQL Editor → indsæt indholdet af `supabase/schema.sql` → Run.
3. Authentication → URL Configuration: sæt *Site URL* til din Vercel-adresse (fx `https://ultra-lime-nu.vercel.app`)
   og tilføj den samme adresse under *Redirect URLs*.
4. Project Settings → API: kopier *Project URL* og *anon public*-nøglen.
5. Vercel → projektet → Settings → Environment Variables:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
6. Authentication → Email Templates → *Magic Link*: indsæt indholdet af `supabase/email-magic-link.html`
   som body og sæt Subject til `Din Ultraplan-kode: {{ .Token }}`. Skabelonen viser logoet, koden og et link.
7. Redeploy (Deployments → ⋯ → Redeploy). Appen viser nu en landingsside med login.

Login sker med en 6-cifret kode på mail (ingen adgangskode); linket i mailen virker også. Anon-nøglen er beregnet til at ligge i klienten;
adgangen til data styres af row level security i `schema.sql`, så hver bruger kun kan se sin egen række.

## Træner: det appen lærer om dig, og en AI-træner (valgfrit)

Under "Mere" → "Træner" viser appen, hvad den har lært af din log og dine ture: om du rammer planen, hvilke
dage der bliver sprunget over (og hvilke du løber på alligevel), om den lange tur bliver gennemført, om de
rolige ture er rolige nok, og om hvilepulsen stiger. Det hele er regnet deterministisk i `src/insights.js`, og
hver knap ændrer kun det, den siger (fx "Flyt løb fra onsdag til torsdag"). Det vigtigste fund vises også på
"I dag".

Samme sted kan du spørge en AI-træner (Claude), der får dine tal som kontekst – aldrig navn eller e-mail.
Den kører som en Vercel-funktion (`api/coach.js`) og kræver én miljøvariabel:

1. Opret en API-nøgle på https://console.anthropic.com.
2. Vercel → projektet → Settings → Environment Variables: `ANTHROPIC_API_KEY` = nøglen.
3. Redeploy. Uden nøglen viser appen en venlig besked i stedet for en chat.

Samtalen gemmes kun på enheden. Ikke lægefaglig rådgivning.
