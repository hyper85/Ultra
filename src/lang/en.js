/* All English dictionaries in one chunk, loaded by i18n.js when English is chosen. */
import enApp from "./en-app.js";
import enScreens from "./en-screens.js";
import enEngine from "./en-engine.js";
import enRace from "./en-race.js";
import enCoach from "./en-coach.js";
export default { ...enEngine, ...enScreens, ...enApp, ...enRace, ...enCoach };
