# Icon source assets

These are the master icon files for `@capacitor/assets` (the official
Capacitor icon/splash generator). They are **not** used directly by the
app — Android needs them converted into a full `mipmap-*` set first.

This is the **Lfnawa Days** app icon (a sunrise-over-horizon mark) — the
outer app's launcher icon. Lfenwa Trades keeps its own distinct
bar-chart icon internally (`app/trades/icons/`), but only Lfnawa Days'
icon appears on the Android home screen, since Lfenwa Trades is a
section inside Lfnawa Days, not a separately-installed app.

- `icon.png` — 1024×1024, full icon with background and rounded corners.
  Used for the Play Store listing icon and as a fallback for older
  launchers that don't support adaptive icons.
- `icon-foreground.png` — 1024×1024, transparent background, just the
  glyph, shrunk to Android's adaptive-icon "safe zone" so it isn't
  clipped by the circle/squircle/rounded-square masks different
  launchers apply.
- `icon-background.png` — 1024×1024, flat `#0E1416` fill. The background
  layer for the same adaptive icon.

Generated at `#0E1416` background, `#D9A548` sun, `#7DA98B` horizon —
same palette family as Lfenwa Trades, so the two don't feel like
unrelated apps bolted together.

This is a first-pass placeholder icon (generated programmatically, not
hand-designed) — swap in real artwork whenever you like; nothing else
in the project depends on its exact appearance.

## Generating the actual Android icons

Requires Android Studio / the Android SDK to already be set up (the
generator itself needs internet the first time, to install):

```bash
cd mobile
npm install --save-dev @capacitor/assets
npx capacitor-assets generate --android
```

This reads the three files above and writes every density
(`mipmap-mdpi` … `mipmap-xxxhdpi`, plus the Play Store icon) directly
into `mobile/android/app/src/main/res/`. Re-run it any time you replace
these source files.
