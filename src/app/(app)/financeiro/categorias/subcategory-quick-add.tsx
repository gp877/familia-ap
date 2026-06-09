"use client";

import { useRef, useState, useTransition } from "react";

import { createCategoria } from "@/app/actions/categorias";

/**
 * Inline rápido pra adicionar subcategoria — usado embaixo da lista de
 * subs em cada categoria principal. Começa colapsado ("+ subcategoria");
 * clica e vira input com Enter pra criar. Mantém aberto pra adicionar
 * várias em sequência (foco volta após criar).
 */
export function SubcategoryQuickAdd({
  parentId,
  parentName,
  kind,
  indent = 0,
}: {
  parentId: string;
  parentName: string;
  kind: "expense" | "income";
  /** Indentação esquerda em px (alinha com a lista de subs) */
  indent?: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    setError(null);
    const name = value.trim();
    if (!name) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("kind", kind);
        fd.set("parentId", parentId);
        await createCategoria(fd);
        setValue("");
        // Mantém aberto + foca pra cadastrar várias em sequência
        inputRef.current?.focus();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          marginLeft: indent,
          padding: "2px 6px",
          background: "transparent",
          color: "var(--muted)",
          border: "none",
          fontSize: 10.5,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.02em",
          textAlign: "left",
        }}
        title={`Adicionar subcategoria de ${parentName}`}
      >
        + subcategoria
      </button>
    );
  }

  return (
    <div
      style={{
        marginLeft: indent,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "1px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>+</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setValue("");
              setError(null);
              setOpen(false);
            }
          }}
          onBlur={() => {
            // Fecha quando perde foco e estiver vazio
            if (!value.trim()) setOpen(false);
          }}
          placeholder={`Subcategoria de ${parentName}…`}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "2px 6px",
            background: "var(--card2)",
            color: "var(--ink)",
            border: "0.5px solid var(--accent)",
            borderRadius: 4,
            fontSize: 11.5,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: 10, color: "var(--alert)", paddingLeft: 16 }}>
          {error}
        </div>
      )}
    </div>
  );
}
