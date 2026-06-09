"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { createCategoria } from "@/app/actions/categorias";

type Parent = {
  id: string;
  name: string;
  kind: "expense" | "income";
};

/**
 * Cadastro rápido de categoria — input sempre visível no topo, atalho
 * de teclado (N ou +) pra focar instantaneamente. Sintaxe da entrada:
 *
 *   - "Combustível"            → despesa principal
 *   - "Salário (R)" / "Salário (r)" → receita principal
 *   - "Combustível > Transporte"   → subcategoria de "Transporte"
 *
 * Press Enter cria; Esc tira o foco. Resetar/tipo inline pra ficar
 * rápido sem mouse.
 */
export function QuickAdd({ parents }: { parents: Parent[] }) {
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  // Pai selecionado no select. Vazio = principal. Tem precedência sobre
  // sintaxe "Nome > Pai" no input. Resetado quando alterna kind.
  const [parentSelectId, setParentSelectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Pais disponíveis pro kind atual
  const parentOptions = parents.filter((p) => p.kind === kind);

  // Atalho global: Alt+Enter foca o input (mesmo enquanto digita em outro
  // input — o atalho ganha prioridade).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    setError(null);
    const raw = value.trim();
    if (!raw) return;

    // Parse "Nome > Pai" → subcategoria
    let name = raw;
    let parentName: string | null = null;
    if (raw.includes(">")) {
      const [n, p] = raw.split(">").map((s) => s.trim());
      if (n && p) {
        name = n;
        parentName = p;
      }
    }
    // Detecta tipo via "(R)"/"(r)" inline
    let detectedKind = kind;
    const kindMatch = name.match(/\s*\((r|R)\)\s*$/);
    if (kindMatch) {
      detectedKind = "income";
      name = name.replace(kindMatch[0], "").trim();
    }
    const kindMatchD = name.match(/\s*\((d|D)\)\s*$/);
    if (kindMatchD) {
      detectedKind = "expense";
      name = name.replace(kindMatchD[0], "").trim();
    }

    if (!name) {
      setError("Nome vazio");
      return;
    }

    // Precedência: sintaxe "Nome > Pai" no input > select de pai.
    let parentId: string | null = null;
    if (parentName) {
      const candidate = parents.find(
        (p) =>
          p.kind === detectedKind &&
          p.name.toLowerCase() === parentName!.toLowerCase()
      );
      if (!candidate) {
        setError(`Pai "${parentName}" (${detectedKind === "income" ? "rec" : "desp"}) não existe`);
        return;
      }
      parentId = candidate.id;
    } else if (parentSelectId) {
      const candidate = parents.find(
        (p) => p.id === parentSelectId && p.kind === detectedKind
      );
      if (candidate) parentId = candidate.id;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("kind", detectedKind);
        if (parentId) fd.set("parentId", parentId);
        await createCategoria(fd);
        setValue("");
        // Mantém foco no input pra cadastrar várias seguidas
        inputRef.current?.focus();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div
      style={{
        margin: "0 20px 12px",
        padding: 8,
        borderRadius: 12,
        background: "var(--card)",
        border: "0.5px solid var(--line-d)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* Toggle de kind — clique alterna, ou usa "(R)"/"(D)" no input */}
        <button
          type="button"
          onClick={() => {
            setKind(kind === "expense" ? "income" : "expense");
            // Reset pai ao alternar tipo (pais são por kind)
            setParentSelectId("");
          }}
          title="Alternar tipo (ou use '(R)' no fim do nome)"
          style={{
            padding: "5px 10px",
            borderRadius: 8,
            background:
              kind === "income"
                ? "color-mix(in oklab, var(--ok) 22%, var(--card2))"
                : "color-mix(in oklab, var(--alert) 22%, var(--card2))",
            color: kind === "income" ? "var(--ok)" : "var(--alert)",
            border: `1px solid ${kind === "income" ? "var(--ok)" : "var(--alert)"}`,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          {kind === "income" ? "Receita" : "Despesa"}
        </button>
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
              inputRef.current?.blur();
            }
          }}
          placeholder={
            parentSelectId
              ? `+ subcategoria de ${parentOptions.find((p) => p.id === parentSelectId)?.name ?? "?"}`
              : "+ nova categoria · Enter pra criar · Alt+Enter pra focar"
          }
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "5px 10px",
            borderRadius: 8,
            background: "var(--card2)",
            color: "var(--ink)",
            border: parentSelectId
              ? "0.5px solid var(--accent)"
              : "0.5px solid var(--line-d)",
            fontSize: 12.5,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {/* Select de pai — opcional, vira subcategoria daquela cat. */}
        {parentOptions.length > 0 && (
          <select
            value={parentSelectId}
            onChange={(e) => setParentSelectId(e.target.value)}
            disabled={isPending}
            title="Vincular como subcategoria"
            style={{
              padding: "5px 8px",
              borderRadius: 8,
              background: parentSelectId ? "color-mix(in oklab, var(--accent) 14%, var(--card2))" : "var(--card2)",
              color: parentSelectId ? "var(--accent)" : "var(--muted-d)",
              border: parentSelectId
                ? "0.5px solid var(--accent)"
                : "0.5px solid var(--line-d)",
              fontSize: 11.5,
              fontFamily: "inherit",
              cursor: "pointer",
              maxWidth: 130,
              flexShrink: 0,
            }}
          >
            <option value="">— principal —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                ↳ {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {error ? (
        <div style={{ fontSize: 10.5, color: "var(--alert)", paddingLeft: 4 }}>
          {error}
        </div>
      ) : (
        <div style={{ fontSize: 9.5, color: "var(--muted)", paddingLeft: 4 }}>
          dica: <code>Nome &gt; Pai</code> cria subcategoria · <code>(R)</code> no fim vira receita
        </div>
      )}
    </div>
  );
}
