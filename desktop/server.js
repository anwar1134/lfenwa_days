// Local static file server for the Electron shell.
// This is deliberately the same zero-dependency approach as the
// project's original app/../portable serve.js — just parameterized
// so it can serve the resolved app directory (dev vs. packaged) and
// report back which port it actually bound to.
//
// WHY A SERVER AT ALL (instead of loadFile("app/index.html") directly)?
// Two reasons:
//   1. bundle.js registers a Service Worker on load. Service workers
//      can only be registered on http(s) origins, not file:// — under
//      loadFile() that registration would silently fail every launch.
//   2. Serving over a *stable* http://127.0.0.1:<port> origin gives the
//      journal's IndexedDB database a fixed, predictable origin. If the
//      port changed between launches, Chromium would treat it as a
//      different origin and the journal would look "empty" even though
//      the old data still exists under the old origin. See
//      getStablePort() below for how the port is kept stable.
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

// Is `candidatePath` equal to, or strictly inside, `rootDir`?
//
// The naive check this replaces -- `filePath.startsWith(rootDir)` --
// has a classic prefix-confusion bug: if rootDir is "/home/x/app" (no
// trailing separator), a path resolving to "/home/x/app-evil/secret" or
// "/home/x/app2/secret" also satisfies `.startsWith(rootDir)`, even
// though it's a completely different, sibling directory. path.relative
// doesn't have this problem: it returns a path that starts with ".."
// whenever the target is outside rootDir, and only "" or a
// non-".."-leading relative path when it's genuinely inside (or is
// rootDir itself).
function isInsideRoot(rootDir, candidatePath) {
  const rel = path.relative(rootDir, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function createServer(rootDir) {
  const root = path.resolve(rootDir);

  return http.createServer((req, res) => {
    let reqPath;
    try {
      reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch (e) {
      // Malformed percent-encoding (e.g. a lone "%") -- reject instead
      // of letting decodeURIComponent's exception crash the request.
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    if (reqPath === "/") reqPath = "/index.html";

    // path.join+normalize collapses ".." segments arithmetically (it
    // doesn't touch the filesystem), which is exactly what's needed
    // here: it resolves what the path *would* point to without ever
    // following a symlink or touching disk, so isInsideRoot can check
    // it before any file access is attempted.
    const filePath = path.normalize(path.join(root, reqPath));

    if (!isInsideRoot(root, filePath)) {
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
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Attempts server.listen(port) exactly once, resolving on success and
// rejecting with the listen error (typically EADDRINUSE) on failure.
// The server is reusable across repeated calls: a failed .listen() call
// doesn't put the http.Server instance into any unusable state.
function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    server.removeAllListeners("error");
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

const HOME_PORT_RETRY_ATTEMPTS = 5;
const HOME_PORT_RETRY_DELAY_MS = 400;
const FALLBACK_PORT_RANGE = 24;

/**
 * Starts the server on a stable local origin.
 *
 * IndexedDB is origin-scoped, and the origin here is
 * `http://127.0.0.1:<port>` — so the port is not just a network detail,
 * it's effectively part of the journal's storage address. Silently
 * moving to a different port the moment the usual one is busy would
 * silently move the app to a different, empty-looking origin. This
 * function instead:
 *
 *   1. Retries the exact `homePort` (the port remembered from last
 *      launch, or 8420 by default) a few times with a short delay.
 *      This rides out the common transient case — a just-closed
 *      previous instance's socket still finishing its OS-level
 *      TIME_WAIT teardown — without ever leaving the origin the
 *      person's data actually lives under.
 *   2. Only if `homePort` is genuinely unavailable after those retries
 *      (something else is actually listening there) does it fall back
 *      to a nearby alternate port, so the app can still be used. The
 *      result says so explicitly via `isFallback: true` — callers
 *      (see desktop/main.js) are expected to tell the person plainly
 *      that this happened, rather than silently swapping origins.
 *
 * Callers should persist the port with `rememberPort()` only when
 * `isFallback` is false. A fallback is meant to be temporary: not
 * persisting it means the *next* launch tries the real home port
 * again on its own, instead of permanently drifting away from it the
 * first time something else briefly holds that port.
 */
async function startStableServer(rootDir, preferredPort) {
  const homePort = preferredPort || 8420;
  const server = createServer(rootDir);

  for (let attempt = 0; attempt < HOME_PORT_RETRY_ATTEMPTS; attempt++) {
    try {
      await tryListen(server, homePort);
      return { server, port: homePort, homePort, isFallback: false };
    } catch (err) {
      if (!err || err.code !== "EADDRINUSE") throw err;
      if (attempt < HOME_PORT_RETRY_ATTEMPTS - 1) await delay(HOME_PORT_RETRY_DELAY_MS);
    }
  }

  // homePort is genuinely unavailable (not just slow to release).
  // Fall back so the app is still usable, but say so explicitly.
  for (let i = 1; i <= FALLBACK_PORT_RANGE; i++) {
    const port = homePort + i;
    try {
      await tryListen(server, port);
      return { server, port, homePort, isFallback: true };
    } catch (err) {
      if (!err || err.code !== "EADDRINUSE") throw err;
    }
  }

  throw new Error(`Could not find a free local port near ${homePort} to serve the journal on.`);
}

module.exports = { startStableServer };
