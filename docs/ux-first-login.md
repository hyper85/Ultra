# Første login – UX brief

## Job to be done
Når jeg har tilmeldt mig et ultraløb og lige har logget ind for første gang, vil jeg svare på så lidt som muligt og alligevel få en plan og kosttal, jeg tror på, så jeg kan begynde at træne i denne uge.

## Principper anvendt
- Ét emne pr. skærm, seks korte skærme, synlig fremdrift ("3 af 6"), Tilbage virker altid.
- Målet først (løbet), kroppen bagefter. Motivation før måling.
- Live-hints hvor svaret har konsekvens: makspuls-estimat, "topper på ca. X km/uge".
- Resultatet er et valg mellem tre navngivne modeller med tallene, der adskiller dem, og en anbefaling.
- Ærlighed: får hverdagen ikke plads til planen, står det på resultatskærmen.
- Alt kan ændres bagefter; "Kør spørgeskemaet igen" ligger under "Dig".

## Flow
1. Velkommen – hvad du får, 3 minutter, én knap.
2. Løbet – navn, dato, distance, højdemeter, mål (gennemføre / tid / lettere).
3. Dig – køn, alder, højde, vægt, hvilepuls, makspuls (estimat vises).
4. Din form – niveau, km/uge nu, pause. Hint: "topper på ca. X km/uge".
5. Din hverdag – familie, løbedage, tid pr. dag med note, lang tur-dag.
6. **Din plan (aha)** – tre modeller side om side + kosttal. Vælg én → appen åbner med ugens plan.

## Skærme
### 1 Velkommen
- Overskrift: "Lad os bygge din plan". Tekst: tre linjer om hvad der sker. Knap: "Start".
### 2 Løbet
- Inputs: navn (tekst), dato (date, krævet, skal ligge efter i dag), distance km (decimal), højdemeter (numeric), mål (tre kort).
- Validering: dato mangler → "Skriv datoen for løbet". Under 8 uger → gul note: "Kort tid til løbet, planen bliver komprimeret".
### 3 Dig
- Køn (select), alder, højde, vægt, hvilepuls, makspuls (valgfri, placeholder med estimat).
- Hjælpetekst: "Køn bruges til kalorier og pulsestimat."
### 4 Din form
- Niveau (fire kort med beskrivelse), km/uge nu (numeric), uger uden løb (select).
- Live-hint: "Med X km/uge nu topper en balanceret plan på ca. Y km/uge".
### 5 Din hverdag
- Familie, løbedage om ugen, syv rækker: dag, tid (select), note (tekst). Lang tur-dag (kun dage med "Lang").
- Hjælpetekst: "Planen lægger kun løb på dage med tid. Deleordning kan slås til bagefter under Din hverdag."
### 6 Din plan
- Tre kort: Minimum / Balanceret (anbefalet) / Volumen. Pr. kort: løbedage, top km/uge, længste tur, timer/uge på toppen, kort tekst om hvem det passer til. Advarsel hvis hverdagen ikke kan rumme modellen.
- Kostpanel: hvilestofskifte, kcal pr. dagstype justeret efter mål, protein pr. dag.
- Knap pr. kort: "Vælg". Sekundær: "Tilbage".

## Efter onboarding
Profil gemmes med `onboarded: true`, `goal`, valgt `level` og `maxRunDays`. Kost-fanen bruger målet (lettere = −300 kcal/dag, tid = +100 kcal på kvalitetsdage). "Kør spørgeskemaet igen" under "Dig" nulstiller `onboarded` uden at slette svar.

## Succesmål
- Ny bruger når resultatskærmen på under 3 minutter uden at forlade flowet.
- Under 10 % vælger "Kør spørgeskemaet igen" inden for første uge.
- Første uges log har mindst én tur registreret (planen blev brugt).
