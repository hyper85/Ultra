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
6. Authentication → Email Templates: indsæt skabelonerne fra `supabase/` som body og sæt emnet:
   - *Magic link or OTP*: `email-magic-link.html`, emne `Din Ultraplan-kode: {{ .Token }}`
   - *Confirm sign up*: `email-confirm-signup.html`, emne `Velkommen til Ultraplan – din kode: {{ .Token }}`
   - *Invite user*: `email-invite.html`, emne `Du er inviteret til Ultraplan` (inviter fra Authentication → Users → Invite)
   - *Reset password*: `email-reset-password.html`, emne `Log ind i Ultraplan igen: {{ .Token }}`
   Alle skabeloner viser logoet, koden (hvor der er en) og en knap. Appen bruger ingen adgangskode, så "Reset password"
   forklarer bare, at man logger ind med en kode, og giver en ny.
7. Redeploy (Deployments → ⋯ → Redeploy). Appen viser nu en landingsside med login.

Login sker med en 6-cifret kode på mail (ingen adgangskode); linket i mailen virker også. Glemt adgangskode findes
derfor ikke: man beder bare om en ny kode.

**Inviter en ven** (Mere → Konto, når du er logget ind) sender Supabase-mailen *Invite user* via `api/invite.js`.
Det kræver én hemmelig miljøvariabel i Vercel: `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API →
service_role). Nøglen må aldrig ligge i klienten; funktionen tjekker, at afsenderen er logget ind, før den
inviterer. Du kan også invitere fra Supabase → Authentication → Users → Invite user. Anon-nøglen er beregnet til at ligge i klienten;
adgangen til data styres af row level security i `schema.sql`, så hver bruger kun kan se sin egen række.

## Træner: det appen lærer om dig, og en AI-træner (valgfrit)

Hver hård session i planen har en forklaring på, hvordan den løbes (puls, fart, pauser, opvarmning), på "I dag" og under ugen på "Plan". Rolige ture viser dit eget typiske rolige tempo, når uret har leveret nok ture.

Under fanen "Træner" viser appen, hvad den har lært af din log og dine ture: om du rammer planen, hvilke
dage der bliver sprunget over (og hvilke du løber på alligevel), om den lange tur bliver gennemført, om de
rolige ture er rolige nok, og om hvilepulsen stiger. Det hele er regnet deterministisk i `src/insights.js`, og
hver knap ændrer kun det, den siger (fx "Flyt løb fra onsdag til torsdag"). Det vigtigste fund vises også på
"I dag".

Motivation og form: "I dag" har hver dag én linje, der passer til dagens type (hvile, rolig, hård, lang, styrke,
løbsuge), og i starten af en ny uge en opsummering af sidste uge (km mod planen, andre pas, ACWR, søvn) med én
sætnings dom. Overblik viser "Form for din alder" og "Fitnessalder": VO2 max fra Garmins rapport, ellers anslået fra
hvile- og makspuls med alderskorrektion, sat mod Cooper Institutes normer for alder og køn. Tallet er et estimat.

Overblik: tryk på fanen Overblik (eller "Overblik ›" på "I dag") for en side med dine tal: denne uge mod planen,
snit sidste 4 uger, ACWR nu, længste tur, andre pas, hvor meget af planen du har ramt, og søvn, hvilepuls, VO2 max og
vægt, når loggen har dem. Under tallene: km pr. uge mod planen, ACWR over tid med det grønne bånd, måned for måned fra
uret, søvn og hvilepuls som kurver, og de mønstre appen har fundet. Logoet øverst fører altid til forsiden.

Strava-forbindelse: under Log → Strava trykker du "Forbind Strava" (kræver login). Derefter henter appen dine ture
selv, hver gang du åbner den: de sidste 120 dage første gang, og alt nyt siden sidst bagefter, gennem den samme
dublet-tjek som filimport. Garmin sender automatisk til Strava, når de er koblet sammen i Garmin Connect
(Indstillinger → Tilsluttede apps → Strava). Søvn, hvilepuls, HRV og VO2 max har Strava ikke, dem henter du stadig
som Garmin-rapporter.

Opsætning (én gang): opret en API-app på strava.com/settings/api med "Authorization Callback Domain" =
`ultra-lime-nu.vercel.app`; læg Client ID og Client Secret i Vercel som `STRAVA_CLIENT_ID` og `STRAVA_CLIENT_SECRET`
(Secret); kør `supabase/strava.sql` i Supabase → SQL Editor (tabellen `strava_tokens`, kun serveren kan læse den);
redeploy. `SUPABASE_SERVICE_ROLE_KEY` skal være sat. Tokens og Client Secret når aldrig browseren.

Log andet end løb: tryk på en dag og vælg Løb, Styrke, HIIT, Cykling eller Andet. Pas uden km gemmes med minutter og
RPE og tæller i ugens belastning som minutter × RPE med halv vægt i forhold til løb (en time HIIT ved RPE 8 vejer som
8 km rolig tur), så ACWR ser hele ugen. Dagen får et ✓ på "I dag", i planen og i loggen, og en styrkedag er først
"gjort", når styrken er logget. Garmins "Strength Training"- og HIIT-rækker importeres nu også fra Activities.csv.

Kroppen ud over løbet: i spørgeskemaet vælger du, hvad du vil med kroppen (holde vægten, tabe dig, bygge muskler
eller være fit), hvor mange styrkepas du vil have om ugen (0–3), og hvilket udstyr du har (ingen, håndvægte/elastik
eller fitnesscenter). Appen lægger styrkedagene på dage uden lang tur og bygger pas af syv bevægelser (squat, hoftebøj,
ét ben, pres, træk, core, læg) med tegninger og én sætning teknik pr. øvelse. Dosis følger planens fase: let i
genopbygning, tungt og kort i opbygning, vedligehold i ultra-prep, let i nedtrapning, intet i løbsugen. Vil du bygge
muskler, får du et sæt mere og 8–12 gentagelser; vil du tabe dig, får du flere gentagelser og kortere pauser.

Kosten følger dagen: "I dag" viser kcal, protein, kulhydrat og fedt for dagens type (lang tur, hård session, rolig
tur, styrke, hvile) og fire måltidsforslag, der passer til din kost og dine intolerancer. Vægttab er max 0,5 kg/uge og
aldrig under 1,15 × hvilestofskiftet. Hele ugens tal står under Mere → Kost, programmet under Mere → Styrke, og
AI-træneren kender både kropsmål, styrkepas og dagens kosttal.

Trænerplan eller beregnet plan: er trænerens uger slået til (Mere → Start), viser appen dem som de er med faste datoer,
og "I dag" og "Plan" skriver "· trænerplan". Spørgeskemaet og et anvendt AI-forslag slår trænerplanen fra og bygger i
stedet en plan fra din startdato. Sker det for trænerens løb, siger appen det med rødt på "I dag" og "Plan", og ét tryk
på "Brug trænerplanen" skifter tilbage; i spørgeskemaets sidste trin ligger trænerplanen som første kort.

Under Log → Hent kan du vælge alle filerne på én gang, også Garmins rapporter (Rapporter → vælg rapport → 1 år →
Eksportér). Appen forstår daglige, ugentlige og månedlige rækker og lægger tallene i loggen pr. uge:

| Rapport | Bliver til |
|---|---|
| Activities.csv (Aktiviteter → Eksportér CSV) | km, ture, puls og tempo pr. uge; base, ACWR, mønstre og planforslag |
| Sleep.csv (Rapporter → Søvn) | søvn i timer |
| Average Heart Rate / en tabel med "Resting" | hvilepuls (bruges af trænerrådet) |
| VO2 Max, HRV Status, vægt, stress, Endurance Score | VO2 max, HRV, vægt, stress, endurance score (bruges af træneren og fundene) |
| Average Pace, Average Speed, Total Distance, Total Activity Time, Fitness Age, Training Status, FTP | springes over med besked – tempo, distance og tid kommer fra turene, og tekstfelter kan ikke bruges |

Alle filer er valgfrie: kun aktiviteter er nok til base, ACWR, mønstre og planforslag. Resten lægger til.
Importerede tal er markeret med ⌚ i loggen, og et tal du selv skriver, vinder altid.

Excel virker også (.xlsx): en Garmin-fil du har åbnet og gemt i Excel, eller din egen log med kolonnerne Dato, Km og
gerne Tid og RPE. Hvert ark i arbejdsbogen læses for sig og behandles som en CSV-fil; ark med noter springes over.
Datoer og tider læses som Excel viser dem. Gamle .xls-filer skal først gemmes som .xlsx.

Har du hentet dine ture fra Garmin eller Strava (Log → Hent), kan træneren også forme planen: "Foreslå plan ud fra
mine tal" sender de sidste 12 uger fra uret (km, ture, længste tur, puls, tempo) med, og AI-træneren foreslår top,
niveau, løbedage, lang tur-dag og base. Appen viser forskellen, bygger selv planen af tallene, og intet ændres,
før du trykker Anvend.

Samme sted kan du spørge en AI-træner, der får dine tal som kontekst – aldrig navn eller e-mail. Den kører som
en Vercel-funktion (`api/coach.js`) og kræver én API-nøgle. Vælg én af tre udbydere og sæt nøglen under
Vercel → projektet → Settings → Environment Variables, og redeploy:

| Udbyder | Miljøvariabel | Standardmodel | Noter |
|---|---|---|---|
| OpenCode Zen (https://opencode.ai/zen) | `OPENCODE_API_KEY` | `glm-5.3-flash` | AI-gateway, betaling efter forbrug. Claude-modeller (`claude-…`) og GLM/Kimi/MiniMax/Qwen på samme nøgle. |
| Z.ai direkte (https://z.ai) | `ZAI_API_KEY` | `glm-5.3-flash` | GLM-modellerne fra producenten. |
| Anthropic (https://console.anthropic.com) | `ANTHROPIC_API_KEY` | `claude-opus-5` | Claude direkte. |

Modellen skiftes med `COACH_MODEL`, fx `glm-5.1`, `kimi-k2.6` eller `claude-sonnet-4-6`. Er flere nøgler sat,
vælger `COACH_PROVIDER=opencode|zai|anthropic`. Formatet følger modelnavnet: `claude-…` går via Messages-API'et,
alt andet via chat completions. Uden nøgle viser appen en venlig besked i stedet for en chat; findes modellen ikke
hos udbyderen, står det i chatten.

Samtalen gemmes kun på enheden. Ikke lægefaglig rådgivning.
