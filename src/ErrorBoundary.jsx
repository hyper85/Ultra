import { Component } from "react";
import { t } from "./i18n.js";

/* A crash in one screen must never white-screen the app, and never touches the runner's data (it lives in
   localStorage and the cloud, not in React state that a crash could lose).
   - `full`: the whole app (main.jsx). A full-screen card: reload, or copy the error for a bug report.
   - otherwise: one panel (Overblik, Løbsdag, the questionnaire). An inline card with "Prøv igen", the rest keeps working.
   After a deploy a phone that kept the app open may ask for a code chunk that no longer exists ("Failed to fetch
   dynamically imported module"): that is not a bug, a reload fixes it, so it reloads once by itself. */
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically imported/i;
const RELOAD_KEY = "ultraplan-chunk-reload";

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("Ultraplan:", this.props.area || "app", error, info?.componentStack);
    if (STALE_CHUNK.test(String(error?.message || error))) {
      let last = 0; try { last = +sessionStorage.getItem(RELOAD_KEY) || 0; } catch { /* storage blocked */ }
      if (Date.now() - last > 60_000) { try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ } window.location.reload(); }
    }
  }
  reset = () => this.setState({ error: null });
  copy = () => { const e = this.state.error; const text = `Ultraplan ${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : ""}\n${this.props.area || "app"}: ${e?.message || e}\n${(e?.stack || "").split("\n").slice(0, 6).join("\n")}`; try { navigator.clipboard?.writeText(text); } catch { /* not allowed */ } };
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = STALE_CHUNK.test(String(error?.message || error));
    const msg = stale ? t("Der er kommet en ny udgave af appen. Genindlæs for at fortsætte.") : t("Noget gik galt her. Dine data er gemt og ikke rørt.");
    if (this.props.full) return (
      <div className="crash full" role="alert">
        <h1>Ultraplan</h1>
        <p>{msg}</p>
        <div className="crash-row">
          <button type="button" className="btn" onClick={() => window.location.reload()}>{t("Genindlæs")}</button>
          {!stale && <button type="button" className="btn ghost" onClick={this.copy}>{t("Kopiér fejlen")}</button>}
        </div>
        {!stale && <details><summary>{t("Detaljer")}</summary><code>{String(error?.message || error)}</code></details>}
      </div>
    );
    return (
      <div className="panel crash" role="alert">
        <p>{msg}</p>
        <div className="crash-row">
          {stale ? <button type="button" className="btn" onClick={() => window.location.reload()}>{t("Genindlæs")}</button>
            : <button type="button" className="btn" onClick={this.reset}>{t("Prøv igen")}</button>}
          {!stale && <button type="button" className="btn ghost" onClick={this.copy}>{t("Kopiér fejlen")}</button>}
        </div>
      </div>
    );
  }
}
