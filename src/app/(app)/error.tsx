"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Error boundary do (app). Captura o erro no Sentry pra debug central
 * e mostra UX limpa pro usuário (digest exibido permite correlacionar
 * com o evento Sentry).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 520,
        margin: "60px auto",
        textAlign: "center",
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--alert)",
          marginBottom: 8,
        }}
      >
        Algo deu errado
      </h1>
      <p style={{ fontSize: 13, color: "var(--muted-d)", lineHeight: 1.5, marginBottom: 24 }}>
        Erro registrado. Você pode tentar de novo ou voltar pra Início.
      </p>

      {error.digest && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--muted)",
            fontFamily: "var(--font-geist-mono), monospace",
            marginBottom: 24,
          }}
        >
          ref: {error.digest}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Tentar de novo
        </button>
        <a
          href="/"
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            background: "var(--card)",
            color: "var(--ink-d)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            border: "0.5px solid var(--line-d)",
          }}
        >
          Início
        </a>
      </div>
    </div>
  );
}
