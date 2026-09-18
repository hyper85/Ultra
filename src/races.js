/* Known trail and ultra races Danish runners sign up for, as a shortcut in the questionnaire. Names and the usual
   distances only: dates change every year and must be checked on the race's own site, so the app never guesses one. */
export const RACES = [
  { name: "Salomon Hammer Trail", where: "Bornholm", km: [25, 50, 83], vert: 1200, url: "hammertrail.dk", lat: 55.28, lon: 14.76 },
  { name: "Hammer Trail Winter", where: "Bornholm", km: [25, 50, 83], vert: 1200, url: "hammertrail.dk", lat: 55.28, lon: 14.76 },
  { name: "Mols Bjerge Trail", where: "Mols Bjerge", km: [25, 50], vert: 900, url: "molsbjergetrail.dk", lat: 56.22, lon: 10.55 },
  { name: "Trailman", where: "Vejle Ådal", km: [25, 50], vert: 800, url: "trailman.dk", lat: 55.71, lon: 9.54 },
  { name: "Hærvejsmarathon", where: "Viborg", km: [21, 42], vert: 200, url: "haervejsmarathon.dk", lat: 56.45, lon: 9.40 },
  { name: "Copenhagen Marathon", where: "København", km: [42], vert: 50, url: "copenhagenmarathon.dk", lat: 55.68, lon: 12.57 },
  { name: "Kullamannen", where: "Mölle, Sverige", km: [50, 100, 161], vert: 2000, url: "kullamannen.se", lat: 56.28, lon: 12.50 },
  { name: "Lidingöloppet Ultra", where: "Lidingö, Sverige", km: [50], vert: 700, url: "lidingoloppet.se", lat: 59.37, lon: 18.14 },
];
// Vertical metres scaled to the chosen distance (the numbers above are for the longest distance).
export const vertFor = (race, km) => Math.round((race.vert * km) / Math.max(...race.km) / 50) * 50;

// Distance in km between two points (haversine), for "races near me".
export const distanceKm = (lat1, lon1, lat2, lon2) => { const R = 6371, d = (x) => (x * Math.PI) / 180; const a = Math.sin(d(lat2 - lat1) / 2) ** 2 + Math.cos(d(lat1)) * Math.cos(d(lat2)) * Math.sin(d(lon2 - lon1) / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(a))); };
// The phone's position, only when the runner asks for it. Resolves null when denied or unavailable.
export const myPosition = () => new Promise((ok) => { if (!navigator.geolocation) return ok(null); navigator.geolocation.getCurrentPosition((pos) => ok({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => ok(null), { timeout: 8000, maximumAge: 600000 }); });
