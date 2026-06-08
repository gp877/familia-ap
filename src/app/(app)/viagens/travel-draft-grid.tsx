"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { upsertTravelDraft } from "@/app/actions/travel-drafts";

type Draft = {
  id: string;
  year: number;
  month: number;
  title: string;
  notes: string | null;
};

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Cores sutis pra rotular cada mês — degrade sazonal. Usadas só como
// borda esquerda do card pra dar identidade visual a cada um, sem poluir.
const MONTH_ACCENT = [
  "#9DC8E6", // jan — verão (azul claro)
  "#A6DCE6",
  "#A8E6CF", // mar — outono
  "#FFD3B6",
  "#FFB6A0",
  "#E6A6C8", // jun — inverno
  "#C8B6E6",
  "#B6C8E6",
  "#A6E6CF", // set — primavera
  "#D6E6A6",
  "#E6C6A6",
  "#E6A6A6", // dez — verão
];

/**
 * Calendário visual do rascunho anual de viagens. 12 cards (3×4 grid no
 * desktop, 2×6 no mobile) — cada um mostra mês + viagem rascunhada (ou
 * empty state pra adicionar). Clica → edita inline.
 *
 * Esse rascunho não tem ligação com /viagens cadastradas nem com roteiros:
 * é só anotação rápida do tipo "Agosto: Noronha".
 */
export function TravelDraftGrid({
  year,
  drafts,
  yearOptions,
}: {
  year: number;
  drafts: Draft[];
  yearOptions: number[];
}) {
  const draftsByMonth = new Map(drafts.map((d) => [d.month, d]));

  return (
    <div style={{ padding: "0 20px" }}>
      {/* Header com ano + chips de navegação */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 2,
            }}
          >
            Rascunho do ano
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              lineHeight: 1,
            }}
          >
            {year}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`/viagens?draftYear=${y}`}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: y === year ? "var(--accent)" : "var(--card)",
                color: y === year ? "var(--accent-on)" : "var(--muted-d)",
                border: y === year ? "none" : "0.5px solid var(--line-d)",
                textDecoration: "none",
              }}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
          <MonthCell
            key={month}
            year={year}
            month={month}
            draft={draftsByMonth.get(month) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  year,
  month,
  draft,
}: {
  year: number;
  month: number;
  draft: Draft | null;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  const accentColor = MONTH_ACCENT[month - 1];
  const isFilled = !!draft;

  function save() {
    startTransition(async () => {
      await upsertTravelDraft({ year, month, title, notes: notes || null });
      setEditing(false);
    });
  }

  function cancel() {
    setTitle(draft?.title ?? "");
    setNotes(draft?.notes ?? "");
    setEditing(false);
  }

  function remove() {
    startTransition(async () => {
      await upsertTravelDraft({ year, month, title: "", notes: null });
      setTitle("");
      setNotes("");
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div
        style={{
          ...cellShellStyle(isFilled, accentColor),
          padding: "12px 12px 10px",
          minHeight: 110,
        }}
      >
        <div style={monthLabelStyle(accentColor)}>{MONTH_NAMES[month - 1]}</div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          placeholder="Ex: Noronha"
          style={inputStyle}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          placeholder="nota (opcional)"
          style={{ ...inputStyle, marginTop: 6, fontSize: 11, fontWeight: 500 }}
        />
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            style={primaryBtnStyle}
          >
            {isPending ? "…" : "Salvar"}
          </button>
          {isFilled && (
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              style={ghostBtnStyle}
              title="Remover viagem"
            >
              limpar
            </button>
          )}
          <button type="button" onClick={cancel} style={ghostBtnStyle}>
            cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        ...cellShellStyle(isFilled, accentColor),
        padding: "12px 12px 14px",
        minHeight: 84,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        color: "inherit",
      }}
    >
      <div style={monthLabelStyle(accentColor)}>
        {MONTH_NAMES[month - 1]}
        <span
          style={{
            color: "var(--muted)",
            marginLeft: 4,
            fontWeight: 600,
            letterSpacing: 0,
          }}
        >
          {String(year).slice(2)}
        </span>
      </div>
      {isFilled && (
        <>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {draft.title}
          </div>
          {draft.notes && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-d)",
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {draft.notes}
            </div>
          )}
        </>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

function cellShellStyle(isFilled: boolean, accent: string): React.CSSProperties {
  return {
    background: isFilled
      ? `linear-gradient(135deg, color-mix(in oklab, ${accent} 10%, var(--card)) 0%, var(--card) 80%)`
      : "var(--card)",
    borderRadius: 14,
    border: `0.5px solid ${isFilled ? "color-mix(in oklab, " + accent + " 35%, var(--line-d))" : "var(--line-d)"}`,
    borderLeft: `3px solid ${accent}`,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    transition: "border-color 120ms",
  };
}

function monthLabelStyle(accent: string): React.CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: accent,
    lineHeight: 1.2,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "7px 10px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "inherit",
  outline: "none",
};

const primaryBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
