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
