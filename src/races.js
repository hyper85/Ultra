/* Known trail and ultra races Danish runners sign up for, as a shortcut in the questionnaire. Names and the usual
   distances only: dates change every year and must be checked on the race's own site, so the app never guesses one. */
export const RACES = [
  { name: "Salomon Hammer Trail", where: "Bornholm", km: [25, 50, 83], vert: 1200, url: "hammertrail.dk" },
  { name: "Hammer Trail Winter", where: "Bornholm", km: [25, 50, 83], vert: 1200, url: "hammertrail.dk" },
  { name: "Mols Bjerge Trail", where: "Mols Bjerge", km: [25, 50], vert: 900, url: "molsbjergetrail.dk" },
  { name: "Trailman", where: "Vejle Ådal", km: [25, 50], vert: 800, url: "trailman.dk" },
  { name: "Hærvejsmarathon", where: "Viborg", km: [21, 42], vert: 200, url: "haervejsmarathon.dk" },
  { name: "Copenhagen Marathon", where: "København", km: [42], vert: 50, url: "copenhagenmarathon.dk" },
  { name: "Kullamannen", where: "Mölle, Sverige", km: [50, 100, 161], vert: 2000, url: "kullamannen.se" },
  { name: "Lidingöloppet Ultra", where: "Lidingö, Sverige", km: [50], vert: 700, url: "lidingoloppet.se" },
];
// Vertical metres scaled to the chosen distance (the numbers above are for the longest distance).
export const vertFor = (race, km) => Math.round((race.vert * km) / Math.max(...race.km) / 50) * 50;
