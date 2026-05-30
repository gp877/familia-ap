"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { setTransactionCategory } from "@/app/actions/transactions";

export type CategoryOption = {
  id: string;
  label: string; // "Parent > Child" ou só "Name"
  color: string | null;
  kind: "expense" | "income";
};

type Props = {
  transactionId: string;
  currentCategoryId: string | null;
  options: CategoryOption[];
};

/**
 * Dropdown custom de categoria — botão chip colorido + popover com busca.
 *
 * - Mostra a cor da categoria atual (ou placeholder cinza pra "sem categoria")
 * - Click abre popover com lista filtrada por digitação
 * - Opções agrupadas Despesas / Receitas, cada uma com seu ponto de cor
 * - Acessível via teclado: Enter pra selecionar, Esc pra fechar, ↑↓ pra navegar
 */
export function CategorySelect({ transactionId, currentCategoryId, options }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.id === currentCategoryId) ?? null;
  const currentColor = current?.color || (current ? defaultColor(current.kind) : null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase())
  );
  const expenses = filtered.filter((o) => o.kind === "expense");
  const incomes = filtered.filter((o) => o.kind === "income");
  // Lista plana ordenada (despesas primeiro) pra navegação por teclado
  const flat = [...expenses, ...incomes];

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function selectCategory(id: string | null, createRule = true) {
    startTransition(async () => {
      await setTransactionCategory(transactionId, id, createRule);
      setOpen(false);
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flat[highlightIdx];
      if (pick) selectCategory(pick.id);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="ap-category-chip"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 12px 5px 8px",
          borderRadius: 999,
          border: "0.5px solid var(--line-d)",
          background: current
            ? `color-mix(in oklab, ${currentColor} 22%, var(--card))`
            : "var(--card2)",
          color: current ? "var(--ink)" : "var(--muted-d)",
          fontSize: 11.5,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          transition: "background-color 0.15s, border-color 0.15s, transform 0.08s",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: currentColor ?? "var(--muted)",
            flexShrink: 0,
            boxShadow: current ? `0 0 0 1.5px var(--card)` : "none",
          }}
        />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {current ? current.label : "categorizar"}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 9,
            color: "var(--muted)",
            marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: 260,
            maxWidth: 320,
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIdx(0);
            }}
            onKeyDown={handleKey}
            placeholder="buscar…"
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "none",
              borderBottom: "0.5px solid var(--line-d)",
              background: "var(--card)",
              color: "var(--ink)",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => selectCategory(null, false)}
              style={{
                ...rowBaseStyle,
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  border: "1px dashed var(--muted)",
                }}
              />
              sem categoria
            </button>

            {expenses.length > 0 && (
              <>
                <GroupLabel label="despesas" tone="alert" />
                {expenses.map((opt, idx) => (
                  <CategoryRow
                    key={opt.id}
                    opt={opt}
                    highlighted={highlightIdx === idx}
                    isCurrent={opt.id === currentCategoryId}
                    onSelect={() => selectCategory(opt.id)}
                  />
                ))}
              </>
            )}

            {incomes.length > 0 && (
              <>
                <GroupLabel label="receitas" tone="ok" />
                {incomes.map((opt, idx) => (
                  <CategoryRow
                    key={opt.id}
                    opt={opt}
                    highlighted={highlightIdx === expenses.length + idx}
                    isCurrent={opt.id === currentCategoryId}
                    onSelect={() => selectCategory(opt.id)}
                  />
                ))}
              </>
            )}

            {filtered.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 12,
                }}
              >
                nenhuma categoria encontrada
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupLabel({ label, tone }: { label: string; tone: "alert" | "ok" }) {
  const color = tone === "alert" ? "var(--alert)" : "var(--ok)";
  return (
    <div
      style={{
        padding: "8px 14px 4px",
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
      }}
    >
      {label}
    </div>
  );
}

function CategoryRow({
  opt,
  highlighted,
  isCurrent,
  onSelect,
}: {
  opt: CategoryOption;
  highlighted: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const color = opt.color || defaultColor(opt.kind);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      style={{
        ...rowBaseStyle,
        background: highlighted ? "var(--card2)" : "transparent",
        fontWeight: isCurrent ? 800 : 600,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {opt.label}
      </span>
      {isCurrent && (
        <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>
      )}
    </button>
  );
}

const rowBaseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  width: "100%",
  border: "none",
  background: "transparent",
  color: "var(--ink)",
  fontSize: 12.5,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

function defaultColor(kind: "expense" | "income"): string {
  return kind === "income" ? "#7BD86F" : "#FF7A35";
}
