"use client";
import React from "react";
import { C, Panel } from "../ui";

/**
 * Keeps a render-time failure inside the System from taking down the screen
 * that hosts it. Today wraps its System section in this, so if the System ever
 * breaks, Today still shows all of its existing life data.
 */
export default class SystemBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Lfenwa System failed to render:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Panel title="System">
          <div style={{ fontSize: 13, color: C.inkFaint }}>The System is unavailable right now. The rest of your day is unaffected.</div>
        </Panel>
      );
    }
    return this.props.children;
  }
}
