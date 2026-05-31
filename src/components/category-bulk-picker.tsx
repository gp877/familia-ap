"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CategoryOption } from "@/components/category-select";

type Props = {
  options: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Cor do botão (default contraste com accent — usado no footer accent) */
  buttonContrast?: boolean;
};

/**
 * Picker hierárquico de categoria pra ações em lote (footer com fundo accent).
 * Mesmo paradigma do CategorySelect inline (drill-down pai → subs), mas
 * stateless: chama onChange(id) ao escolher. Substitui o `<select>` HTML que
 * misturava pais e filhos numa lista flat poluída.
 */
export function CategoryBulkPicker({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "Aplicar categoria...",
  buttonContrast = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drilledParentId, setDrilledParentId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.id === value) ?? null;

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
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function clickOption(opt: CategoryOption) {
    const hasSubs = !opt.parentId && (childrenOf.get(opt.id) ?? []).length > 0;
    if (hasSubs && drilledParentId !== opt.id) {
      setDrilledParentId(opt.id);
      setQuery("");
      return;
    }
    pick(opt.id);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 8,
          background: buttonContrast ? "rgba(0,0,0,0.15)" : "var(--card2)",
          color: buttonContrast ? "var(--accent-on)" : "var(--ink)",
          border: "none",
          fontSize: 11.5,
          fontWeight: 600,
          cursor: disabled ? "wait" : "pointer",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {current && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: current.color ?? "currentColor",
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {current ? current.label : placeholder}
        </span>
        <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)", // abre PRA CIMA (footer está no fundo)
            left: 0,
            zIndex: 40,
            minWidth: 260,
            maxWidth: 320,
            background: "var(--card)",
            borderRadius: 14,
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.45)",
            overflow: "hidden",
            color: "var(--ink)",
          }}
        >
          <div
            style={{
              padding: "8px 8px 6px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {drilledParent && !query && (
              <button
                type="button"
                onClick={() => setDrilledParentId(null)}
                style={backBtnStyle}
                aria-label="Voltar"
              >
                ‹
              </button>
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={drilledParent ? `subs de ${drilledParent.name}…` : "buscar…"}
              style={searchInputStyle}
            />
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto", padding: "0 6px 8px" }}>
            {/* Busca */}
            {query.trim() && (
              <>
                {searchResults.length === 0 && (
                  <Empty>nada encontrado</Empty>
                )}
                {searchResults.map((opt) => (
                  <Row
                    key={opt.id}
                    opt={opt}
                    fullLabel
                    isCurrent={opt.id === value}
                    onClick={() => clickOption(opt)}
                  />
                ))}
              </>
            )}

            {/* Drilled (mãe específica) */}
            {!query.trim() && drilledParent && (
              <>
                <Row
                  opt={drilledParent}
                  isCurrent={drilledParent.id === value}
                  onClick={() => pick(drilledParent.id)}
                  overrideLabel={`atribuir só a "${drilledParent.name}"`}
                  emphasize
                />
                {drilledSubs.length > 0 ? (
                  <>
                    <GroupLabel>subcategorias</GroupLabel>
                    {drilledSubs.map((sub) => (
                      <Row
                        key={sub.id}
                        opt={sub}
                        isCurrent={sub.id === value}
                        onClick={() => pick(sub.id)}
                      />
                    ))}
                  </>
                ) : (
                  <Empty>sem subcategorias</Empty>
                )}
              </>
            )}

            {/* Raiz: pais agrupados por tipo */}
            {!query.trim() && !drilledParent && (
              <>
                {(["expense", "income"] as const).map((kind) => {
                  const list = parents.filter((p) => p.kind === kind);
                  if (list.length === 0) return null;
                  return (
                    <div key={kind}>
                      <GroupLabel>
                        {kind === "expense" ? "despesas" : "receitas"}
                      </GroupLabel>
                      {list.map((p) => {
                        const subs = childrenOf.get(p.id) ?? [];
                        return (
                          <Row
                            key={p.id}
                            opt={p}
                            isCurrent={p.id === value}
                            onClick={() => clickOption(p)}
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

function Row({
  opt,
  isCurrent,
  onClick,
  fullLabel = false,
  overrideLabel,
  subCount,
  emphasize = false,
}: {
  opt: CategoryOption;
  isCurrent: boolean;
  onClick: () => void;
  fullLabel?: boolean;
  overrideLabel?: string;
  subCount?: number;
  emphasize?: boolean;
}) {
  const color = opt.color || (opt.kind === "income" ? "#7BD86F" : "#FF8B66");
  const display = overrideLabel ?? (fullLabel ? opt.label : opt.name);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        margin: "1px 0",
        width: "100%",
        border: "none",
        borderRadius: 8,
        background: emphasize
          ? `color-mix(in oklab, ${color} 14%, transparent)`
          : "transparent",
        color: "var(--ink-d)",
        fontSize: 12.5,
        fontWeight: isCurrent || emphasize ? 700 : 500,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
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
        <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 500 }}>
          {subCount} sub{subCount === 1 ? "" : "s"} →
        </span>
      )}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 10px 4px",
        fontSize: 10,
        fontWeight: 600,
        color: "var(--muted)",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 12,
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 13,
  border: "none",
  background: "color-mix(in oklab, var(--muted) 10%, transparent)",
  color: "var(--ink-d)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  border: "none",
  background: "color-mix(in oklab, var(--muted) 8%, transparent)",
  color: "var(--ink)",
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
  borderRadius: 8,
};
