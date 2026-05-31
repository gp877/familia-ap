"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";
import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import {
  deleteCategoryRule,
  updateCategoryRule,
} from "@/app/actions/category-rules";

type Rule = {
  id: string;
  pattern: string;
  matchType: "exact" | "prefix" | "contains" | "regex";
  categoryId: string;
  isActive: boolean;
};

const MATCH_TYPE_LABEL: Record<Rule["matchType"], string> = {
  exact: "exato",
  prefix: "começa com",
  contains: "contém",
  regex: "regex",
};

export function RuleRow({
  rule,
  categoryOptions,
}: {
  rule: Rule;
  categoryOptions: CategoryOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [pattern, setPattern] = useState(rule.pattern);
  const [matchType, setMatchType] = useState<Rule["matchType"]>(rule.matchType);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [isPending, startTransition] = useTransition();

  const category = categoryOptions.find((c) => c.id === rule.categoryId);
  const color = category?.color ?? "var(--muted)";

  function save() {
    startTransition(async () => {
      await updateCategoryRule(rule.id, {
        pattern: pattern.trim(),
        matchType,
        categoryId,
      });
      setEditing(false);
    });
  }

  function toggleActive() {
    startTransition(async () => {
      await updateCategoryRule(rule.id, { isActive: !rule.isActive });
    });
  }

  function del() {
    if (
      !confirm(
        "Excluir esta regra? Transações já categorizadas por ela ficam, mas novas não serão categorizadas automaticamente."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteCategoryRule(rule.id);
    });
  }

  if (editing) {
    return (
      <Card pad={14}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as Rule["matchType"])}
              style={selectStyle}
            >
              {(Object.keys(MATCH_TYPE_LABEL) as Rule["matchType"][]).map((t) => (
                <option key={t} value={t}>
                  {MATCH_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="padrão (ex: iFood)"
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>aplicar:</span>
            <CategoryBulkPicker
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              buttonContrast={false}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={save}
              disabled={isPending || !pattern.trim()}
              style={primaryBtnStyle}
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setPattern(rule.pattern);
                setMatchType(rule.matchType);
                setCategoryId(rule.categoryId);
              }}
              disabled={isPending}
              style={ghostBtnStyle}
            >
              Cancelar
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card pad={12}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--muted)",
            border: "0.5px solid var(--line-d)",
            padding: "3px 7px",
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          {MATCH_TYPE_LABEL[rule.matchType]}
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12.5,
            color: rule.isActive ? "var(--ink)" : "var(--muted)",
            background: "color-mix(in oklab, var(--muted) 8%, transparent)",
            padding: "3px 8px",
            borderRadius: 6,
            flex: 1,
            minWidth: 100,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textDecoration: rule.isActive ? "none" : "line-through",
          }}
          title={rule.pattern}
        >
          {rule.pattern}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>→</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: `color-mix(in oklab, ${color} 16%, transparent)`,
            color: "var(--ink-d)",
            fontSize: 11.5,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: color,
            }}
          />
          {category?.label ?? "categoria inexistente"}
        </span>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={toggleActive}
            disabled={isPending}
            style={iconBtnStyle}
            title={rule.isActive ? "Desativar regra" : "Ativar regra"}
          >
            {rule.isActive ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isPending}
            style={iconBtnStyle}
            title="Editar"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={del}
            disabled={isPending}
            style={{ ...iconBtnStyle, color: "var(--alert)" }}
            title="Excluir regra"
          >
            ×
          </button>
        </div>
      </div>
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "1px solid var(--line-d)",
  fontSize: 12.5,
  fontFamily: "var(--font-geist-mono), monospace",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "1px solid var(--line-d)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 14,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 13,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
