"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createReceita, importarReceitaDeUrl } from "@/app/actions/cardapio";

/**
 * 2 caminhos pra criar receita:
 *  1. Colar URL → IA extrai
 *  2. Criar manualmente (só título; resto edita no detalhe)
 */
export function ImportRecipeForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "url" | "manual">("closed");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleImport() {
    setError(null);
    const fd = new FormData();
    fd.set("url", url.trim());
    startTransition(async () => {
      try {
        const r = await importarReceitaDeUrl(fd);
        setUrl("");
        setMode("closed");
        router.push(`/cardapio/receitas/${r.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    });
  }

  function handleManual() {
    setError(null);
    const fd = new FormData();
    fd.set("title", title.trim());
    startTransition(async () => {
      try {
        const r = await createReceita(fd);
        setTitle("");
        setMode("closed");
        router.push(`/cardapio/receitas/${r.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    });
  }

  if (mode === "closed") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode("url")}
          style={{
            padding: "14px 12px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            letterSpacing: "-0.01em",
          }}
        >
          <span>Colar link</span>
          <span style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 600 }}>
            Insta · YouTube · blog
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          style={{
            padding: "14px 12px",
            borderRadius: 14,
            background: "var(--card)",
            color: "var(--ink)",
            border: "0.5px solid var(--line-d)",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            letterSpacing: "-0.01em",
          }}
        >
          <span>Criar do zero</span>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>
            cadastrar manualmente
          </span>
        </button>
      </div>
    );
  }

  if (mode === "url") {
    return (
      <div
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
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          Colar link de receita
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://instagram.com/reel/… ou youtube.com/watch?v=…"
          autoFocus
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) handleImport();
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--card2)",
            color: "var(--ink)",
            border: "none",
            fontSize: 15,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: "var(--alert)" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setMode("closed");
              setUrl("");
              setError(null);
            }}
            disabled={isPending}
            style={btnSecondaryStyle}
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isPending || !url.trim()}
            style={btnPrimaryStyle}
          >
            {isPending ? "extraindo com IA…" : "Importar"}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4 }}>
          A AP baixa o conteúdo do link e extrai título, ingredientes, passo-a-passo,
          tempo e porções. Se faltar alguma coisa você ajusta no detalhe.
        </div>
      </div>
    );
  }

  // manual
  return (
    <div
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Nova receita
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nome da receita"
        autoFocus
        disabled={isPending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) handleManual();
        }}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--card2)",
          color: "var(--ink)",
          border: "none",
          fontSize: 15,
          outline: "none",
          fontFamily: "inherit",
        }}
      />
      {error && <div style={{ fontSize: 12, color: "var(--alert)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            setMode("closed");
            setTitle("");
            setError(null);
          }}
          disabled={isPending}
          style={btnSecondaryStyle}
        >
          cancelar
        </button>
        <button
          type="button"
          onClick={handleManual}
          disabled={isPending || !title.trim()}
          style={btnPrimaryStyle}
        >
          {isPending ? "criando…" : "Criar e editar"}
        </button>
      </div>
    </div>
  );
}

const btnPrimaryStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: 10,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "transparent",
  color: "var(--muted-d)",
  border: "1px solid var(--line-d)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
