"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

/**
 * Lista de cartões com drag-and-drop nativo HTML5. Sem dependência extra.
 *
 * IMPORTANTE: Em Next App Router (Server Components), você NÃO pode passar
 * uma função render como prop pra Client Component — isso quebra com
 * "Functions cannot be passed directly to Client Components" em prod.
 *
 * Por isso a API recebe `items: { id, content: ReactNode }[]` — o Server
 * Component já renderiza o JSX dos cards e nós só reordenamos os nodes
 * pelo ID. Server actions (action prop) são OK porque ganham `__react_server_action`.
 */
export function SortableList({
  items,
  action,
}: {
  items: { id: string; content: React.ReactNode }[];
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  // Indexa o conteúdo por id pra reordenar sem perder os nodes.
  const byId = useMemo(() => {
    const m = new Map<string, React.ReactNode>();
    for (const it of items) m.set(it.id, it.content);
    return m;
  }, [items]);

  // Sincroniza com servidor se a lista mudar
  useEffect(() => {
    setOrder(items.map((i) => i.id));
  }, [items.map((i) => i.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(newOrder: string[]) {
    const fd = new FormData();
    fd.set("order", JSON.stringify(newOrder));
    startTransition(async () => {
      await action(fd);
    });
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    dragOverIdRef.current = id;
    if (draggingId && draggingId !== id) setDropTargetId(id);
  }
  function handleDrop(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (!draggingId || draggingId === id) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }
    const newOrder = [...order];
    const fromIdx = newOrder.indexOf(draggingId);
    const toIdx = newOrder.indexOf(id);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingId);
    setOrder(newOrder);
    setDraggingId(null);
    setDropTargetId(null);
    persist(newOrder);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {order.map((id) => {
        const content = byId.get(id);
        if (!content) return null;
        const isDragging = draggingId === id;
        const isDropTarget = dropTargetId === id && draggingId !== id;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => handleDragStart(id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDrop={(e) => handleDrop(e, id)}
            onDragEnd={handleDragEnd}
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              opacity: isDragging ? 0.4 : 1,
              borderRadius: 14,
              boxShadow: isDragging
                ? "0 8px 24px rgba(0,0,0,0.45), 0 0 0 2px var(--accent)"
                : "none",
              transform: isDragging ? "scale(0.985)" : "scale(1)",
              transition:
                "box-shadow 140ms ease, transform 140ms ease, opacity 120ms ease",
              position: "relative",
            }}
          >
            {isDropTarget && (
              <div
                style={{
                  position: "absolute",
                  top: -3,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: "var(--accent)",
                  borderRadius: 2,
                  pointerEvents: "none",
                  boxShadow: "0 0 8px var(--accent)",
                }}
              />
            )}
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** Handle visual com ⋮⋮ usado como pega pra drag. */
export function DragHandle() {
  return (
    <span
      style={{
        color: "var(--muted)",
        fontSize: 14,
        fontWeight: 900,
        letterSpacing: -2,
        userSelect: "none",
        cursor: "grab",
        padding: "0 4px",
        lineHeight: 1,
      }}
      aria-hidden
    >
      ⋮⋮
    </span>
  );
}
