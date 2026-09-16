const { app, Menu, shell, dialog } = require("electron");

function buildMenu({ getWindow, userDataDir, backupsDir, runBackupNow, appVersion, getAutoLaunchEnabled, setAutoLaunchEnabled }) {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Backup Now",
          accelerator: "CmdOrCtrl+B",
          click: async () => {
            const win = getWindow();
            try {
              const result = await runBackupNow();
              dialog.showMessageBox(win, {
                type: "info",
                title: "Backup saved",
                message: "A snapshot of your journal was saved to disk.",
                detail: result && result.filePath ? result.filePath : backupsDir,
              });
            } catch (err) {
              dialog.showMessageBox(win, {
                type: "error",
                title: "Backup failed",
                message: "Could not write an automatic backup.",
                detail: String((err && err.message) || err),
              });
            }
          },
        },
        {
          label: "Open Backups Folder",
          click: () => shell.openPath(backupsDir),
        },
        {
          label: "Open Data Folder",
          click: () => shell.openPath(userDataDir),
        },
        { type: "separator" },
        {
          label: "Start Lfnawa Days with system",
          type: "checkbox",
          checked: getAutoLaunchEnabled ? getAutoLaunchEnabled() : false,
          click: (menuItem) => {
            try {
              setAutoLaunchEnabled(menuItem.checked);
            } catch (err) {
              menuItem.checked = !menuItem.checked;
              dialog.showMessageBox(getWindow(), {
                type: "error",
                title: "Couldn't update setting",
                message: "Could not change the start-with-system setting.",
                detail: String((err && err.message) || err),
              });
            }
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit", label: "Quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      role: "windowMenu",
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Lfnawa Days",
          click: () => {
            dialog.showMessageBox(getWindow(), {
              type: "info",
              title: "Lfnawa Days",
              message: `Lfnawa Days ${appVersion}`,
              detail:
                "A local-first whole-life journal — days, memories, goals, habits, " +
                "money, and more — with Lfenwa Trades (an ES futures order-flow " +
                "trading journal) built in.\n\n" +
                "Your data is stored on this device only. Use Settings → " +
                "Export backup regularly, and see File → Backup Now " +
                "for automatic on-disk snapshots.",
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
