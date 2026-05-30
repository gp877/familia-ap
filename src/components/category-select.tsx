"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { setTransactionCategory } from "@/app/actions/transactions";

export type CategoryOption = {
  id: string;
  /** Label hierárquico tipo "Alimentação › Mercado". Usado na busca textual. */
  label: string;
  /** Nome curto (sem prefixo de mãe). */
  name: string;
  parentId: string | null;
  color: string | null;
  kind: "expense" | "income";
};

type Props = {
  transactionId: string;
  currentCategoryId: string | null;
  options: CategoryOption[];
};

/**
 * Dropdown custom de categoria — chip colorido + popover com DRILL-DOWN.
 *
 * - Estágio raiz: lista mães (Despesas, Receitas), cada uma com indicador
 *   "→ N subs" se tem filhas.
 * - Click numa mãe sem subs: seleciona direto.
 * - Click numa mãe com subs: desce pra mostrar só as subs daquela mãe +
 *   opção "atribuir só a {mãe}" no topo.
 * - Busca textual sempre atravessa tudo (mães + subs em qualquer estágio).
 * - Teclado: ↑↓ navega, Enter seleciona, ← volta ao raiz, Esc fecha.
 */
export function CategorySelect({ transactionId, currentCategoryId, options }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drilledParentId, setDrilledParentId] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.id === currentCategoryId) ?? null;
  const currentColor = current?.color || (current ? defaultColor(current.kind) : null);

  // Pré-computa parents e childMap
  const { parents, childrenOf, parentById } = useMemo(() => {
    const parentList = options.filter((o) => !o.parentId);
    const cMap = new Map<string, CategoryOption[]>();
    const pMap = new Map<string, CategoryOption>();
    for (const p of parentList) pMap.set(p.id, p);
    for (const o of options) {
      if (o.parentId) {
        const arr = cMap.get(o.parentId) ?? [];
        arr.push(o);
        cMap.set(o.parentId, arr);
      }
    }
    return { parents: parentList, childrenOf: cMap, parentById: pMap };
  }, [options]);

  // Quem é a mãe drilled (se houver)
  const drilledParent = drilledParentId ? parentById.get(drilledParentId) ?? null : null;
  const drilledSubs = drilledParent ? childrenOf.get(drilledParent.id) ?? [] : [];

  // Lista achatada pra busca textual
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, options]);

  // Lista efetiva renderizada (pra navegação por teclado)
  const flatVisible: CategoryOption[] = useMemo(() => {
    if (query.trim()) return searchResults;
    if (drilledParent) return [drilledParent, ...drilledSubs];
    return parents;
  }, [query, searchResults, drilledParent, drilledSubs, parents]);

  // Fecha ao clicar fora
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setDrilledParentId(null);
      setHighlightIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Reset highlight quando muda o conteúdo visível
  useEffect(() => {
    setHighlightIdx(0);
  }, [query, drilledParentId]);

  function selectCategory(id: string | null, createRule = true) {
    startTransition(async () => {
      await setTransactionCategory(transactionId, id, createRule);
      setOpen(false);
    });
  }

  function pickOption(opt: CategoryOption) {
    // Se é uma mãe COM subs e não estamos drilled, desce
    const hasSubs = !opt.parentId && (childrenOf.get(opt.id) ?? []).length > 0;
    if (hasSubs && drilledParentId !== opt.id) {
      setDrilledParentId(opt.id);
      setQuery("");
      return;
    }
    selectCategory(opt.id);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flatVisible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flatVisible[highlightIdx];
      if (pick) pickOption(pick);
    } else if (e.key === "ArrowLeft" && drilledParentId && !query) {
      e.preventDefault();
      setDrilledParentId(null);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
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
          transition: "background-color 0.15s, border-color 0.15s",
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
            minWidth: 280,
            maxWidth: 340,
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          {/* Header com search + breadcrumb */}
          <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--line-d)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {drilledParent && !query && (
                <button
                  type="button"
                  onClick={() => setDrilledParentId(null)}
                  title="Voltar"
                  aria-label="Voltar"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    border: "0.5px solid var(--line-d)",
                    background: "var(--card2)",
                    color: "var(--muted-d)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ‹
                </button>
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={drilledParent ? `Subcategorias de ${drilledParent.name}…` : "buscar…"}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  border: "none",
                  background: "var(--card2)",
                  color: "var(--ink)",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                  borderRadius: 8,
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", padding: "6px 0" }}>
            {/* Modo busca */}
            {query.trim() && (
              <>
                {searchResults.length === 0 && (
                  <EmptyState text="nenhuma categoria encontrada" />
                )}
                {searchResults.map((opt, idx) => (
                  <CategoryRow
                    key={opt.id}
                    opt={opt}
                    fullLabel
                    isCurrent={opt.id === currentCategoryId}
                    highlighted={highlightIdx === idx}
                    onSelect={() => pickOption(opt)}
                  />
                ))}
              </>
            )}

            {/* Modo drilled — subcategorias de uma mãe específica */}
            {!query.trim() && drilledParent && (
              <>
                <CategoryRow
                  opt={drilledParent}
                  isCurrent={drilledParent.id === currentCategoryId}
                  highlighted={highlightIdx === 0}
                  onSelect={() => selectCategory(drilledParent.id)}
                  overrideLabel={`Atribuir só a "${drilledParent.name}"`}
                  emphasize
                />
                {drilledSubs.length > 0 ? (
                  <>
                    <GroupLabel label="subcategorias" tone={drilledParent.kind} />
                    {drilledSubs.map((sub, idx) => (
                      <CategoryRow
                        key={sub.id}
                        opt={sub}
                        isCurrent={sub.id === currentCategoryId}
                        highlighted={highlightIdx === idx + 1}
                        onSelect={() => selectCategory(sub.id)}
                      />
                    ))}
                  </>
                ) : (
                  <EmptyState text="essa mãe não tem subcategorias" />
                )}
              </>
            )}

            {/* Modo raiz — só mães agrupadas por kind */}
            {!query.trim() && !drilledParent && (
              <>
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

                {(["expense", "income"] as const).map((kind) => {
                  const list = parents.filter((p) => p.kind === kind);
                  if (list.length === 0) return null;
                  return (
                    <div key={kind}>
                      <GroupLabel
                        label={kind === "expense" ? "despesas" : "receitas"}
                        tone={kind}
                      />
                      {list.map((p) => {
                        const subs = childrenOf.get(p.id) ?? [];
                        const idx = parents.findIndex((q) => q.id === p.id);
                        return (
                          <CategoryRow
                            key={p.id}
                            opt={p}
                            isCurrent={p.id === currentCategoryId}
                            highlighted={highlightIdx === idx}
                            onSelect={() => pickOption(p)}
                            subCount={subs.length}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupLabel({ label, tone }: { label: string; tone: "expense" | "income" }) {
  const color = tone === "expense" ? "var(--alert)" : "var(--ok)";
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
  fullLabel = false,
  overrideLabel,
  subCount,
  emphasize = false,
}: {
  opt: CategoryOption;
  highlighted: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  /** Mostra "Parent › Sub" em vez do nome curto. */
  fullLabel?: boolean;
  /** Sobrescreve o texto exibido. */
  overrideLabel?: string;
  /** Mostra "→ N subs" no canto direito (estágio raiz). */
  subCount?: number;
  /** Visual destacado pra opção "atribuir só a mãe" no estágio drilled. */
  emphasize?: boolean;
}) {
  const color = opt.color || defaultColor(opt.kind);
  const display = overrideLabel ?? (fullLabel ? opt.label : opt.name);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      style={{
        ...rowBaseStyle,
        background: highlighted
          ? "var(--card2)"
          : emphasize
            ? `color-mix(in oklab, ${color} 12%, transparent)`
            : "transparent",
        fontWeight: isCurrent || emphasize ? 800 : 600,
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
        {display}
      </span>
      {subCount !== undefined && subCount > 0 && (
        <span
          style={{
            fontSize: 10,
            color: "var(--muted)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--card2)",
          }}
        >
          {subCount} sub{subCount === 1 ? "" : "s"} ›
        </span>
      )}
      {isCurrent && !subCount && (
        <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>
      )}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 12,
      }}
    >
      {text}
    </div>
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
