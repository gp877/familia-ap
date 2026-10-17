// Cores das etiquetas — módulo comum (usado por telas do servidor e do navegador).
import type { CSSProperties } from "react";

import type { Color } from "@/lib/workspace-model";

/** Cores das etiquetas (fundo translúcido + texto claro, legível no tema escuro e claro). */
const PALETTE: Record<Color, { bg: string; fg: string }> = {
  default: { bg: "rgba(140,140,140,0.18)", fg: "var(--ink-d)" },
  gray: { bg: "rgba(155,155,155,0.28)", fg: "var(--ink-d)" },
  brown: { bg: "rgba(160,110,80,0.32)", fg: "#e8c9b0" },
  orange: { bg: "rgba(230,130,40,0.30)", fg: "#ffcf9e" },
  yellow: { bg: "rgba(220,180,40,0.30)", fg: "#f6e3a1" },
  green: { bg: "rgba(70,170,100,0.30)", fg: "#b6ecc4" },
  blue: { bg: "rgba(60,130,230,0.32)", fg: "#bcd7ff" },
  purple: { bg: "rgba(150,100,230,0.32)", fg: "#dccbff" },
  pink: { bg: "rgba(230,80,160,0.30)", fg: "#ffc2e3" },
  red: { bg: "rgba(230,70,60,0.32)", fg: "#ffc0ba" },
};

export function colorStyle(c: Color | undefined): CSSProperties {
  const p = PALETTE[c ?? "default"] ?? PALETTE.default;
  return { background: p.bg, color: p.fg };
}

/** Cor forte (texto) da etiqueta — usada como faixa lateral do cartão (ex.: prioridade). */
export function accentColor(c: Color | undefined): string {
  return (PALETTE[c ?? "default"] ?? PALETTE.default).fg;
}
