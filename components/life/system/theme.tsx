"use client";
import React from "react";
import { C } from "../ui";

/* ============================================================
   LFENWA SYSTEM — visual identity
   ============================================================
   Blue + white, clean, dark-friendly, a restrained glow.
   The System deliberately REUSES the app's dark surfaces (C.bg,
   C.panel, C.line …) so it sits inside Lfnawa Days instead of
   looking bolted on; only the accent colour differs (blue here,
   amber elsewhere). Nothing in ui.tsx is changed.
   ============================================================ */

export const SYS = {
  blue: "#4DA3FF",
  blueBright: "#8CC8FF",
  blueDim: "#1C3A5E",
  blueDeep: "#0C1B2E",
  blueLine: "#24486F",
  // Border of an interactive control at rest (e.g. an unchecked quest box): visibly a button on the dark panel (~3.9:1).
  blueControl: "#3F78B8",
  white: "#F3F8FF",
  glow: "rgba(77, 163, 255, 0.38)",
  glowSoft: "rgba(77, 163, 255, 0.13)",
  glowFaint: "rgba(77, 163, 255, 0.07)",
} as const;

/** The main "status window" card — a Panel style override. */
export const SYSTEM_WINDOW_STYLE: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: `linear-gradient(180deg, ${SYS.blueDeep} 0%, ${C.panel} 82%)`,
  border: `1px solid ${SYS.blueLine}`,
  boxShadow: `0 0 0 1px ${SYS.glowFaint}, 0 0 28px ${SYS.glowSoft}`,
};

/** Secondary System panels: same surface as the app, blue-tinted edge. */
export const SYSTEM_PANEL_STYLE: React.CSSProperties = {
  border: `1px solid ${SYS.blueLine}`,
};

/** A Panel `title` in System blue (Panel's own title colour is neutral grey). */
export function SysTitle({ children }: { children: React.ReactNode }) {
  return <span style={{ color: SYS.blue }}>{children}</span>;
}

/**
 * Shared CSS for System components. Render <SystemStyles /> once in any
 * screen that hosts them. Kept as real CSS (not inline) only because
 * inline styles cannot express `prefers-reduced-motion`.
 */
export const SYSTEM_CSS = `
  .lfsys-fill { transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
  @media (prefers-reduced-motion: reduce) {
    .lfsys-fill { transition: none !important; }
  }
`;

export function SystemStyles() {
  return <style>{SYSTEM_CSS}</style>;
}
