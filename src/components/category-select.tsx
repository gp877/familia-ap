"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  markAsInternalManually,
  setTransactionCategory,
  unmarkAsInternalManually,
} from "@/app/actions/transactions";

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
  /** Se a transação está marcada como interna. Muda o trigger pra mostrar
   * o estado e adiciona "tornar real" como opção no popover. */
  isInternal?: boolean;
};

/**
 * Categoria — botão pastel sem borda + popover com drill-down (mãe → subs).
 *
 * Design: fundo pastel da cor da categoria (~15% alpha sobre superfície),
 * texto em tom suave, ponto pequeno como indicador, sem chevron, sem
 * uppercase. Estilo moderno (Linear/Notion). Click abre painel translúcido
 * com sombra suave e cantos generosos.
 */
export function CategorySelect({
  transactionId,
  currentCategoryId,
  options,
  isInternal = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drilledParentId, setDrilledParentId] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.id === currentCategoryId) ?? null;
  const currentColor = current?.color || (current ? defaultColor(current.kind) : null);

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

  const drilledParent = drilledParentId ? parentById.get(drilledParentId) ?? null : null;
  const drilledSubs = drilledParent ? childrenOf.get(drilledParent.id) ?? [] : [];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30);
  }, [query, options]);

  const flatVisible: CategoryOption[] = useMemo(() => {
    if (query.trim()) return searchResults;
    if (drilledParent) return [drilledParent, ...drilledSubs];
    return parents;
  }, [query, searchResults, drilledParent, drilledSubs, parents]);

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

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, drilledParentId]);

  function selectCategory(id: string | null, createRule = true) {
    startTransition(async () => {
      // Se estava interna e o usuário escolheu uma categoria real,
      // automaticamente desfaz a marcação de interna primeiro.
      if (isInternal && id) {
        await unmarkAsInternalManually(transactionId);
      }
      await setTransactionCategory(transactionId, id, createRule);
      setOpen(false);
    });
  }

  function markInternal() {
    startTransition(async () => {
      await markAsInternalManually(transactionId, null);
      setOpen(false);
    });
  }

  function unmarkInternal() {
    startTransition(async () => {
      await unmarkAsInternalManually(transactionId);
      setOpen(false);
    });
  }

  function pickOption(opt: CategoryOption) {
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
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          border: isInternal ? "0.5px dashed var(--line-d)" : "none",
          background: isInternal
            ? "transparent"
            : current
              ? `color-mix(in oklab, ${currentColor} 16%, transparent)`
              : "color-mix(in oklab, var(--muted) 10%, transparent)",
          color: isInternal
            ? "var(--muted)"
            : current
              ? softTone(currentColor!)
              : "var(--muted)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          cursor: isPending ? "wait" : "pointer",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          transition: "background-color 0.15s, transform 0.08s",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: isInternal
              ? "transparent"
              : currentColor ?? "var(--muted)",
            boxShadow: isInternal ? "inset 0 0 0 1px var(--muted)" : "none",
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {isInternal ? "↔ interna" : current ? current.label : "categorizar"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 30,
            minWidth: 280,
            maxWidth: 340,
            background: "var(--card)",
            borderRadius: 18,
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.45)",
            overflow: "hidden",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Header com search + breadcrumb */}
          <div
            style={{
              padding: "10px 10px 8px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {drilledParent && !query && (
              <button
                type="button"
                onClick={() => setDrilledParentId(null)}
                title="Voltar"
                aria-label="Voltar"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  border: "none",
                  background: "color-mix(in oklab, var(--muted) 10%, transparent)",
                  color: "var(--ink-d)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background-color 0.12s",
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
              placeholder={drilledParent ? `subs de ${drilledParent.name}…` : "buscar…"}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                background: "color-mix(in oklab, var(--muted) 8%, transparent)",
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
                borderRadius: 10,
              }}
            />
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 6px 8px" }}>
            {/* Modo busca */}
            {query.trim() && (
              <>
                {searchResults.length === 0 && (
                  <EmptyState text="nada encontrado" />
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

            {/* Modo drilled */}
            {!query.trim() && drilledParent && (
              <>
                <CategoryRow
                  opt={drilledParent}
                  isCurrent={drilledParent.id === currentCategoryId}
                  highlighted={highlightIdx === 0}
                  onSelect={() => selectCategory(drilledParent.id)}
                  overrideLabel={`atribuir só a "${drilledParent.name}"`}
                  emphasize
                />
                {drilledSubs.length > 0 ? (
                  <>
                    <GroupLabel label="subcategorias" />
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
                  <EmptyState text="sem subcategorias" />
                )}
              </>
            )}

            {/* Modo raiz */}
            {!query.trim() && !drilledParent && (
              <>
                {/* Interna: alternar ↔ real. Fica no topo do menu pra ficar
                    junto da categorização (decisão de natureza da transação). */}
                {isInternal ? (
                  <button
                    type="button"
                    onClick={unmarkInternal}
                    style={{
                      ...rowBaseStyle,
                      color: "var(--accent)",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: "var(--accent)",
                      }}
                    />
                    Tornar real (e categorizar abaixo)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={markInternal}
                    style={{
                      ...rowBaseStyle,
                      color: "var(--muted-d)",
                      fontWeight: 600,
                    }}
                    title="Não entra em DRE/balanço — só fecha saldo da conta"
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: "transparent",
                        boxShadow: "inset 0 0 0 1px var(--muted-d)",
                      }}
                    />
                    ↔ Marcar como transferência interna
                  </button>
                )}

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
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "transparent",
                      boxShadow: "inset 0 0 0 1px var(--muted)",
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

function GroupLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px 12px 4px",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--muted)",
        letterSpacing: "0.02em",
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
  fullLabel?: boolean;
  overrideLabel?: string;
  subCount?: number;
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
        background: emphasize
          ? `color-mix(in oklab, ${color} 14%, transparent)`
          : highlighted
            ? "color-mix(in oklab, var(--muted) 10%, transparent)"
            : "transparent",
        color: emphasize ? softTone(color) : "var(--ink-d)",
        fontWeight: isCurrent || emphasize ? 700 : 500,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
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
            fontSize: 10.5,
            color: "var(--muted)",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {subCount} sub{subCount === 1 ? "" : "s"} →
        </span>
      )}
      {isCurrent && !subCount && (
        <span style={{ fontSize: 11, color: softTone(color) }}>•</span>
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
        fontStyle: "italic",
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
  padding: "8px 12px",
  margin: "1px 0",
  width: "100%",
  border: "none",
  borderRadius: 10,
  background: "transparent",
  color: "var(--ink)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  transition: "background-color 0.12s",
};

/**
 * Versão "suave" da cor da categoria pra usar como texto sobre fundo
 * pastel. Mistura a cor com branco/ink pra evitar contraste exagerado.
 */
function softTone(color: string): string {
  return `color-mix(in oklab, ${color} 78%, var(--ink-d))`;
}

function defaultColor(kind: "expense" | "income"): string {
  return kind === "income" ? "#7BD86F" : "#FF8B66";
}
