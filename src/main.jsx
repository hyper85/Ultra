import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { useLang, getLang, ensureLang } from "./i18n.js";
import "./styles.css";
// The whole app remounts when the language changes, so every string, memo and cached label is rebuilt.
function Root() { const lang = useLang(); return <App key={lang} />; }
// English words first (one small chunk), then the app; Danish needs nothing extra.
ensureLang(getLang()).then(() => createRoot(document.getElementById("root")).render(<Root />));
