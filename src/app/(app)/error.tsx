"use client";

import { useEffect } from "react";

/**
 * Error boundary do (app). Em produção o Next esconde a mensagem real
 * por segurança, mas pra DEBUG da raiz aqui mostramos o stack inteiro
 * + o digest (que correlaciona com os logs do Vercel).
 *
 * REMOVER ou tornar mais conservador depois que o bug de /categorias
 * estiver resolvido.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log no console pra ficar mais fácil copiar
    // eslint-disable-next-line no-console
    console.error("[AppError]", { message: error.message, digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "40px auto",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 12.5,
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--alert)",
          marginBottom: 12,
        }}
      >
        Erro nesta página
      </h1>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--alert)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--alert)" }}>
          Mensagem
        </div>
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {error.message || "(sem mensagem)"}
        </div>
        {error.digest && (
          <>
            <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 4, color: "var(--muted)" }}>
              Digest (correlaciona com logs Vercel)
            </div>
            <div style={{ color: "var(--muted-d)" }}>{error.digest}</div>
          </>
        )}
      </div>

      {error.stack && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--muted)", marginBottom: 8 }}>
            stack trace
          </summary>
          <pre
            style={{
              background: "var(--card)",
              padding: 12,
              borderRadius: 10,
              overflowX: "auto",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--muted-d)",
            }}
          >
            {error.stack}
          </pre>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Tentar de novo
        </button>
        <a
          href="/"
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "var(--card)",
            color: "var(--ink-d)",
            textDecoration: "none",
            fontSize: 12,
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
