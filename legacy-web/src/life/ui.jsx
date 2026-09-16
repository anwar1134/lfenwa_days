import React from "react";

// Same palette family as the trading journal (app/src/trading-journal.jsx `C`)
// so Lfenwa Trades doesn't feel like a different app bolted on.
export const C = {
  bg: "#0E1416",
  bgAlt: "#0B1012",
  panel: "#141C20",
  panelRaised: "#1B252A",
  line: "#263237",
  lineSoft: "#1D282D",
  ink: "#E7ECEC",
  inkDim: "#8FA0A6",
  inkFaint: "#5B6B70",
  accent: "#D9A548",
  accentDim: "#8A6A32",
  good: "#7DA98B",
  goodDim: "#3C4C42",
  bad: "#C06A5C",
  badDim: "#4C332F",
  info: "#6C93B0",
};
export const SANS = { fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };
export const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };

export function Panel({ title, right, children, style }) {
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

export function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 5 }}>{label}</div>}
      {children}
      {hint && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputBase = {
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

export function TextInput({ value, onChange, placeholder, type = "text", mono }) {
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

export function NumberInput({ value, onChange, placeholder, step }) {
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

export function TextArea({ value, onChange, placeholder, rows = 3 }) {
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

export function SelectInput({ value, onChange, options, placeholder }) {
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

export function Segmented({ value, onChange, options }) {
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

// 0-10 rating: fast tap targets, no typing required (Part 6).
export function RatingScale({ value, onChange, max = 10 }) {
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

export const primaryBtn = {
  background: C.accent,
  color: "#191307",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  ...SANS,
};
export const ghostBtn = {
  background: "transparent",
  color: C.ink,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  cursor: "pointer",
  ...SANS,
};
export const dangerBtn = {
  background: "transparent",
  color: C.bad,
  border: `1px solid ${C.badDim}`,
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  cursor: "pointer",
  ...SANS,
};

export function Badge({ tone = "neutral", children }) {
  const map = {
    neutral: { bg: C.panelRaised, fg: C.inkDim, bd: C.line },
    good: { bg: C.goodDim, fg: C.good, bd: C.goodDim },
    bad: { bg: C.badDim, fg: C.bad, bd: C.badDim },
    accent: { bg: C.accentDim, fg: C.accent, bd: C.accentDim },
  };
  const t = map[tone] || map.neutral;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...SANS }}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }) {
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

export function ConfirmDelete({ onConfirm, label = "Delete" }) {
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

export function StatTile({ label, value, sub, tone }) {
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
export function MiniLineChart({ points, height = 90, max = 10, min = 0, color = C.accent }) {
  const w = 320;
  const h = height;
  const pad = 6;
  if (!points || points.length === 0) {
    return <div style={{ fontSize: 12, color: C.inkFaint, padding: "10px 0" }}>Not enough data yet.</div>;
  }
  const usableW = w - pad * 2;
  const usableH = h - pad * 2;
  const step = points.length > 1 ? usableW / (points.length - 1) : 0;
  const scaleY = (v) => pad + usableH - ((v - min) / (max - min || 1)) * usableH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * step} ${scaleY(p)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={pad + i * step} cy={scaleY(p)} r="2.2" fill={color} />
      ))}
    </svg>
  );
}

export function fmtDateLong(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function fmtDateShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
