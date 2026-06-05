"use client";

import { useRef, useState, useTransition } from "react";

import { createCompromisso } from "@/app/actions/compromissos";

type Recurring = "once" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

const RECURRING_OPTIONS: { value: Recurring; label: string }[] = [
  { value: "once", label: "Uma vez" },
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

const DOW_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DOW_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_FULL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Botão grande que vira form expandido inline. Cria compromisso em
 * qualquer data — não está vinculado a fim de semana. Suporta
 * recorrência: gera múltiplas instâncias compartilhando um seriesId.
 */
export function AddCompromissoCard({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [recurring, setRecurring] = useState<Recurring>("once");
  const [date, setDate] = useState(defaultDate);
  // Estado para weekly: dias da semana selecionados (0=dom..6=sab).
  // Vazio = usa o dia da semana de `date` no submit.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  // Estado para yearly: meses selecionados (1=jan..12=dez).
  const [months, setMonths] = useState<number[]>([]);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Dia da semana / mês deduzidos da data atual — usados pra pré-selecionar.
  const dateObj = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();
  const currentDow = dateObj.getDay();
  const currentMonth = dateObj.getMonth() + 1;

  function toggleDow(d: number) {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function toggleMonth(m: number) {
    setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("recurring", recurring);
    // Anexa seleções como múltiplos valores (formData.getAll no server).
    if (recurring === "weekly") {
      const effective = daysOfWeek.length > 0 ? daysOfWeek : [currentDow];
      for (const d of effective) fd.append("daysOfWeek", String(d));
    }
    if (recurring === "yearly") {
      const effective = months.length > 0 ? months : [currentMonth];
      for (const m of effective) fd.append("months", String(m));
    }
    startTransition(async () => {
      await createCompromisso(fd);
      form.reset();
      setRecurring("once");
      setDaysOfWeek([]);
      setMonths([]);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: 16,
          background: "var(--accent)",
          color: "var(--accent-on)",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        + Adicionar compromisso
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{
        background: "var(--card)",
        borderRadius: 16,
        border: "1px solid var(--accent)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <input
        name="title"
        required
        autoFocus
        placeholder="O que vai rolar?"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--card2)",
          color: "var(--ink)",
          border: "none",
          fontSize: 15,
          fontWeight: 600,
          outline: "none",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input
          type="date"
          name="occurredOn"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={fieldStyle}
        />
        <input type="time" name="time" placeholder="hora" style={fieldStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input
          name="who"
          list="compromisso-who"
          placeholder="quem (opcional)"
          style={fieldStyle}
        />
        <datalist id="compromisso-who">
          <option value="Casal" />
          <option value="Gabriel" />
          <option value="Marília" />
          <option value="Francisco" />
          <option value="Família" />
        </datalist>
        <input
          name="location"
          placeholder="local (opcional)"
          style={fieldStyle}
        />
      </div>
      {/* Recorrência — chips horizontais com rolagem */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          Repetir
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {RECURRING_OPTIONS.map((opt) => {
            const active = recurring === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRecurring(opt.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  background: active
                    ? "var(--accent)"
                    : "var(--card2)",
                  color: active ? "var(--accent-on)" : "var(--muted-d)",
                  border: active
                    ? "1px solid var(--accent)"
                    : "0.5px solid var(--line-d)",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  fontFamily: "inherit",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* Sub-picker semanal: dias da semana (multi) */}
        {recurring === "weekly" && (
          <div style={{ marginTop: 8 }}>
            <div style={pickerLabelStyle}>Dias da semana</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {DOW_LABELS.map((lab, i) => {
                const active =
                  daysOfWeek.length > 0 ? daysOfWeek.includes(i) : i === currentDow;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDow(i)}
                    title={DOW_FULL[i]}
                    style={dayChipStyle(active)}
                  >
                    {lab}
                  </button>
                );
              })}
            </div>
            <div style={hintStyle}>
              {daysOfWeek.length === 0
                ? `usando ${DOW_FULL[currentDow]} (da data) — toque pra escolher outros`
                : `${daysOfWeek.length} dia${daysOfWeek.length > 1 ? "s" : ""} × 52 semanas`}
            </div>
          </div>
        )}

        {/* Sub-picker anual: meses (multi) */}
        {recurring === "yearly" && (
          <div style={{ marginTop: 8 }}>
            <div style={pickerLabelStyle}>Meses</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {MONTH_LABELS.map((lab, i) => {
                const m = i + 1;
                const active = months.length > 0 ? months.includes(m) : m === currentMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    title={MONTH_FULL[i]}
                    style={dayChipStyle(active)}
                  >
                    {lab}
                  </button>
                );
              })}
            </div>
            <div style={hintStyle}>
              {months.length === 0
                ? `usando ${MONTH_FULL[currentMonth - 1]} (da data) — toque pra escolher outros`
                : `${months.length} m${months.length > 1 ? "eses" : "ês"} × 5 anos`}
            </div>
          </div>
        )}

        {/* Descrição inline pros modos simples */}
        {(recurring === "daily" || recurring === "biweekly" || recurring === "monthly") && (
          <div style={{ ...hintStyle, marginTop: 4 }}>
            {recurring === "daily" && "próximos 60 dias"}
            {recurring === "biweekly" && "1× a cada 15 dias × 26"}
            {recurring === "monthly" && "1× por mês × 24"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "transparent",
            color: "var(--muted-d)",
            border: "1px solid var(--line-d)",
            fontWeight: 600,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          cancelar
        </button>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {recurring === "once" ? "Salvar" : "Salvar série"}
        </button>
      </div>
    </form>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "none",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

const pickerLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 6,
};

const hintStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--muted)",
  marginTop: 6,
};

function dayChipStyle(active: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: active ? "var(--accent)" : "var(--card2)",
    color: active ? "var(--accent-on)" : "var(--muted-d)",
    border: active ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  };
}
