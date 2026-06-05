"use client";

import { useTransition } from "react";

import { deleteSeries } from "@/app/actions/compromissos";

/**
 * Botão pra deletar a série inteira de compromissos recorrentes.
 * Renderizado quando o compromisso tem seriesId. O DeleteBtn normal
 * (do inline-form) continua deletando só a instância.
 */
export function SeriesDeleteButton({ seriesId, name }: { seriesId: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  function handle() {
    if (
      !confirm(
        `Remover TODOS os compromissos da série "${name}" (inclui futuros e passados)?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteSeries(seriesId);
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={isPending}
      title="Remover série inteira"
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        background: "transparent",
        color: "var(--alert)",
        border: "0.5px dashed var(--alert)",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        padding: 0,
        flexShrink: 0,
      }}
      aria-label="Remover série"
    >
      ⊘
    </button>
  );
}
