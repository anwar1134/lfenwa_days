import type { NextConfig } from "next";

/**
 * output: "export" — Lfnawa Days has no API routes and no server-side
 * data fetching; every screen reads/writes IndexedDB in the browser.
 * A static export lets `next build` produce a plain folder of HTML/CSS/JS
 * (in `out/`) that can be served exactly the way the original project's
 * zero-dependency serve.js served `app/` — and the same output works
 * unmodified for the Electron desktop shell (desktop/server.js) and the
 * Capacitor Android shell (mobile/sync-www.js's webDir), which both need
 * a folder of static files, not a running Node server.
 *
 * `npm run start` (see package.json) serves that exported folder with
 * scripts/serve-export.js — a zero-dependency static server directly
 * adapted from the original app/serve.js, for platforms that expect a
 * `start` command rather than a static host.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
