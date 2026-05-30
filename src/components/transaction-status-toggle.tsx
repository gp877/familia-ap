"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteTransaction,
  setTransactionStatus,
} from "@/app/actions/transactions";

type Status = "pending" | "confirmed" | "ignored";

type Props = {
  transactionId: string;
  status: Status;
};

const STATUS_META: Record<
  Status,
  { label: string; icon: string; color: string; bg: (color: string) => string }
> = {
  confirmed: {
    label: "ok",
    icon: "✓",
    color: "var(--ok)",
    bg: (c) => `color-mix(in oklab, ${c} 22%, var(--card))`,
  },
  pending: {
    label: "pendente",
    icon: "•",
    color: "#FFB85C",
    bg: (c) => `color-mix(in oklab, ${c} 18%, var(--card))`,
  },
  ignored: {
    label: "ignorada",
    icon: "⊘",
    color: "var(--muted)",
    bg: () => "var(--card2)",
  },
};

/**
 * Status da transação como chip único colorido + ações de mudança no popover.
 * Trash separado fica num botão pequeno no final, com confirmação.
 */
export function TransactionStatusToggle({ transactionId, status }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const meta = STATUS_META[status];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function changeTo(next: Status) {
    startTransition(async () => {
      await setTransactionStatus(transactionId, next);
      setOpen(false);
    });
  }

  function handleDelete() {
    if (!confirm("Excluir esta transação? Não tem desfazer.")) return;
    startTransition(async () => {
      await deleteTransaction(transactionId);
    });
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {/* Chip do status atual — click abre menu */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        title={`Status: ${meta.label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 999,
          border: `0.5px solid ${meta.color}`,
          background: meta.bg(meta.color),
          color: meta.color,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.04em",
          cursor: isPending ? "wait" : "pointer",
          textTransform: "uppercase",
          transition: "background-color 0.15s, border-color 0.15s",
        }}
      >
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>
          {meta.icon}
        </span>
        <span>{meta.label}</span>
      </button>

      {/* Trash */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Excluir"
        title="Excluir"
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          background: "transparent",
          color: "var(--muted)",
          border: "0.5px solid var(--line-d)",
          cursor: "pointer",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--alert)";
          e.currentTarget.style.borderColor = "var(--alert)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--muted)";
          e.currentTarget.style.borderColor = "var(--line-d)";
        }}
      >
        <TrashIcon />
      </button>

      {/* Popover de mudança de status */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            minWidth: 180,
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {(["confirmed", "pending", "ignored"] as Status[]).map((s) => {
            const m = STATUS_META[s];
            const isCurrent = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => changeTo(s)}
                disabled={isCurrent || isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: isCurrent ? "var(--card2)" : "transparent",
                  border: "none",
                  color: m.color,
                  fontSize: 12.5,
                  fontWeight: isCurrent ? 800 : 600,
                  textAlign: "left",
                  cursor: isCurrent ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: isCurrent ? 0.85 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: m.bg(m.color),
                    border: `0.5px solid ${m.color}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    color: m.color,
                  }}
                >
                  {m.icon}
                </span>
                <span style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {m.label}
                </span>
                {isCurrent && <span style={{ fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
