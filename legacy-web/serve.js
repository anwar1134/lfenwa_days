// Zero-dependency static file server for Lfnawa Days (embeds Lfenwa Trades).
// Needs nothing but Node.js itself — no npm install, no internet.
// Run:  node serve.js
// Then open the printed http://localhost:... address in your browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8420;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.normalize(path.join(ROOT, reqPath));
  // Never serve anything outside the www folder (path.relative-based —
  // immune to sibling-directory confusion, e.g. "www-secret").
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
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
