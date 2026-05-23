import { cn } from "@/lib/utils";

type Props = {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  variant?: "mark" | "lockup";
  className?: string;
};

const markSize = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
  "2xl": "h-24 w-24",
} as const;

/**
 * Logomarca Família AP.
 *
 * "mark": apenas o símbolo (quadrado com cantos generosos + monograma AP serif
 *   + crescente que simboliza "casa/abraço/proteção familiar"). Gradiente
 *   coral/terracota com leve ring interno.
 *
 * "lockup": símbolo + wordmark "Família AP" em duas linhas.
 */
export function BrandMark({ size = "md", variant = "mark", className }: Props) {
  const mark = <MarkSymbol className={cn(markSize[size], "shrink-0", className)} />;

  if (variant === "mark") return mark;

  return (
    <div className="flex items-center gap-2.5">
      {mark}
      <div className="leading-tight">
        <div className="font-display text-base italic text-foreground">
          Família<span className="not-italic font-sans font-semibold ml-1">AP</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          plataforma da família
        </div>
      </div>
    </div>
  );
}

function MarkSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Família AP"
      className={className}
    >
      <defs>
        <linearGradient id="ap-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.17 38)" />
          <stop offset="55%" stopColor="oklch(0.62 0.19 28)" />
          <stop offset="100%" stopColor="oklch(0.50 0.20 22)" />
        </linearGradient>
        <linearGradient id="ap-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Squircle — cantos suaves estilo "boutique" */}
      <path
        d="M32 1c11 0 17.5 0 22.5 4.5C59 9.5 63 16 63 27v10c0 11-4 17.5-8.5 21.5C49.5 63 43 63 32 63s-17.5 0-22.5-4.5C5 54.5 1 48 1 37V27C1 16 5 9.5 9.5 5.5 14.5 1 21 1 32 1Z"
        fill="url(#ap-grad)"
      />
      {/* Brilho sutil no topo */}
      <path
        d="M32 1c11 0 17.5 0 22.5 4.5C59 9.5 63 16 63 27v3c0-11-4-17.5-8.5-21.5C49.5 4 43 4 32 4S14.5 4 9.5 8.5C5 12.5 1 19 1 30v-3C1 16 5 9.5 9.5 5.5 14.5 1 21 1 32 1Z"
        fill="url(#ap-shine)"
      />

      {/* Crescente — abraço/proteção/curva do "casa" */}
      <path
        d="M14 44c2.5 5 8 8 14 8s11.5-3 14-8"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Monograma "AP" em serif (desenhado em paths pra não depender de fonte) */}
      <text
        x="32"
        y="34"
        textAnchor="middle"
        fontFamily="'Instrument Serif', 'ui-serif', Georgia, serif"
        fontSize="26"
        fontStyle="italic"
        fill="white"
      >
        AP
      </text>

      {/* Pontinho/spark — toque de personalidade */}
      <circle cx="49" cy="16" r="2" fill="white" opacity="0.85" />

      {/* Ring sutil interno pra dar profundidade */}
      <path
        d="M32 1c11 0 17.5 0 22.5 4.5C59 9.5 63 16 63 27v10c0 11-4 17.5-8.5 21.5C49.5 63 43 63 32 63s-17.5 0-22.5-4.5C5 54.5 1 48 1 37V27C1 16 5 9.5 9.5 5.5 14.5 1 21 1 32 1Z"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
