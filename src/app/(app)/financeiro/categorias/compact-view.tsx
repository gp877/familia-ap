"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  deleteCategoriaWithMerge,
  patchCategoria,
  reorderCategorias,
} from "@/app/actions/categorias";

type Cat = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string | null;
  parentId: string | null;
};

/**
 * Visão compacta editável das categorias. Comparada à versão estática,
 * permite:
 *   - Editar o nome inline (clique → input → enter salva)
 *   - Reordenar via drag dentro do mesmo grupo (kind + parent)
 *   - Mover pra outro pai ou tornar principal via menu
 *
 * Usa HTML5 drag-and-drop nativo (sem libs). O drag só vale dentro do
 * mesmo grupo (mesma kind e mesmo parentId). Pra trocar pai, use o
 * menu "↪".
 */
export function CompactView({
  expenseParents,
  incomeParents,
  childrenByParent,
  countByCategory,
}: {
  expenseParents: Cat[];
  incomeParents: Cat[];
  childrenByParent: Record<string, Cat[]>;
  countByCategory: Record<string, number>;
}) {
  return (
    <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Group
        title="Despesas"
        tone="alert"
        parents={expenseParents}
        allParents={expenseParents}
        childrenByParent={childrenByParent}
        countByCategory={countByCategory}
      />
      <Group
        title="Receitas"
        tone="ok"
        parents={incomeParents}
        allParents={incomeParents}
        childrenByParent={childrenByParent}
        countByCategory={countByCategory}
      />
    </div>
  );
}

function Group({
  title,
  tone,
  parents,
  allParents,
  childrenByParent,
  countByCategory,
}: {
  title: string;
  tone: "alert" | "ok";
  parents: Cat[];
  allParents: Cat[];
  childrenByParent: Record<string, Cat[]>;
  countByCategory: Record<string, number>;
}) {
  // Reorder local dos parents — server action é chamada via reorderCategorias
  const [parentOrder, setParentOrder] = useState<string[]>(parents.map((p) => p.id));
  // Reset quando lista de parents do server muda
  useEffect(() => {
    setParentOrder(parents.map((p) => p.id));
  }, [parents]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: "0.5px solid var(--line-d)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: `var(--${tone})`,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
          {parents.length}
        </span>
      </div>
      {parents.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", padding: "4px 0" }}>
          nenhuma cadastrada
        </div>
      ) : (
        <SortableRows
          orderedIds={parentOrder}
          onReorder={setParentOrder}
          renderRow={(parentId) => {
            const p = parents.find((x) => x.id === parentId);
            if (!p) return null;
            const subs = childrenByParent[p.id] ?? [];
            return (
              <ParentBlock
                key={p.id}
                parent={p}
                subs={subs}
                allParents={allParents}
                countByCategory={countByCategory}
              />
            );
          }}
        />
      )}
    </div>
  );
}

function ParentBlock({
  parent,
  subs,
  allParents,
  countByCategory,
}: {
  parent: Cat;
  subs: Cat[];
  allParents: Cat[];
  countByCategory: Record<string, number>;
}) {
  const [subOrder, setSubOrder] = useState<string[]>(subs.map((s) => s.id));
  useEffect(() => {
    setSubOrder(subs.map((s) => s.id));
  }, [subs]);

  return (
    <div>
      <Row cat={parent} count={countByCategory[parent.id] ?? 0} allParents={allParents} />
      {subs.length > 0 && (
        <SortableRows
          orderedIds={subOrder}
          onReorder={setSubOrder}
          renderRow={(subId) => {
            const s = subs.find((x) => x.id === subId);
            if (!s) return null;
            return (
              <Row
                key={s.id}
                cat={s}
                count={countByCategory[s.id] ?? 0}
                allParents={allParents}
                sub
              />
            );
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SortableRows — drag nativo HTML5 entre itens da mesma lista.
// Quando solta, chama `reorderCategorias` (server action).
// ────────────────────────────────────────────────────────────

function SortableRows({
  orderedIds,
  onReorder,
  renderRow,
}: {
  orderedIds: string[];
  onReorder: (next: string[]) => void;
  renderRow: (id: string) => React.ReactNode;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      // alguns browsers travam quando setData não é chamado num handler "real"
    }
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(overId);
    if (dragOverRef.current === overId) return;
    dragOverRef.current = overId;
    if (!draggingId || draggingId === overId) return;
    const from = orderedIds.indexOf(draggingId);
    const to = orderedIds.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...orderedIds];
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    onReorder(next);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
    dragOverRef.current = null;
    startTransition(async () => {
      try {
        await reorderCategorias(orderedIds);
      } catch (err) {
        console.error("[CompactView] reorder falhou:", err);
      }
    });
  }

  return (
    <>
      {orderedIds.map((id) => {
        const isDragging = draggingId === id;
        const isDropTarget = dropTargetId === id && draggingId !== id;
        return (
          <div
            key={id}
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => e.preventDefault()}
            style={{
              opacity: isDragging ? 0.35 : 1,
              background: isDragging
                ? "color-mix(in oklab, var(--accent) 12%, var(--card))"
                : isDropTarget
                  ? "color-mix(in oklab, var(--accent) 6%, transparent)"
                  : "transparent",
              borderRadius: 6,
              boxShadow: isDragging
                ? "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px var(--accent)"
                : "none",
              transform: isDragging ? "scale(0.99)" : "scale(1)",
              transition:
                "background 100ms ease, box-shadow 120ms ease, transform 120ms ease, opacity 100ms ease",
              cursor: isDragging ? "grabbing" : "default",
              position: "relative",
            }}
          >
            {/* Indicador de drop — linha lima fina no topo */}
            {isDropTarget && (
              <div
                style={{
                  position: "absolute",
                  top: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--accent)",
                  borderRadius: 1,
                  pointerEvents: "none",
                }}
              />
            )}
            {renderRow(id)}
          </div>
        );
      })}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Row — uma linha editável: chip de cor + nome (clique edita) +
// contador + menu de ações (mover / virar principal)
// ────────────────────────────────────────────────────────────

function Row({
  cat,
  count,
  allParents,
  sub = false,
}: {
  cat: Cat;
  count: number;
  allParents: Cat[];
  sub?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sync com props quando server revalidar
  useEffect(() => {
    setName(cat.name);
  }, [cat.name]);

  function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === cat.name) {
      setName(cat.name);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("name", trimmed);
      await patchCategoria(fd);
      setEditing(false);
    });
  }

  function moveToParent(newParentId: string | null) {
    setMoveOpen(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("parentId", newParentId ?? "");
      await patchCategoria(fd);
    });
  }

  function performDelete(replaceWithId: string | null) {
    setDeleteOpen(false);
    const msg = replaceWithId
      ? `Apagar "${cat.name}" e mover as ${count} transações pra outra categoria?`
      : `Apagar "${cat.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        await deleteCategoriaWithMerge(cat.id, replaceWithId);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  }

  // Opções pro menu "mover": outras categorias principais do mesmo kind
  // (não pode virar filha de si mesma). Plus opção "Tornar principal".
  const moveOptions = useMemo(
    () => allParents.filter((p) => p.id !== cat.id),
    [allParents, cat.id]
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 0",
        paddingLeft: sub ? 16 : 0,
        minHeight: 24,
        position: "relative",
      }}
    >
      <span
        style={{
          color: "var(--muted-d)",
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: -2,
          cursor: "grab",
          flexShrink: 0,
          userSelect: "none",
          padding: "0 2px",
        }}
        title="Arraste pra reordenar"
        aria-hidden
      >
        ⋮⋮
      </span>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: cat.color ?? "var(--muted)",
          flexShrink: 0,
          opacity: sub ? 0.7 : 1,
        }}
      />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(cat.name);
              setEditing(false);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--card2)",
            color: "var(--ink)",
            border: "0.5px solid var(--accent)",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: sub ? 11.5 : 12.5,
            fontWeight: sub ? 500 : 700,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            padding: "1px 4px",
            textAlign: "left",
            fontSize: sub ? 11.5 : 12.5,
            fontWeight: sub ? 500 : 700,
            color: sub ? "var(--muted-d)" : "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: "text",
            fontFamily: "inherit",
            borderRadius: 4,
          }}
          title="Clique pra renomear"
        >
          {cat.name}
        </button>
      )}
      <span
        className="ap-num"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: count > 0 ? "var(--muted-d)" : "var(--muted)",
          flexShrink: 0,
        }}
      >
        {count > 0 ? count : "—"}
      </span>
      <button
        type="button"
        onClick={() => setMoveOpen((v) => !v)}
        disabled={isPending}
        title="Mover pra outro pai"
        style={{
          padding: "1px 6px",
          background: moveOpen ? "var(--card2)" : "transparent",
          color: "var(--muted-d)",
          border: "none",
          fontSize: 12,
          cursor: "pointer",
          lineHeight: 1,
          borderRadius: 4,
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        ↪
      </button>
      {moveOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 24,
            zIndex: 10,
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            maxHeight: 280,
            overflowY: "auto",
          }}
          onMouseLeave={() => setMoveOpen(false)}
        >
          {sub && (
            <button
              type="button"
              onClick={() => moveToParent(null)}
              style={menuItemStyle()}
            >
              ↑ Tornar principal
            </button>
          )}
          {moveOptions.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "6px 8px 2px",
                }}
              >
                Mover pra
              </div>
              {moveOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => moveToParent(p.id)}
                  style={menuItemStyle()}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1.5,
                      background: p.color ?? "var(--muted)",
                      display: "inline-block",
                      marginRight: 6,
                    }}
                  />
                  {p.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setDeleteOpen((v) => !v)}
        disabled={isPending}
        title="Apagar categoria"
        style={{
          padding: "1px 6px",
          background: deleteOpen ? "var(--card2)" : "transparent",
          color: "var(--alert)",
          border: "none",
          fontSize: 12,
          cursor: "pointer",
          lineHeight: 1,
          borderRadius: 4,
          flexShrink: 0,
          fontFamily: "inherit",
          fontWeight: 700,
        }}
      >
        ✕
      </button>
      {deleteOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 10,
            background: "var(--card)",
            border: "0.5px solid var(--alert)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            minWidth: 200,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            maxHeight: 280,
            overflowY: "auto",
          }}
          onMouseLeave={() => setDeleteOpen(false)}
        >
          {count === 0 ? (
            <>
              {/* Sem transações vinculadas — apaga direto. */}
              <button
                type="button"
                onClick={() => performDelete(null)}
                style={{ ...menuItemStyle(), color: "var(--alert)" }}
              >
                ✕ Apagar
              </button>
            </>
          ) : moveOptions.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-d)",
                padding: "10px 10px",
                lineHeight: 1.4,
                fontStyle: "italic",
              }}
            >
              {count} {count === 1 ? "transação está vinculada" : "transações estão vinculadas"}.
              Cadastre outra categoria do mesmo tipo antes de apagar.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--alert)",
                  padding: "6px 8px 2px",
                }}
              >
                Apagar e mover {count} {count === 1 ? "tx pra" : "txs pra"}
              </div>
              {moveOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => performDelete(p.id)}
                  style={menuItemStyle()}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1.5,
                      background: p.color ?? "var(--muted)",
                      display: "inline-block",
                      marginRight: 6,
                    }}
                  />
                  {p.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(): React.CSSProperties {
  return {
    padding: "5px 8px",
    background: "transparent",
    color: "var(--ink)",
    border: "none",
    fontSize: 11.5,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: 5,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
  };
}
