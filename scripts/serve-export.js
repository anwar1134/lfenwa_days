#!/usr/bin/env node
// Zero-dependency static file server for the Lfnawa Days Next.js static
// export (the `out/` folder produced by `next build`, since next.config.ts
// sets `output: "export"` — see that file for why).
//
// Needs nothing but Node.js itself — no npm install beyond what `next
// build` already required, no internet. This is the direct descendant of
// the original project's app/serve.js and desktop/server.js: same
// zero-dependency philosophy, same hardened path-traversal check
// (path.relative-based, immune to sibling-directory confusion like
// "out-evil"), same default port (8420).
//
// Run:  node scripts/serve-export.js   (after `next build`)
// Then open the printed http://localhost:... address in your browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8420;
const ROOT = path.join(__dirname, "..", "out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isInsideRoot(rootDir, candidatePath) {
  const rel = path.relative(rootDir, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolveRequestPath(root, reqPath) {
  // Static export with trailingSlash:true writes "/foo/" as "/foo/index.html".
  // Try the exact path first (covers hashed /_next/static/... assets and
  // files with extensions), then directory-style index.html, then a
  // ".html" sibling (covers trailingSlash-less deep links).
  const direct = path.normalize(path.join(root, reqPath));
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

  const asDir = path.normalize(path.join(root, reqPath, "index.html"));
  if (fs.existsSync(asDir)) return asDir;

  const asHtml = path.normalize(path.join(root, reqPath.replace(/\/$/, "") + ".html"));
  if (fs.existsSync(asHtml)) return asHtml;

  return direct; // let the caller's fs.readFile produce the 404
}

if (!fs.existsSync(ROOT)) {
  console.error(`\nNo "out/" folder found at ${ROOT}.\n`);
  console.error(`Run "npm run build" first (this runs "next build", which — because`);
  console.error(`next.config.ts sets output: "export" — writes a static site to out/).\n`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let reqPath;
  try {
    reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = resolveRequestPath(ROOT, reqPath);

  // Never serve anything outside out/ (path.relative-based — immune to
  // sibling-directory confusion, e.g. "out-secret").
  if (!isInsideRoot(ROOT, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\nLfnawa Days is running.\n`);
  console.log(`  Open this in your browser:  http://localhost:${PORT}\n`);
  console.log(`Leave this window open while you use the journal.`);
  console.log(`Press Ctrl+C to stop.\n`);
});
