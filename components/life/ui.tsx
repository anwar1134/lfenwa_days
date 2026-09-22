"use client";
import React from "react";

// Same palette family as the trading journal (public/trades' own `C`)
// so Lfenwa Trades doesn't feel like a different app bolted on.
export const C = {
  bg: "#F4F7FB",
  bgAlt: "#EAF0F8",
  panel: "#FFFFFF",
  panelRaised: "#E3ECF8",
  line: "#D3DEEC",
  lineSoft: "#E4ECF6",
  ink: "#10203A",
  inkDim: "#44556F",
  inkFaint: "#5A6B85",
  accent: "#2563C9",
  accentDim: "#DCE8FB",
  good: "#1F7A4D",
  goodDim: "#DDF0E4",
  bad: "#B4382B",
  badDim: "#FBE1DD",
  info: "#2F6FA6",
} as const;
export const SANS = { fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };
export const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };

export function Panel({
  title,
  right,
  children,
  style,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 12, ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          {title && <div style={{ fontSize: 12, fontWeight: 700, color: C.inkDim, letterSpacing: 0.4, textTransform: "uppercase" }}>{title}</div>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label?: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 5 }}>{label}</div>}
      {children}
      {hint && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputBase: React.CSSProperties = {
  width: "100%",
  background: C.bgAlt,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  color: C.ink,
  padding: "9px 10px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  ...SANS,
};

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  value: string | number | undefined | null;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, ...(mono ? MONO : {}) }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | string | undefined | null;
  onChange: (v: number | "") => void;
  placeholder?: string;
  step?: string | number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? "any"}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      style={{ ...inputBase, ...MONO }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string | undefined | null;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value ?? ""}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, resize: "vertical", lineHeight: 1.4 }}
    />
  );
}

export type SelectOption = string | { value: string; label: string };

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | undefined | null;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputBase, appearance: "auto" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <option key={val} value={val}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

export function Segmented({
  value,
  onChange,
  options,
}: {
  value: string | undefined | null;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        const active = value === val;
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${active ? C.accent : C.line}`,
              background: active ? C.accentDim : C.bgAlt,
              color: active ? C.ink : C.inkDim,
              fontSize: 13,
              cursor: "pointer",
              ...SANS,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// 0-10 rating: fast tap targets, no typing required.
export function RatingScale({
  value,
  onChange,
  max = 10,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  max?: number;
}) {
  const arr = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {arr.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: `1px solid ${active ? C.accent : C.line}`,
              background: active ? C.accent : C.bgAlt,
              color: active ? C.bgAlt : C.inkDim,
              fontSize: 12,
              fontWeight: active ? 700 : 400,
              cursor: "pointer",
              ...MONO,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export const primaryBtn: React.CSSProperties = {
  background: C.accent,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  ...SANS,
};
export const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: C.ink,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  cursor: "pointer",
  ...SANS,
};
export const dangerBtn: React.CSSProperties = {
  background: "transparent",
  color: C.bad,
  border: `1px solid ${C.badDim}`,
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  cursor: "pointer",
  ...SANS,
};

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "accent"; children?: React.ReactNode }) {
  const map = {
    neutral: { bg: C.panelRaised, fg: C.inkDim, bd: C.line },
    good: { bg: C.goodDim, fg: C.good, bd: C.goodDim },
    bad: { bg: C.badDim, fg: C.bad, bd: C.badDim },
    accent: { bg: C.accentDim, fg: C.accent, bd: C.accentDim },
  } as const;
  const t = map[tone] || map.neutral;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...SANS }}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: React.ReactNode;
  message?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: "36px 16px", color: C.inkFaint }}>
      {Icon && <Icon size={28} style={{ marginBottom: 10, opacity: 0.6 }} />}
      <div style={{ fontSize: 14, color: C.inkDim, marginBottom: 4 }}>{title}</div>
      {message && <div style={{ fontSize: 12, marginBottom: 12 }}>{message}</div>}
      {actionLabel && (
        <button onClick={onAction} style={primaryBtn}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ConfirmDelete({ onConfirm, label = "Delete" }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = React.useState(false);
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} style={dangerBtn}>
        {label}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
        style={{ ...dangerBtn, background: C.badDim }}
      >
        Confirm delete
      </button>
      <button onClick={() => setArmed(false)} style={ghostBtn}>
        Cancel
      </button>
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? C.good : tone === "bad" ? C.bad : C.ink;
  return (
    <div style={{ background: C.panelRaised, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", minWidth: 90 }}>
      <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, ...MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Tiny dependency-free line chart (no recharts available offline) —
// enough for trend sparklines in Mind / Insights.
export function MiniLineChart({
  points,
  height = 90,
  max = 10,
  min = 0,
  color = C.accent,
}: {
  points: (number | null | undefined)[];
  height?: number;
  max?: number;
  min?: number;
  color?: string;
}) {
  const w = 320;
  const h = height;
  const pad = 6;
  const cleanPoints = points.filter((p): p is number => typeof p === "number");
  if (!cleanPoints || cleanPoints.length === 0) {
    return <div style={{ fontSize: 12, color: C.inkFaint, padding: "10px 0" }}>Not enough data yet.</div>;
  }
  const usableW = w - pad * 2;
  const usableH = h - pad * 2;
  const step = cleanPoints.length > 1 ? usableW / (cleanPoints.length - 1) : 0;
  const scaleY = (v: number) => pad + usableH - ((v - min) / (max - min || 1)) * usableH;
  const path = cleanPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * step} ${scaleY(p)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {cleanPoints.map((p, i) => (
        <circle key={i} cx={pad + i * step} cy={scaleY(p)} r={2.2} fill={color} />
      ))}
    </svg>
  );
}

export function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
