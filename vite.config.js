import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import pkg from "./package.json" with { type: "json" };

const sha = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev"; } })();
const built = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version} · ${sha} · bygget ${built}`) },
});
