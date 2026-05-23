/* Logo "ap" — handwritten Caveat + glyph linear */

type LogoVariant = "simple" | "casa" | "coracao" | "wordmark" | "argolas";

type Props = {
  variant?: LogoVariant;
  size?: number;
  className?: string;
};

export function Logo({ variant = "casa", size = 120, className }: Props) {
  const Comp = MAP[variant] ?? LogoCasa;
  return <Comp size={size} className={className} />;
}

// ── Glifos lineares ────────────────────────────────────────
function HouseGlyph({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 16 L 16 6 L 27 16 M 8 14 L 8 26 L 24 26 L 24 14 M 13 26 L 13 19 L 19 19 L 19 26" />
    </svg>
  );
}

function HeartGlyph({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 27 C 10 22, 4 18, 4 12 C 4 8, 8 5, 12 5 C 14 5, 15 7, 16 8 C 17 7, 18 5, 20 5 C 24 5, 28 8, 28 12 C 28 18, 22 22, 16 27 Z" />
    </svg>
  );
}

function RingsGlyph({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 32"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      aria-hidden
    >
      <circle cx="13" cy="16" r="9" />
      <circle cx="23" cy="16" r="9" />
    </svg>
  );
}

// ── Variantes ──────────────────────────────────────────────
function LogoSimple({ size, className }: { size: number; className?: string }) {
  return (
    <div className={className} style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span
        className="ap-script"
        style={{
          fontSize: size * 0.95,
          lineHeight: 0.85,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        ap.
      </span>
      <span
        style={{
          fontSize: size * 0.085,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: -4,
        }}
      >
        família augusto piffer
      </span>
    </div>
  );
}

function LogoCasa({ size, className }: { size: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.08,
        color: "var(--ink)",
      }}
    >
      <HouseGlyph size={size * 0.55} color="currentColor" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="ap-script"
          style={{
            fontSize: size * 0.88,
            lineHeight: 0.85,
            letterSpacing: "-0.01em",
          }}
        >
          ap
        </span>
        <span
          style={{
            fontSize: size * 0.082,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginTop: 2,
          }}
        >
          família ap
        </span>
      </div>
    </div>
  );
}

function LogoCoracao({ size, className }: { size: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.08,
        color: "var(--ink)",
      }}
    >
      <HeartGlyph size={size * 0.55} color="currentColor" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="ap-script"
          style={{ fontSize: size * 0.88, lineHeight: 0.85, letterSpacing: "-0.01em" }}
        >
          ap
        </span>
        <span
          style={{
            fontSize: size * 0.082,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginTop: 2,
          }}
        >
          família
        </span>
      </div>
    </div>
  );
}

function LogoWordmark({ size, className }: { size: number; className?: string }) {
  return (
    <div className={className} style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <svg
        width={size * 1.4}
        height={size * 0.5}
        viewBox="0 0 240 84"
        style={{ overflow: "visible" }}
        aria-label="família ap"
      >
        <text
          x="0"
          y="64"
          fontFamily="var(--font-caveat), cursive"
          fontWeight="700"
          fontSize="88"
          fill="var(--ink)"
          textLength="240"
          lengthAdjust="spacingAndGlyphs"
        >
          família ap
        </text>
      </svg>
      <span
        style={{
          fontSize: size * 0.085,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: 2,
          whiteSpace: "nowrap",
        }}
      >
        augusto · piffer · 2014
      </span>
    </div>
  );
}

function LogoArgolas({ size, className }: { size: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.06,
        color: "var(--ink)",
      }}
    >
      <RingsGlyph size={size * 0.62} color="currentColor" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="ap-script"
          style={{ fontSize: size * 0.88, lineHeight: 0.85, letterSpacing: "-0.01em" }}
        >
          a&p
        </span>
        <span
          style={{
            fontSize: size * 0.082,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginTop: 2,
          }}
        >
          família ap
        </span>
      </div>
    </div>
  );
}

const MAP: Record<LogoVariant, React.ComponentType<{ size: number; className?: string }>> = {
  simple: LogoSimple,
  casa: LogoCasa,
  coracao: LogoCoracao,
  wordmark: LogoWordmark,
  argolas: LogoArgolas,
};

export type { LogoVariant };
