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
  { label: string; color: string }
> = {
  confirmed: { label: "confirmada", color: "#7BD86F" },
  pending: { label: "pendente", color: "#F5C16C" },
  ignored: { label: "ignorada", color: "#8E8E8E" },
};

/**
 * Status como chip pastel sem borda. Click abre lista flutuante com as 3
 * opções. Trash é separado, ícone-only suave, fica vermelho no hover.
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
      {/* Chip do status — pastel sem borda */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        title={`Status: ${meta.label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          border: "none",
          background: `color-mix(in oklab, ${meta.color} 16%, transparent)`,
          color: `color-mix(in oklab, ${meta.color} 78%, var(--ink-d))`,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          cursor: isPending ? "wait" : "pointer",
          opacity: isPending ? 0.7 : 1,
          transition: "background-color 0.15s",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: meta.color,
            flexShrink: 0,
          }}
        />
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
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background-color 0.12s, color 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--alert)";
          e.currentTarget.style.background = "color-mix(in oklab, var(--alert) 12%, transparent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--muted)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <TrashIcon />
      </button>

      {/* Popover de mudança de status */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 30,
            minWidth: 180,
            background: "var(--card)",
            borderRadius: 16,
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.45)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 1,
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
                  borderRadius: 10,
                  background: isCurrent
                    ? `color-mix(in oklab, ${m.color} 14%, transparent)`
                    : "transparent",
                  border: "none",
                  color: isCurrent
                    ? `color-mix(in oklab, ${m.color} 78%, var(--ink-d))`
                    : "var(--ink-d)",
                  fontSize: 13,
                  fontWeight: isCurrent ? 700 : 500,
                  textAlign: "left",
                  cursor: isCurrent ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "background-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent && !isPending) {
                    e.currentTarget.style.background =
                      "color-mix(in oklab, var(--muted) 10%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: m.color,
                  }}
                />
                <span style={{ flex: 1 }}>{m.label}</span>
                {isCurrent && (
                  <span style={{ fontSize: 11, color: m.color }}>•</span>
                )}
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
      strokeWidth={1.8}
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
