"use client";

import { useState, useTransition } from "react";

import { DeleteBtn } from "@/components/ap/inline-form";
import { SortableList } from "@/components/ap/sortable-list";
import { DragHandle } from "@/components/ap/sortable-list";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import {
  deleteCategoriaWithMerge,
  patchCategoria,
  reorderCategoriasForm,
} from "@/app/actions/categorias";

type CatLite = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string | null;
  parentId: string | null;
  txCount: number;
};

/**
 * Card de categoria principal (parent). Mostra cor, nome editável,
 * subcategorias inline editáveis, contador de transações e botão de
 * delete-with-merge.
 */
export function CategoryCard({
  cat,
  subs,
  totalCount,
  mergeOptions,
}: {
  cat: CatLite;
  subs: CatLite[];
  totalCount: number;
  mergeOptions: { id: string; label: string }[];
}) {
  const accent = cat.kind === "income" ? "var(--ok)" : "var(--accent)";
  const cardColor = cat.color || fallbackColorFor(cat.id, cat.kind);

  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 14,
        border: "0.5px solid var(--line-d)",
        borderLeft: `4px solid ${cardColor}`,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header: handle + cor + nome + count + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DragHandle />
        <ColorPicker id={cat.id} currentColor={cardColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineEditInput
            initialValue={cat.name}
            action={patchCategoria}
            hiddenFields={{ id: cat.id }}
            fieldName="name"
            fontSize={14}
            fontWeight={700}
          />
        </div>
        {totalCount > 0 && (
          <span
            className="ap-num"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: accent,
              background: `color-mix(in oklab, ${accent} 18%, transparent)`,
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            {totalCount}
          </span>
        )}
        <DeleteWithMerge cat={cat} mergeOptions={mergeOptions} />
      </div>

      {/* Subcategorias — arrastáveis pra reordenar entre si */}
      {subs.length > 0 && (
        <div style={{ paddingLeft: 28 }}>
          <SortableList
            action={reorderCategoriasForm}
            items={subs.map((sub) => ({
              id: sub.id,
              content: (
                <SubcategoryRow
                  sub={sub}
                  mergeOptions={mergeOptions.filter((m) => m.id !== sub.id)}
                />
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}

function SubcategoryRow({
  sub,
  mergeOptions,
}: {
  sub: CatLite;
  mergeOptions: { id: string; label: string }[];
}) {
  const accent = sub.kind === "income" ? "var(--ok)" : "var(--accent)";
  const color = sub.color || fallbackColorFor(sub.id, sub.kind);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        borderRadius: 8,
        background: "var(--card2)",
      }}
    >
      <DragHandle />
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: color,
          flexShrink: 0,
        }}
      />
      <ColorPicker id={sub.id} currentColor={color} small />
      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineEditInput
          initialValue={sub.name}
          action={patchCategoria}
          hiddenFields={{ id: sub.id }}
          fieldName="name"
          fontSize={12.5}
          fontWeight={500}
        />
      </div>
      {sub.txCount > 0 && (
        <span style={{ fontSize: 10.5, color: accent, fontWeight: 700 }}>
          {sub.txCount}
        </span>
      )}
      <DeleteWithMerge cat={sub} mergeOptions={mergeOptions} compact />
    </div>
  );
}

function ColorPicker({
  id,
  currentColor,
  small = false,
}: {
  id: string;
  currentColor: string;
  small?: boolean;
}) {
  const [color, setColor] = useState(currentColor);
  const [, startTransition] = useTransition();
  const size = small ? 18 : 26;
  return (
    <label
      title="Cor da categoria"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color,
        border: "1.5px solid var(--bg)",
        boxShadow: `0 0 0 1px var(--line-d)`,
        cursor: "pointer",
        flexShrink: 0,
        display: "block",
      }}
    >
      <input
        type="color"
        value={normalizeHex(color)}
        onChange={(e) => {
          const next = e.target.value;
          setColor(next);
          const fd = new FormData();
          fd.set("id", id);
          fd.set("color", next);
          startTransition(async () => {
            await patchCategoria(fd);
          });
        }}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
          width: "100%",
          height: "100%",
        }}
        aria-label="Escolher cor"
      />
    </label>
  );
}

function DeleteWithMerge({
  cat,
  mergeOptions,
  compact = false,
}: {
  cat: CatLite;
  mergeOptions: { id: string; label: string }[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  if (cat.txCount === 0 && !open) {
    // Sem lançamentos: delete direto (mesmo comportamento do DeleteBtn original)
    return (
      <DeleteBtn
        action={() => deleteCategoriaWithMerge(cat.id, null)}
        confirmMsg={null}
      />
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Excluir"
        title={`Excluir (tem ${cat.txCount} lançamentos)`}
        style={{
          width: compact ? 24 : 32,
          height: compact ? 24 : 32,
          borderRadius: compact ? 12 : 16,
          background: "transparent",
          color: "var(--alert)",
          border: "0.5px solid var(--line-d)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    );
  }

  function handleConfirm() {
    startTransition(async () => {
      await deleteCategoriaWithMerge(cat.id, target || null);
      setOpen(false);
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        background: "var(--card2)",
        borderRadius: 10,
        border: "1px solid var(--alert)",
        position: "absolute",
        right: 8,
        top: "100%",
        zIndex: 5,
        minWidth: 240,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--alert)", fontWeight: 700 }}>
        Excluir "{cat.name}" · {cat.txCount} lançamentos
      </div>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{
          padding: "6px 8px",
          borderRadius: 8,
          background: "var(--card)",
          color: "var(--ink)",
          border: "0.5px solid var(--line-d)",
          fontSize: 12.5,
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        <option value="">→ deixar lançamentos sem categoria</option>
        {mergeOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            → mover pra: {opt.label}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 8,
            background: "transparent",
            color: "var(--muted-d)",
            border: "0.5px solid var(--line-d)",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 8,
            background: "var(--alert)",
            color: "#fff",
            border: "none",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isPending ? "removendo…" : "Excluir"}
        </button>
      </div>
    </div>
  );
}

function normalizeHex(c: string): string {
  // Garante #rrggbb pro input type=color
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return "#B8FF5C";
}

/** Cor determinística pra categorias sem cor definida. */
function fallbackColorFor(id: string, kind: "expense" | "income"): string {
  const palette =
    kind === "income"
      ? ["#7BD86F", "#5DA9FF", "#B8FF5C", "#FFB85C", "#9DDFD3"]
      : ["#FF7A35", "#FF4FA3", "#B57FFF", "#FFB85C", "#5DA9FF", "#FF8866"];
  // Hash simples do id pra escolher uma cor da paleta
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
