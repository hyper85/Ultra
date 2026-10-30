# Ultraplan til Google Play – tjekliste

Status pr. 30. oktober 2026. Ultraplan er en PWA (Vite + React på Vercel). Den kommer i Play Store som en
**Trusted Web Activity (TWA)**: en lille Android-app, der åbner sitet i fuld skærm. Koden forbliver én, og hver
Vercel-deploy opdaterer også Android-appen uden ny upload.

## 1. Beslutninger, der skal tages først (blokerer en offentlig udgivelse)

- [ ] **Strava og AI.** Stravas API-aftale fra november 2024 forbyder tredjepartsapps at bruge data fra Strava i
      AI-modeller. AI-træneren får i dag tal fra ture, der er hentet via Strava (km, puls, tempo). Muligheder:
      1. Træneren får kun tal, der ikke kommer fra Strava (Garmin, filer, indtastet, appens egne beregninger).
      2. Strava bliver kun en import, og AI-træneren slås fra for ture fra Strava.
      3. Skriftlig accept fra Strava.
      Indtil det er afklaret, skal appen ikke udgives offentligt med Strava + AI-træner.
- [ ] **Stravas brugergrænse.** En ny Strava API-app har begrænset kapacitet, indtil Strava har godkendt den. Ansøg om
      højere kapacitet, før andre end dig selv skal forbinde Strava. Følg Stravas brand-regler ("Connect with Strava"-knap,
      "Powered by Strava").
- [ ] **Garmin Personal API.** Nøglen er personlig. Tjek Garmins vilkår for, om en app til andre må bede brugere om
      deres egen nøgle. Alternativet er Garmins partnerprogram (sat på pause for nye ansøgninger i 2026).
- [ ] **AI-træneren koster penge pr. kald** (OpenCode Zen). Med flere brugere: loft pr. bruger pr. dag.
- [ ] **Domæne.** `ultra-lime-nu.vercel.app` virker, men et eget domæne (fx `ultraplan.dk`) er pænere i butikken og
      kan ikke tages fra dig. Skift domæne FØR Android-pakken bygges: domænet er bagt ind i pakken.

## 2. Krav fra Google Play

- [ ] **Udviklerkonto** (engangsbetaling). Nye personlige konti skal køre en lukket test med mindst 12 testere i
      14 dage, før appen kan gå i produktion.
- [x] **Sletning af konto i appen**: Mere → Konto → Slet min konto (api/account.js). Sletter Strava-forbindelse
      (tilbagekaldes hos Strava), Garmin-nøgle, synkroniserede data og login.
- [ ] **Web-side til sletning** (Play Console spørger efter en URL): en side, der forklarer, at man logger ind og
      bruger Mere → Konto → Slet min konto, eller skriver til kontakt-e-mailen.
- [ ] **Privatlivspolitik** på en offentlig URL. Udkast i `docs/privacy-draft.md`. Skal læses og udfyldes af dig.
- [ ] **Data safety-formularen** (Play Console). Se afsnit 4.
- [ ] **Health apps-erklæringen** (Play Console). Appen viser helbredsdata (puls, hvilepuls, søvn, HRV, vægt).
- [ ] **Indholdsvurdering** (spørgeskema) og **målgruppe** (voksne, ikke børn).
- [ ] **Butiksside**: ikon 512×512 (har vi), feature graphic 1024×500, mindst 2 telefon-screenshots, kort og
      lang beskrivelse på dansk og engelsk.

## 3. Teknik til Android-pakken

- [x] Manifest med id, scope, beskrivelse, sprog, retning, kategorier og et separat maskable-ikon
      (`public/icon-maskable-512.png`, motivet inden for Androids sikre cirkel).
- [x] Service worker og installérbar PWA.
- [x] Fejlgrænse: en fejl i én skærm viser et kort med "Prøv igen", aldrig en hvid side. En gammel kodefil efter en
      ny udgave giver én automatisk genindlæsning.
- [x] Ødelagte data på telefonen eller i skyen renses ved indlæsning (`src/sanitize.js`) i stedet for at låse appen.
- [ ] Byg pakken med **Bubblewrap** (`npx @bubblewrap/cli init --manifest https://<domæne>/manifest.webmanifest`)
      eller **PWABuilder** (pwabuilder.com → Android). Pakkenavn fx `dk.ultraplan.app`.
- [ ] Brug **Play App Signing**. Læg derefter `public/.well-known/assetlinks.json` med pakkenavn og SHA-256-fingeraftryk
      fra Play Console, så appen åbner uden browserbjælke.
- [ ] Login-linket fra mailen og Strava-login skal lande i appen: tjek redirect-URL'erne i Supabase og Strava med det
      endelige domæne.

## 4. Data safety – hvad appen gemmer

| Data | Hvorfor | Hvor |
|---|---|---|
| E-mail | login | Supabase (auth) |
| Profil: alder, køn, højde, vægt, hvilepuls, makspuls, mål, hverdag | plan, pulszoner, kost | på telefonen; i Supabase ved login |
| Træning: ture (dato, km, tid, puls, stigning, type), RPE, ugelog | log, belastning, plan | på telefonen; i Supabase ved login |
| Helbred: hvilepuls, søvn, HRV dag for dag | restitution, Overblik | på telefonen; i Supabase ved login |
| Strava-adgangsnøgler | hente ture | Supabase, kun serveren kan læse dem |
| Garmin-nøgle | hente hvilepuls, søvn, HRV | Supabase, kun serveren kan læse den |
| Spørgsmål til AI-træneren + tal uden navn og e-mail | svar fra træneren | sendes til OpenCode Zen pr. spørgsmål |
| Position | kun ved tryk på "løb nær mig", gemmes ikke | bruges i browseren |

Appen gemmer ikke GPS-spor. En FIT-fil læses for distance, tid, puls og højde, ikke for ruten. Ingen reklamer, intet
salg af data, ingen sporing på tværs af apps.

## 5. Ugentlig scanning

Hver uge kører en planlagt opgave `bash scripts/test-all.sh`, som rummer alle testsuiter, røgtesten over hele appen,
robusthedstesten med ødelagte data og fejlgrænsetesten. Den retter, hvad den finder, og rapporterer. Samme kommando kan
køres når som helst.
