"use client";

import { useEffect, useRef, type ReactNode } from "react";


import type { Color } from "@/lib/workspace-model";

export { colorStyle } from "./colors";
import { colorStyle } from "./colors";

export function Tag({ color, children, onRemove, small = false }: { color?: Color; children: ReactNode; onRemove?: () => void; small?: boolean }) {
  return (
    <span
      style={{
        ...colorStyle(color),
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "0 5px" : "1px 7px",
        borderRadius: 4,
        fontSize: small ? 11 : 12,
        fontWeight: 500,
        lineHeight: small ? "17px" : "18px",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0, fontSize: 12, opacity: 0.7 }}
          aria-label="Remover"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Caixa flutuante simples: fecha clicando fora ou no Esc. */
export function Popover({
  open,
  onClose,
  children,
  width = 260,
  align = "left",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        [align]: 0,
        zIndex: 50,
        width,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: 420,
        overflowY: "auto",
        background: "var(--card)",
        border: "0.5px solid var(--line-d)",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        padding: 6,
      }}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  active,
  danger,
  hint,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ws-menu-item"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        borderRadius: 6,
        border: 0,
        background: active ? "var(--card2)" : "transparent",
        color: danger ? "var(--alert)" : "var(--ink-d)",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{children}</span>
      {hint && <span style={{ color: "var(--muted)", fontSize: 11 }}>{hint}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "6px 8px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
      {children}
    </div>
  );
}

export function GhostButton({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        borderRadius: 6,
        border: 0,
        background: active ? "var(--card2)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted-d)",
        fontSize: 12.5,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function TextField({
  value,
  onChange,
  onEnter,
  placeholder,
  autoFocus,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
      style={{
        width: "100%",
        padding: "6px 8px",
        borderRadius: 6,
        border: "0.5px solid var(--line-d)",
        background: "var(--surf)",
        color: "var(--ink)",
        fontSize: 13,
        fontFamily: "inherit",
        outline: "none",
        colorScheme: "dark",
      }}
    />
  );
}

export function AiBadge({ created, revisedAt }: { created?: boolean; revisedAt?: string | null }) {
  if (!created && !revisedAt) return null;
  return (
    <span
      title={created ? "Criado pelo assistente de IA" : `Revisado pelo assistente de IA em ${new Date(revisedAt!).toLocaleDateString("pt-BR")}`}
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.06em",
        color: created ? "var(--accent)" : "var(--muted)",
        border: "0.5px solid currentColor",
        padding: "1px 5px",
        borderRadius: 999,
        flexShrink: 0,
        lineHeight: "14px",
      }}
    >
      {created ? "IA" : "rev. IA"}
    </span>
  );
}

export function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(d)} de ${meses[Number(m) - 1]}${y !== String(new Date().getFullYear()) ? ` de ${y}` : ""}`;
}
