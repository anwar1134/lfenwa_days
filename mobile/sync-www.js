// Copies ../out (the Next.js static export — see ../next.config.ts's
// `output: "export"` — used by the browser/PWA build, the Electron
// desktop shell, AND this Capacitor project) into ./www, which is
// Capacitor's standard webDir convention. Run this before every
// `cap sync` / `cap copy` — the "sync" and "open:android" npm scripts
// in package.json already do this automatically.
//
// NEXT.JS MIGRATION: this used to copy "../app" (the hand-written
// static site). Run `npm run build` (= `next build`) from the repo
// root first so "../out" exists. See docs/NEXTJS_MIGRATION.md.
//
// Plain Node, zero dependencies, so it works before `npm install` in
// THIS folder too (mobile/) — you still need the root project's own
// `npm install` + `npm run build` to have produced ../out first.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "out");
const DEST = path.join(__dirname, "www");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`\nNo "out/" folder found at ${SRC}.`);
  console.error(`Run "npm install && npm run build" from the repo root first ` + `(next build writes the static export to out/ because of output: "export" in next.config.ts).\n`);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);
console.log(`Synced ${SRC} -> ${DEST}`);
