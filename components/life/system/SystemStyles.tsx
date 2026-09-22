"use client";
import React from "react";

/** Bar transition + its prefers-reduced-motion override (inline styles cannot express media queries). */
export const SYSTEM_CSS = `
  .lfsys-fill { transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
  @media (prefers-reduced-motion: reduce) { .lfsys-fill { transition: none !important; } }
`;

export default function SystemStyles() {
  return <style>{SYSTEM_CSS}</style>;
}
