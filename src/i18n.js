/* Language layer. Danish is the source language: every string in the code is written in Danish, and t() looks it
   up in the English dictionary when English is chosen. A string without an English entry is shown in Danish, so a
   missing translation never breaks a screen. The choice lives on the device (localStorage) and is read at start-up;
   a fresh install follows the phone's language, an install that already has a profile keeps Danish. */
import { useSyncExternalStore } from "react";
import enApp from "./lang/en-app.js";
import enScreens from "./lang/en-screens.js";
import enEngine from "./lang/en-engine.js";
import enRace from "./lang/en-race.js";

export const LANGS = [["da", "Dansk"], ["en", "English"]];
const KEY = "ultraplan-lang";
const DICT = { en: { ...enEngine, ...enScreens, ...enApp, ...enRace } };

const detect = () => {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "da" || s === "en") return s;
    if (localStorage.getItem("ultraplan-profile")) return "da";
  } catch { /* private mode */ }
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return /^da/i.test(nav) ? "da" : "en";
};
let current = detect();
const listeners = new Set();

export const getLang = () => current;
export const setLang = (l) => {
  if (l !== "da" && l !== "en") return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  try { document.documentElement.lang = l; } catch { /* ignore */ }
  listeners.forEach((f) => f());
};
try { document.documentElement.lang = current; } catch { /* ignore */ }

// React hook: the current language, re-rendering when it changes.
export const useLang = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang, getLang);

// BCP 47 tag for dates and numbers.
export const locale = () => (current === "da" ? "da-DK" : "en-GB");

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k]))) : s);

/* t("Uge {i} af {n}", { i, n }) -> "Week 3 of 23" in English, "Uge 3 af 23" in Danish. */
export const t = (s, vars) => {
  if (s == null) return s;
  const d = current === "da" ? s : DICT[current]?.[s] ?? s;
  return fill(d, vars);
};

/* Plural: tn(n, "1 uge", "{n} uger") -> the singular form when n === 1, else the plural; both go through t(). */
export const tn = (n, one, many, vars) => t(n === 1 ? one : many, { n, ...(vars || {}) });

// For tests and the dictionary check: every English entry.
export const dictionary = () => DICT;
