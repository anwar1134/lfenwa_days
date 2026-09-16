#!/usr/bin/env node
/* Build script for the Lfnawa Days shell + life-tracking features.
 * Lfenwa Trades (app/www/trades/) is a separate, pre-built, untouched
 * bundle and is NOT rebuilt here — see docs/ARCHITECTURE.md.
 *
 * Usage: node build.js
 * Requires: npm install (react, react-dom, react-icons, esbuild)
 */
const esbuild = require("esbuild");
const path = require("path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src/life/entry.jsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2019"],
    loader: { ".jsx": "jsx", ".js": "jsx" },
    outfile: path.join(__dirname, "life-bundle.js"),
    logLevel: "info",
  })
  .catch(() => process.exit(1));
