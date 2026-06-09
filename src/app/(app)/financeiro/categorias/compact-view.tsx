"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  deleteCategoriaWithMerge,
  patchCategoria,
  reorderCategorias,
} from "@/app/actions/categorias";

import { SubcategoryQuickAdd } from "./subcategory-quick-add";

type Cat = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string | null;
  parentId: string | null;
  notes: string | null;
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

  async function reparent(draggedId: string, newParentId: string) {
    const fd = new FormData();
    fd.set("id", draggedId);
    fd.set("parentId", newParentId);
    await patchCategoria(fd);
  }

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
          onReparent={reparent}
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
      <SubcategoryQuickAdd
        parentId={parent.id}
        parentName={parent.name}
        kind={parent.kind}
        indent={16}
      />
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
  onReparent,
  renderRow,
}: {
  orderedIds: string[];
  onReorder: (next: string[]) => void;
  /** Se passado, hover no centro de um item vira "reparentar":
   *  o item arrastado vira filho do item-alvo. */
  onReparent?: (draggedId: string, newParentId: string) => Promise<void> | void;
  renderRow: (id: string) => React.ReactNode;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // "reorder" = linha indicadora; "reparent" = highlight de fundo (vira filho)
  const [dropMode, setDropMode] = useState<"reorder" | "reparent">("reorder");
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

    // Detecta zona Y do cursor pra decidir reorder vs reparent.
    // Zona central (33%–67% da altura) → reparent. Bordas → reorder.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    const wantsReparent = !!onReparent && relY > 0.33 && relY < 0.67 && draggingId !== overId;
    setDropMode(wantsReparent ? "reparent" : "reorder");

    if (wantsReparent) return; // não reorder se for reparent
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

  function handleDrop(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (dropMode === "reparent" && onReparent && draggingId && draggingId !== overId) {
      const draggedId = draggingId;
      // Não dispara reorder no dragEnd — limpa estado antes.
      setDraggingId(null);
      setDropTargetId(null);
      dragOverRef.current = null;
      startTransition(async () => {
        try {
          await onReparent(draggedId, overId);
        } catch (err) {
          console.error("[CompactView] reparent falhou:", err);
        }
      });
    }
  }

  function handleDragEnd() {
    const wasReparent = dropMode === "reparent";
    setDraggingId(null);
    setDropTargetId(null);
    setDropMode("reorder");
    dragOverRef.current = null;
    if (wasReparent) return; // já tratado em handleDrop
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
        const isReparentTarget = isDropTarget && dropMode === "reparent";
        return (
          <div
            key={id}
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDrop={(e) => handleDrop(e, id)}
            onDragEnd={handleDragEnd}
            style={{
              opacity: isDragging ? 0.35 : 1,
              background: isDragging
                ? "color-mix(in oklab, var(--accent) 12%, var(--card))"
                : isReparentTarget
                  ? "color-mix(in oklab, var(--accent) 18%, var(--card))"
                  : isDropTarget
                    ? "color-mix(in oklab, var(--accent) 6%, transparent)"
                    : "transparent",
              borderRadius: 6,
              boxShadow: isDragging
                ? "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px var(--accent)"
                : isReparentTarget
                  ? "inset 0 0 0 1.5px var(--accent)"
                  : "none",
              transform: isDragging ? "scale(0.99)" : "scale(1)",
              transition:
                "background 100ms ease, box-shadow 120ms ease, transform 120ms ease, opacity 100ms ease",
              cursor: isDragging ? "grabbing" : "default",
              position: "relative",
            }}
          >
            {/* Indicador de drop — linha lima fina (reorder)
                ou label "↳ vira sub" centralizado (reparent) */}
            {isDropTarget && dropMode === "reorder" && (
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
            {isReparentTarget && (
              <div
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  pointerEvents: "none",
                  background: "var(--card)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ↳ vira sub
              </div>
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
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(cat.notes ?? "");
  const [isPending, startTransition] = useTransition();

  // Sync com props quando server revalidar
  useEffect(() => {
    setName(cat.name);
  }, [cat.name]);
  useEffect(() => {
    setNotesValue(cat.notes ?? "");
  }, [cat.notes]);

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

  function saveNotes() {
    const trimmed = notesValue.trim();
    if (trimmed === (cat.notes ?? "")) {
      setNotesOpen(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("notes", trimmed);
      await patchCategoria(fd);
      setNotesOpen(false);
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
        onClick={() => setNotesOpen((v) => !v)}
        disabled={isPending}
        title={cat.notes ? cat.notes : "Adicionar nota informativa"}
        style={{
          padding: "1px 6px",
          background: notesOpen ? "var(--card2)" : "transparent",
          color: cat.notes ? "var(--accent)" : "var(--muted)",
          border: "none",
          fontSize: 11,
          fontWeight: 800,
          fontStyle: "italic",
          fontFamily: "serif",
          cursor: "pointer",
          lineHeight: 1,
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        i
      </button>
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
      {notesOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 48,
            zIndex: 10,
            background: "var(--card)",
            border: "0.5px solid var(--line-d)",
            borderRadius: 8,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 260,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Nota sobre {cat.name}
          </div>
          <textarea
            autoFocus
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveNotes();
              }
              if (e.key === "Escape") {
                setNotesValue(cat.notes ?? "");
                setNotesOpen(false);
              }
            }}
            placeholder="Ex: inclui supermercado, padaria e açougue"
            rows={3}
            style={{
              padding: "6px 8px",
              background: "var(--card2)",
              color: "var(--ink)",
              border: "0.5px solid var(--line-d)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
              minHeight: 50,
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setNotesValue(cat.notes ?? "");
                setNotesOpen(false);
              }}
              style={{
                padding: "4px 10px",
                background: "transparent",
                color: "var(--muted-d)",
                border: "0.5px solid var(--line-d)",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveNotes}
              disabled={isPending}
              style={{
                padding: "4px 10px",
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Salvar (Ctrl+Enter)
            </button>
          </div>
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
