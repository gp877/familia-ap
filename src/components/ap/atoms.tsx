import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ap/icon";

// ────────────────────────────────────────────────────────────
// Card — rounded surface, no shadows. Diferenciação por bg.
// ────────────────────────────────────────────────────────────
type CardProps = {
  children: ReactNode;
  pad?: number;
  raised?: boolean;
  className?: string;
  style?: React.CSSProperties;
};
export function Card({
  children,
  pad = 14,
  raised = false,
  className,
  style,
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: raised ? "var(--card)" : "var(--surf)",
        borderRadius: 16,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Pill — pequeno status (sem chips coloridos rainbow)
// ────────────────────────────────────────────────────────────
type PillTone = "muted" | "ok" | "alert" | "accent";
type PillProps = { children: ReactNode; tone?: PillTone };
export function Pill({ children, tone = "muted" }: PillProps) {
  const tones: Record<
    PillTone,
    { bg: string; fg: string; border?: string }
  > = {
    muted: { bg: "var(--card2)", fg: "var(--muted-d)" },
    ok: { bg: "transparent", fg: "var(--ok)", border: "var(--ok)" },
    alert: { bg: "transparent", fg: "var(--alert)", border: "var(--alert)" },
    accent: { bg: "transparent", fg: "var(--accent)", border: "var(--accent)" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        background: t.bg,
        color: t.fg,
        border: t.border ? `1px solid ${t.border}` : "none",
      }}
    >
      {children}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Money — R$ 1.234,56 com prefixo menor e centavos em opacidade
// ────────────────────────────────────────────────────────────
type MoneyProps = {
  value: number;
  size?: number;
  accent?: boolean;
  prefix?: string;
  sign?: string;
};
export function Money({
  value,
  size = 36,
  accent,
  prefix = "R$",
  sign,
}: MoneyProps) {
  const abs = Math.abs(value);
  const reais = Math.floor(abs).toLocaleString("pt-BR");
  const cents = String(Math.round((abs - Math.floor(abs)) * 100)).padStart(2, "0");
  return (
    <span
      className="ap-num"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        fontSize: size,
        color: accent ? "var(--accent)" : "var(--ink)",
      }}
    >
      <span style={{ fontSize: size * 0.55 }}>
        {sign}
        {value < 0 ? "−" : ""}
        {prefix}
      </span>
      <span>
        {reais}
        <span style={{ opacity: 0.55 }}>,{cents}</span>
      </span>
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// ListRow — icon · title/sub · trailing value
// ────────────────────────────────────────────────────────────
type ListRowProps = {
  icon?: IconName;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  valueSub?: ReactNode;
  color?: string;
  last?: boolean;
};
export function ListRow({
  icon,
  title,
  sub,
  value,
  valueSub,
  color,
  last,
}: ListRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: last ? "none" : "0.5px solid var(--line-d)",
      }}
    >
      {icon && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: "var(--card2)",
            color: color ?? "var(--ink-d)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={15} stroke={1.8} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      {value && (
        <div style={{ textAlign: "right" }}>
          <div className="ap-num" style={{ fontSize: 14, color: "var(--ink)" }}>
            {value}
          </div>
          {valueSub && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
              {valueSub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Progress bar fina
// ────────────────────────────────────────────────────────────
type ProgressProps = { value: number; h?: number; color?: string };
export function Progress({
  value,
  h = 4,
  color = "var(--accent)",
}: ProgressProps) {
  return (
    <div
      style={{
        background: "var(--card2)",
        height: h,
        borderRadius: h / 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// StackBar — categorias empilhadas
// ────────────────────────────────────────────────────────────
type StackBarSegment = { value: number; color: string };
type StackBarProps = { segments: StackBarSegment[]; h?: number; gap?: number };
export function StackBar({ segments, h = 6, gap = 2 }: StackBarProps) {
  return (
    <div
      style={{
        display: "flex",
        height: h,
        borderRadius: h / 2,
        overflow: "hidden",
        gap,
      }}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          style={{ flex: s.value, background: s.color, borderRadius: 1 }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sparkline — SVG simples com dot final
// ────────────────────────────────────────────────────────────
type SparklineProps = {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
  dot?: boolean;
};
export function Sparkline({
  data,
  w = 100,
  h = 28,
  color = "var(--accent)",
  fill = false,
  dot = true,
}: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 2 - ((v - min) / r) * (h - 4);
    return [x, y] as const;
  });
  const path = pts
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    )
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }} aria-hidden>
      {fill && (
        <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.12" />
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// MemberChips — A + C sobrepostos no header
// ────────────────────────────────────────────────────────────
type MemberChipsProps = { size?: number };
export function MemberChips({ size = 28 }: MemberChipsProps) {
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size,
          background: "var(--card2)",
          border: "1.5px solid var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          fontWeight: 700,
          color: "var(--ink)",
        }}
      >
        A
      </div>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size,
          background: "var(--accent)",
          border: "1.5px solid var(--bg)",
          marginLeft: -size * 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          fontWeight: 700,
          color: "var(--accent-on)",
        }}
      >
        C
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SectionRow — label de seção (eyebrow + chevron)
// ────────────────────────────────────────────────────────────
type SectionRowProps = {
  icon?: IconName;
  label: string;
  action?: ReactNode;
};
export function SectionRow({ icon, label, action }: SectionRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px 8px",
        color: "var(--muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <Icon name={icon} size={15} color="var(--muted)" stroke={1.8} />}
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted-d)" }}>
          {label}
        </span>
      </div>
      {action !== undefined && action !== null ? (
        typeof action === "string" ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{action}</span>
        ) : (
          action
        )
      ) : (
        <Icon name="chev" size={13} color="var(--muted)" stroke={2} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// BigNumber — hero data
// ────────────────────────────────────────────────────────────
type BigNumberProps = {
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
};
export function BigNumber({ value, sub, accent }: BigNumberProps) {
  return (
    <div style={{ padding: "0 20px 6px" }}>
      <div
        className="ap-num"
        style={{ fontSize: 36, color: accent ? "var(--accent)" : "var(--ink)" }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// UserBubble — pergunta do usuário (right-aligned, card)
// ────────────────────────────────────────────────────────────
export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "12px 20px 4px",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          background: "var(--card)",
          padding: "10px 14px",
          borderRadius: 18,
          borderBottomRightRadius: 6,
          fontSize: 14,
          lineHeight: 1.4,
          color: "var(--ink-d)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Insight — sparkle + texto da AP, fica acima do input
// ────────────────────────────────────────────────────────────
export function Insight({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: "12px 20px 6px",
        padding: "12px 14px",
        background: "var(--card)",
        borderRadius: 16,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 12.5,
        lineHeight: 1.45,
        color: "var(--ink-d)",
      }}
    >
      <Icon name="spark" size={16} color="var(--accent)" />
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ChatInput — sticky no rodapé "Converse com a AP"
// ────────────────────────────────────────────────────────────
export function ChatInput() {
  return (
    <div
      style={{
        margin: "8px 20px 0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        type="button"
        aria-label="Adicionar"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          background: "var(--card)",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Icon name="plus" size={18} />
      </button>
      <div
        style={{
          flex: 1,
          height: 36,
          borderRadius: 18,
          background: "var(--card)",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          fontSize: 13,
        }}
      >
        Converse com a AP
      </div>
      <button
        type="button"
        aria-label="Microfone"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          background: "var(--accent)",
          color: "var(--accent-on)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Icon name="mic" size={16} color="var(--accent-on)" stroke={2} />
      </button>
    </div>
  );
}
