// Intentionally minimal. contextIsolation is on and nodeIntegration is
// off in main.js (standard, secure Electron config) — the renderer
// (the journal itself) runs exactly as it does in any browser and needs
// no Node/Electron APIs to function: storage is IndexedDB, exports are
// plain browser downloads, both work unmodified under Chromium.
//
// This file exists as the wiring point for later, optional additions —
// e.g. a `window.electronAPI.cloudSync(...)` bridge if/when Cloud Sync
// is added — without having to touch main.js's security settings then.
//
// const { contextBridge } = require("electron");
// contextBridge.exposeInMainWorld("electronAPI", { ... });
