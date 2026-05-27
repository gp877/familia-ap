"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { agendarAlmoco, limparAlmoco } from "@/app/actions/cardapio";

type Entry = {
  id: string;
  mealDate: string;
  receitaId: string | null;
  title: string | null;
  notes: string | null;
  receita: {
    id: string;
    title: string;
    imageUrl: string | null;
  } | null;
};

type ReceitaOption = { id: string; title: string; imageUrl: string | null };

/**
 * Cartão de 1 dia da semana — clica pra editar inline.
 * Mostra: dia da semana + número + texto do almoço (ou "vazio").
 * Em edição: autocomplete de receitas + texto livre.
 */
export function LunchEditor({
  date,
  dowShort,
  dowFull,
  dayNumber,
  isToday,
  entry,
  receitas,
}: {
  date: string;
  dowShort: string;
  dowFull: string;
  dayNumber: number;
  isToday: boolean;
  entry: Entry | null;
  receitas: ReceitaOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(entry?.title ?? "");
  const [selectedReceita, setSelectedReceita] = useState<ReceitaOption | null>(
    entry?.receita ?? null
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sincroniza com server-state quando entry muda (após revalidate)
  useEffect(() => {
    setQuery(entry?.title ?? "");
    setSelectedReceita(entry?.receita ?? null);
  }, [entry?.id, entry?.title, entry?.receita?.id]);

  const filtered =
    query.length >= 1
      ? receitas
          .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)
      : receitas.slice(0, 6);

  function save(receitaId: string | null, title: string) {
    const fd = new FormData();
    fd.set("mealDate", date);
    if (receitaId) fd.set("receitaId", receitaId);
    if (title.trim()) fd.set("title", title);
    startTransition(async () => {
      await agendarAlmoco(fd);
      setEditing(false);
    });
  }

  function clear() {
    startTransition(async () => {
      await limparAlmoco(date);
      setQuery("");
      setSelectedReceita(null);
      setEditing(false);
    });
  }

  const hasContent = entry && (entry.receita || entry.title);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: 14,
          background: "var(--card)",
          border: isToday
            ? "1px solid var(--accent)"
            : "0.5px solid var(--line-d)",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "48px 1fr auto",
          gap: 12,
          alignItems: "center",
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            className="ap-num"
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: isToday ? "var(--accent)" : "var(--ink)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            {String(dayNumber).padStart(2, "0")}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: isToday ? "var(--accent)" : "var(--muted)",
              marginTop: 3,
            }}
          >
            {dowShort}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {dowFull}
          </div>
          {hasContent ? (
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                color: "var(--ink)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry!.receita?.title ?? entry!.title}
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "var(--muted)",
                fontStyle: "italic",
                marginTop: 2,
              }}
            >
              definir almoço
            </div>
          )}
        </div>
        {entry?.receita?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.receita.imageUrl}
            alt={entry.receita.title}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              objectFit: "cover",
            }}
          />
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: "var(--card)",
        border: "1px solid var(--accent)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div>
          <span
            className="ap-num"
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent)",
              marginRight: 8,
            }}
          >
            {String(dayNumber).padStart(2, "0")}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-d)",
            }}
          >
            {dowFull}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery(entry?.title ?? "");
            setSelectedReceita(entry?.receita ?? null);
            setEditing(false);
          }}
          style={{
            fontSize: 11,
            color: "var(--muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          cancelar
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedReceita(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save(selectedReceita?.id ?? null, query);
          }
        }}
        placeholder="Strogonoff · Salada caesar · …"
        disabled={isPending}
        style={{
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

      {filtered.length > 0 && !selectedReceita && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectedReceita(r);
                setQuery(r.title);
                save(r.id, r.title);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--card2)",
                color: "var(--ink)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.imageUrl}
                  alt={r.title}
                  style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {r.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {hasContent && (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "transparent",
              color: "var(--muted-d)",
              border: "1px solid var(--line-d)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            limpar
          </button>
        )}
        <button
          type="button"
          onClick={() => save(selectedReceita?.id ?? null, query)}
          disabled={isPending || (!query.trim() && !selectedReceita)}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isPending ? "salvando…" : "Salvar"}
        </button>
        {selectedReceita && (
          <Link
            href={`/cardapio/receitas/${selectedReceita.id}`}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--card2)",
              color: "var(--ink)",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
            }}
          >
            abrir receita
          </Link>
        )}
      </div>
    </div>
  );
}
