# AGENTS.md — Lfnawa Days

## 1. Project Identity

Lfnawa Days is an offline-first, local-first whole-life journal.

Current architecture:

- Next.js 15
- React 19
- TypeScript
- App Router
- Static export
- IndexedDB for local persistence
- Capacitor for Android
- Electron for desktop
- Lfenwa Trades embedded as an isolated existing application

The repository root is the current Next.js application.

Do not assume that the old static React architecture is still the current architecture.

---

## 2. Read These Files Before Architectural Changes

Before making significant architectural changes, read:

1. README.md
2. docs/ARCHITECTURE.md
3. docs/NEXTJS_MIGRATION.md
4. docs/BUILD.md

When documentation conflicts with the current code or with another project document,
do not guess.

Prefer the current Next.js implementation and docs/NEXTJS_MIGRATION.md for the
current application architecture.

If the conflict affects data, storage, packaging, or protected code, stop and
explain the conflict before making changes.

---

## 3. Current Directory Structure

Important paths:

- app/ — Next.js App Router routes
- components/life/ — life-journal UI components
- lib/storage.ts — life-journal storage layer
- types/ — shared TypeScript types
- public/ — static assets
- public/trades/ — embedded Lfenwa Trades application
- desktop/ — Electron desktop shell
- mobile/ — Capacitor Android shell
- legacy-web/ — preserved pre-Next.js application
- docs/ — architecture and build documentation

---

## 4. NON-NEGOTIABLE: Lfenwa Trades Protection

Lfenwa Trades is an existing trading journal embedded inside Lfnawa Days.

Treat it as protected code.

Never:

- Rewrite Lfenwa Trades.
- Rebuild its bundle unnecessarily.
- Refactor it during unrelated work.
- Replace it with another implementation.
- Change its IndexedDB schema.
- Rename its database.
- Delete or recreate its database.
- Make Lfnawa Days write to its database.
- Merge its storage with the life application.

The trading database is:

esOrderFlowJournal

Lfnawa Days must only read trading data through the existing read-only bridge.

Do not create, replace, or redesign the trading-data bridge unless explicitly requested.
Reuse the existing read-only implementation.

Lfnawa Days must never write to esOrderFlowJournal.

Do not create an empty esOrderFlowJournal database on a fresh installation.

---

## 5. Lfnawa Days Database

The life application uses:

lfnawaDaysDB

Keep life data and trading data completely separate.

Do not rename lfnawaDaysDB without a deliberate migration plan.

---

## 6. Legacy Web Application

legacy-web/ contains the preserved pre-Next.js application.

Treat it as:

- recovery reference
- historical reference
- compatibility reference

Do not modify it during normal feature development.

---

## 7. Next.js Rules

The current application uses:

- Next.js App Router
- TypeScript
- React

Prefer the existing architecture and existing abstractions.

Do not:

- introduce a second application architecture
- replace Next.js
- rewrite working screens without a concrete requirement
- introduce unnecessary dependencies
- move the project back to the old architecture

Use small, focused changes.

---

## 8. Cross-Platform Requirement

The application targets:

- Web/PWA
- Android via Capacitor
- Linux desktop via Electron
- Windows desktop via Electron

Any important feature should consider all supported platforms.

Avoid browser-only APIs in shared code unless their behavior on Android and Electron is understood.

For persistent data, use the existing storage abstraction whenever possible.

---

## 9. Capacitor / Android

Android is a primary target.

Production flow:

Next.js build → static export → out/ → mobile/www → Capacitor → Android

Do not manually maintain a second copy of the web application inside mobile/www.

Do not commit generated Android build output unless explicitly required.

The current packaging toolchain requires Node 22.

---

## 10. Electron

Electron is the desktop shell.

Preserve:

- local serving
- stable-origin behavior
- backup behavior
- old-userdata migration
- security protections

Desktop packaging must use the current Next.js static export.

---

## 11. Service Worker

The service worker is part of the offline-first architecture.

Do not casually disable or replace it.

Be careful with:

- cache names
- cache versions
- /trades/
- update behavior
- stale cache cleanup

Changes must consider both Lfnawa Days and embedded Lfenwa Trades.

---

## 12. Data Safety

This application contains personal journal and trading data.

Never silently delete user data.

Before changing:

- IndexedDB schemas
- database names
- storage keys
- import/export
- backup logic
- migration logic

inspect the existing implementation first.

Destructive operations should require explicit confirmation.

---

## 13. Backup / Import / Export

Do not casually change backup formats.

When changing import/export:

1. Preserve backward compatibility where possible.
2. Test merge behavior.
3. Test replace behavior.
4. Verify that esOrderFlowJournal remains untouched by life-data operations.

---

## 14. Development Workflow

Before significant changes:

1. Inspect the existing implementation.
2. Identify the smallest safe change.
3. Make the change.
4. Run:

npm run typecheck
npm run build

5. Test the affected feature in the browser.
6. If mobile or desktop is affected, test the relevant shell when available.

Never claim that something was tested if it was not actually tested.

---

## 15. Git Safety

Do not:

- reset user work
- force-push
- delete branches
- rewrite history
- run destructive Git commands

unless explicitly requested.

Before large changes, inspect:

git status
git diff

Keep changes focused and reviewable.

---

## 16. Dependency Rules

Do not add dependencies just for convenience.

Before adding a dependency:

- Check whether existing code already provides the functionality.
- Consider bundle size.
- Consider offline operation.
- Consider Android compatibility.
- Consider Electron compatibility.
- Explain why the dependency is necessary.

Do not upgrade major framework versions for unrelated features.

---

## 17. AI Agent Behavior

Do not blindly rewrite large parts of the project.

Do not assume that cleaner architecture is automatically better.

Compatibility and data safety have priority over architectural purity.

When requirements are ambiguous:

1. Inspect the existing code.
2. Identify the affected architecture.
3. State the proposed change.
4. Prefer the smallest reversible implementation.

If a requested change conflicts with a non-negotiable rule in this file, stop and explain the conflict before modifying protected code.

---

## 18. Definition of Done

A normal feature is not complete merely because the code compiles.

Minimum verification:

npm run typecheck
npm run build

For UI changes, manually verify the affected screen.

For storage changes, verify persistence after reload.

For Android changes, run Android/Capacitor checks when the toolchain is available.

For Lfenwa Trades changes, verify that existing trading data remains intact.

---

## 19. Current Known Constraints

These are intentional:

- Lfenwa Trades remains embedded.
- esOrderFlowJournal remains separate from lfnawaDaysDB.
- Static export is required for the current Electron/Capacitor architecture.
- Android has not yet been verified on a real device in this environment.
- Desktop and Android packaging require their platform toolchains.
- Node 18 is currently sufficient for the existing web development workflow, but Node 22 is required for the current packaging toolchain.

Do not "fix" these constraints unless the project explicitly decides to change the architecture.

---

## 20. Default Principle

Preserve existing behavior.

Preserve existing data.

Make the smallest safe change.

Verify before claiming success.
