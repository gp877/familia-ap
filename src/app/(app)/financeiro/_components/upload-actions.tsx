"use client";

import { useTransition } from "react";

import {
  deleteInvoiceCascade,
  deleteStatementUpload,
} from "@/app/actions/uploads-delete";

/**
 * Botões de ação pra extratos: "Ver PDF" abre o blob em nova aba; "Excluir"
 * apaga upload + todas as transações vinculadas. Confirma antes de apagar.
 */
export function StatementActions({
  uploadId,
  blobUrl,
  filename,
  txCount,
}: {
  uploadId: string;
  blobUrl: string | null;
  filename: string;
  txCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const hasFile = !!(blobUrl && blobUrl.startsWith("http"));

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm(
      `Excluir o extrato "${filename}" e as ${txCount} transações vinculadas? Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteStatementUpload(uploadId);
      } catch (err) {
        alert(`Falha ao excluir: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div
      style={{ display: "flex", gap: 6, marginTop: 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasFile ? (
        <a
          href={blobUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={btnStyle("ghost")}
        >
          📄 Ver PDF
        </a>
      ) : (
        <span style={{ ...btnStyle("ghost"), opacity: 0.4, cursor: "default" }}>
          📄 (sem arquivo)
        </span>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        style={btnStyle("danger")}
      >
        {isPending ? "Excluindo…" : "Excluir"}
      </button>
    </div>
  );
}

/**
 * Botões de ação pra faturas: "Ver PDF" (se houver upload vinculado) e
 * "Excluir" → apaga fatura + upload + todas as transações.
 */
export function InvoiceActions({
  invoiceId,
  blobUrl,
  referenceMonth,
  txCount,
}: {
  invoiceId: string;
  blobUrl: string | null;
  referenceMonth: string;
  txCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const hasFile = !!(blobUrl && blobUrl.startsWith("http"));

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm(
      `Excluir a fatura de ${referenceMonth} e as ${txCount} transações lançadas? Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteInvoiceCascade(invoiceId);
      } catch (err) {
        alert(`Falha ao excluir: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div
      style={{ display: "flex", gap: 6, marginTop: 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasFile ? (
        <a
          href={blobUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={btnStyle("ghost")}
        >
          📄 Ver PDF
        </a>
      ) : (
        <span style={{ ...btnStyle("ghost"), opacity: 0.4, cursor: "default" }}>
          📄 (sem arquivo)
        </span>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        style={btnStyle("danger")}
      >
        {isPending ? "Excluindo…" : "Excluir"}
      </button>
    </div>
  );
}

function btnStyle(tone: "ghost" | "danger"): React.CSSProperties {
  const isDanger = tone === "danger";
  return {
    flex: 1,
    padding: "5px 10px",
    borderRadius: 7,
    background: "transparent",
    color: isDanger ? "var(--alert)" : "var(--muted-d)",
    border: `0.5px solid ${isDanger ? "var(--alert)" : "var(--line-d)"}`,
    fontSize: 10.5,
    fontWeight: 700,
    textDecoration: "none",
    textAlign: "center" as const,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.02em",
  };
}
