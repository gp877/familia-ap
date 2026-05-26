"use client";

import { useRef, useState, useTransition } from "react";

import { createCompromisso } from "@/app/actions/compromissos";

/**
 * Botão grande que vira form expandido inline. Cria compromisso em
 * qualquer data — não está vinculado a fim de semana.
 */
export function AddCompromissoCard({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await createCompromisso(fd);
      form.reset();
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
          defaultValue={defaultDate}
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
          Salvar
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
