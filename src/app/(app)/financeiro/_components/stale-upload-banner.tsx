"use client";

import Link from "next/link";
import { useTransition } from "react";

import { deleteStatementUpload, deleteInvoiceCascade } from "@/app/actions/uploads-delete";

type StaleUpload = {
  id: string;
  filename: string;
  status: string;
  createdAt: string; // ISO
  ageMinutes: number;
  invoiceId: string | null;
};

/**
 * Banner que aparece em /financeiro/extratos e /financeiro/faturas quando
 * existem uploads em estado anormal (processing > 5 min ou failed). Dá
 * ao usuário a opção de apagar e tentar de novo sem ficar com lixo no
 * sistema.
 */
export function StaleUploadBanner({
  uploads,
  uploadKind,
}: {
  uploads: StaleUpload[];
  uploadKind: "statement" | "invoice";
}) {
  const [isPending, startTransition] = useTransition();

  if (uploads.length === 0) return null;

  function cleanup(u: StaleUpload) {
    const msg = u.status === "processing"
      ? `Apagar upload "${u.filename}" travado há ${u.ageMinutes} min?`
      : `Apagar upload "${u.filename}" que falhou?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        if (uploadKind === "invoice" && u.invoiceId) {
          await deleteInvoiceCascade(u.invoiceId);
        } else {
          await deleteStatementUpload(u.id);
        }
      } catch (err) {
        alert(`Falha ao apagar: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div
      style={{
        margin: "12px 20px 0",
        padding: 12,
        background: "color-mix(in oklab, var(--alert) 14%, var(--card))",
        border: "1px solid var(--alert)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--alert)",
        }}
      >
        ⚠ {uploads.length} upload{uploads.length === 1 ? "" : "s"} {uploads.length === 1 ? "incompleto" : "incompletos"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-d)", lineHeight: 1.5 }}>
        Uploads abaixo travaram durante o processamento ou falharam. Apague pra reenviar o arquivo limpo.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {uploads.map((u) => (
          <div
            key={u.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              background: "var(--card2)",
              borderRadius: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {u.filename}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                {u.status === "processing"
                  ? `travado há ${u.ageMinutes} min`
                  : `falhou há ${u.ageMinutes} min`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => cleanup(u)}
              disabled={isPending}
              style={{
                padding: "4px 10px",
                background: "var(--alert)",
                color: "var(--accent-on)",
                border: "none",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: isPending ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {isPending ? "…" : "Apagar"}
            </button>
          </div>
        ))}
      </div>
      <Link
        href={uploadKind === "invoice" ? "/financeiro/faturas/upload" : "/financeiro/upload"}
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--accent)",
          textDecoration: "underline",
          textAlign: "center" as const,
        }}
      >
        ir pra tela de upload →
      </Link>
    </div>
  );
}
