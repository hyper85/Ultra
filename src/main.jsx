import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { useLang } from "./i18n.js";
import "./styles.css";
// The whole app remounts when the language changes, so every string, memo and cached label is rebuilt.
function Root() { const lang = useLang(); return <App key={lang} />; }
createRoot(document.getElementById("root")).render(<Root />);
