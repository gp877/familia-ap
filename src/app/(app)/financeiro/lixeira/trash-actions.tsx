"use client";

import { useTransition } from "react";

import { emptyTrash, purgeTrashBatch, restoreTrashBatch } from "@/app/actions/trash";

function btnStyle(tone: "ghost" | "danger"): React.CSSProperties {
  const isDanger = tone === "danger";
  return {
    padding: "5px 10px",
    borderRadius: 7,
    background: "transparent",
    color: isDanger ? "var(--alert)" : "var(--muted-d)",
    border: `0.5px solid ${isDanger ? "var(--alert)" : "var(--line-d)"}`,
    fontSize: 10.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.02em",
  };
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Restaurar / Apagar de vez de um lote da Lixeira. */
export function BatchActions({ batchId, count }: { batchId: string; count: number }) {
  const [isPending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      try {
        const r = await restoreTrashBatch(batchId);
        if (r.skipped.length) {
          alert(
            `${r.restored} restaurado(s). Não voltaram:\n` +
              r.skipped.map((s) => `• ${s.label} — ${s.motivo}`).join("\n")
          );
        }
      } catch (err) {
        alert(`Falha ao restaurar: ${errMsg(err)}`);
      }
    });
  }

  function purge() {
    if (!confirm(`Apagar DEFINITIVAMENTE ${count} item(ns)? Isso não tem volta.`)) return;
    startTransition(async () => {
      try {
        await purgeTrashBatch(batchId);
      } catch (err) {
        alert(`Falha ao apagar: ${errMsg(err)}`);
      }
    });
  }

  return (
    <div style={{ display: "flex", gap: 6, opacity: isPending ? 0.5 : 1 }}>
      <button type="button" onClick={restore} disabled={isPending} style={btnStyle("ghost")}>
        ↺ Restaurar
      </button>
      <button type="button" onClick={purge} disabled={isPending} style={btnStyle("danger")}>
        Apagar de vez
      </button>
    </div>
  );
}

export function EmptyTrashButton({ count }: { count: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending || count === 0}
      onClick={() => {
        if (!confirm(`Esvaziar a Lixeira (${count} itens)? Tudo some DEFINITIVAMENTE.`)) return;
        startTransition(async () => {
          try {
            await emptyTrash();
          } catch (err) {
            alert(`Falha ao esvaziar: ${errMsg(err)}`);
          }
        });
      }}
      style={{ ...btnStyle("danger"), opacity: isPending || count === 0 ? 0.4 : 1 }}
    >
      Esvaziar lixeira
    </button>
  );
}
