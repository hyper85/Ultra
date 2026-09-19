import { LANGS, setLang, useLang } from "./i18n.js";

/* Two small buttons, Dansk / English. Placed on the landing page, the first questionnaire screen and under "Mere". */
export default function LangSwitch({ className = "" }) {
  const lang = useLang();
  return (
    <div className={`langswitch ${className}`} role="group" aria-label="Sprog / Language">
      {LANGS.map(([k, name]) => <button key={k} type="button" className={lang === k ? "on" : ""} aria-pressed={lang === k} onClick={() => setLang(k)} lang={k}>{name}</button>)}
    </div>
  );
}
