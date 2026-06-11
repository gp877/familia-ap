"use client";

import { useMemo, useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";
import type { CategoryOption } from "@/components/category-select";

import { bulkDeleteRules } from "@/app/actions/category-rules";

import { RuleRow } from "./rule-row";

type Rule = {
  id: string;
  pattern: string;
  matchType: "exact" | "prefix" | "contains" | "regex";
  categoryId: string;
  isActive: boolean;
  lastAppliedAt: string | null;
  createdAt: string;
};

type FilterMode = "all" | "never_used" | "stale_6m" | "inactive";
type SortMode = "alpha" | "recent" | "oldest_used" | "newest_created";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function formatLastUsed(iso: string | null): { label: string; tone: "muted" | "warn" | "ok" } {
  if (!iso) return { label: "nunca usada", tone: "warn" };
  const d = daysAgo(iso)!;
  if (d === 0) return { label: "hoje", tone: "ok" };
  if (d === 1) return { label: "ontem", tone: "ok" };
  if (d < 30) return { label: `há ${d} dias`, tone: "ok" };
  if (d < 90) return { label: `há ${Math.floor(d / 30)} mes${Math.floor(d / 30) === 1 ? "" : "es"}`, tone: "muted" };
  if (d < 365) return { label: `há ${Math.floor(d / 30)} meses`, tone: "muted" };
  return { label: `há ${Math.floor(d / 365)} ano${Math.floor(d / 365) === 1 ? "" : "s"}`, tone: "warn" };
}

export function RulesManager({
  rules,
  categoryOptions,
}: {
  rules: Rule[];
  categoryOptions: CategoryOption[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("alpha");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Sugestão automática: regras candidatas a limpeza (sem uso há 6+ meses
  // OU nunca usadas mas criadas há mais de 6 meses). Exibido como banner
  // no topo, com um clique pra entrar no modo "stale".
  const staleCount = useMemo(() => {
    const now = Date.now();
    return rules.filter((r) => {
      if (r.lastAppliedAt) {
        return now - new Date(r.lastAppliedAt).getTime() > SIX_MONTHS_MS;
      }
      // Nunca usada e criada há mais de 6 meses
      return now - new Date(r.createdAt).getTime() > SIX_MONTHS_MS;
    }).length;
  }, [rules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats = new Map(categoryOptions.map((c) => [c.id, c]));
    const now = Date.now();
    let list = rules.filter((r) => {
      if (q) {
        const cat = cats.get(r.categoryId);
        const haystack = `${r.pattern} ${cat?.label ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      switch (filter) {
        case "never_used":
          return !r.lastAppliedAt;
        case "stale_6m":
          if (r.lastAppliedAt) {
            return now - new Date(r.lastAppliedAt).getTime() > SIX_MONTHS_MS;
          }
          return now - new Date(r.createdAt).getTime() > SIX_MONTHS_MS;
        case "inactive":
          return !r.isActive;
        case "all":
        default:
          return true;
      }
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "alpha":
          return a.pattern.localeCompare(b.pattern, "pt-BR");
        case "recent": {
          const aT = a.lastAppliedAt ? new Date(a.lastAppliedAt).getTime() : 0;
          const bT = b.lastAppliedAt ? new Date(b.lastAppliedAt).getTime() : 0;
          return bT - aT;
        }
        case "oldest_used": {
          // nulls first (mais "esquecidas" no topo), depois lastAppliedAt asc
          if (!a.lastAppliedAt && !b.lastAppliedAt) return 0;
          if (!a.lastAppliedAt) return -1;
          if (!b.lastAppliedAt) return 1;
          return new Date(a.lastAppliedAt).getTime() - new Date(b.lastAppliedAt).getTime();
        }
        case "newest_created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return list;
  }, [rules, query, filter, sort, categoryOptions]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(r.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Excluir ${selected.size} regra${selected.size === 1 ? "" : "s"}? As transações já categorizadas continuam — só não há mais auto-categorização para novos uploads que casariam com elas.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      await bulkDeleteRules(Array.from(selected));
      setSelected(new Set());
    });
  }

  return (
    <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Banner de sugestão IA — só aparece se houver candidatas. */}
      {staleCount > 0 && filter !== "stale_6m" && (
        <div
          style={{
            padding: "10px 14px",
            background: "color-mix(in oklab, var(--accent) 12%, var(--card))",
            border: "0.5px solid color-mix(in oklab, var(--accent) 30%, var(--line-d))",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--ink-d)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ flex: 1, minWidth: 220 }}>
            <b style={{ color: "var(--accent)" }}>{staleCount}</b>{" "}
            {staleCount === 1 ? "regra não foi usada" : "regras não foram usadas"} nos últimos 6 meses.
            Considere apagá-las.
          </span>
          <button
            type="button"
            onClick={() => setFilter("stale_6m")}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "var(--accent)",
              color: "var(--accent-on)",
              border: "none",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ver candidatas →
          </button>
        </div>
      )}

      {/* Toolbar: busca + filtro + sort */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar padrão ou categoria…"
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--card2)",
            color: "var(--ink)",
            border: "0.5px solid var(--line-d)",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          style={toolbarSelectStyle}
          title="Filtrar"
        >
          <option value="all">Todas ({rules.length})</option>
          <option value="never_used">Nunca usadas</option>
          <option value="stale_6m">Sem uso há 6+ meses</option>
          <option value="inactive">Desativadas</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          style={toolbarSelectStyle}
          title="Ordenar"
        >
          <option value="alpha">A → Z</option>
          <option value="recent">Usadas recentemente</option>
          <option value="oldest_used">Mais esquecidas</option>
          <option value="newest_created">Criadas recentemente</option>
        </select>
      </div>

      {/* Barra de seleção em massa */}
      {filtered.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 12px",
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--muted)" }}>
            {filtered.length} {filtered.length === 1 ? "regra" : "regras"} visível{filtered.length === 1 ? "" : "is"}
          </span>
          {selected.size === 0 ? (
            <button
              type="button"
              onClick={selectAllVisible}
              style={ghostMiniBtn}
            >
              selecionar todas
            </button>
          ) : (
            <>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                {selected.size} selecionada{selected.size === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={clearSelection} style={ghostMiniBtn}>
                limpar
              </button>
              <button
                type="button"
                onClick={selectAllVisible}
                style={ghostMiniBtn}
              >
                + todas visíveis
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isPending}
                style={{
                  marginLeft: "auto",
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "var(--alert)",
                  color: "white",
                  border: "none",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: isPending ? "wait" : "pointer",
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                Excluir {selected.size}
              </button>
            </>
          )}
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card pad={20}>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {query.trim()
              ? "Nenhuma regra bate com a busca."
              : filter === "never_used"
                ? "Todas as regras foram usadas pelo menos uma vez ✓"
                : filter === "stale_6m"
                  ? "Nenhuma regra está parada há 6+ meses ✓"
                  : filter === "inactive"
                    ? "Nenhuma regra desativada."
                    : "Nenhuma regra."}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r) => {
            const used = formatLastUsed(r.lastAppliedAt);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  style={{
                    accentColor: "var(--accent)",
                    alignSelf: "center",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <RuleRow rule={r} categoryOptions={categoryOptions} />
                  <div
                    style={{
                      padding: "2px 12px 0",
                      fontSize: 10.5,
                      color:
                        used.tone === "warn"
                          ? "var(--alert)"
                          : used.tone === "ok"
                            ? "var(--accent)"
                            : "var(--muted)",
                      fontWeight: used.tone === "warn" ? 700 : 500,
                      letterSpacing: "0.01em",
                    }}
                  >
                    último uso: {used.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const toolbarSelectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

const ghostMiniBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
