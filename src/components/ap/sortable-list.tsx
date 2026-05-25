"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Lista de cartões com drag-and-drop nativo HTML5. Não dependência extra.
 * Chama `action` com FormData contendo `order` = JSON.stringify(ids) ao soltar.
 */
export function SortableList({
  items,
  renderItem,
  action,
}: {
  items: { id: string; key?: string }[];
  renderItem: (id: string, isDragging: boolean) => React.ReactNode;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  // Sincroniza com servidor se a lista do servidor mudar
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
  }
  function handleDrop(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (!draggingId || draggingId === id) {
      setDraggingId(null);
      return;
    }
    const newOrder = [...order];
    const fromIdx = newOrder.indexOf(draggingId);
    const toIdx = newOrder.indexOf(id);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingId(null);
      return;
    }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingId);
    setOrder(newOrder);
    setDraggingId(null);
    persist(newOrder);
  }
  function handleDragEnd() {
    setDraggingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {order.map((id) => (
        <div
          key={id}
          draggable
          onDragStart={() => handleDragStart(id)}
          onDragOver={(e) => handleDragOver(e, id)}
          onDrop={(e) => handleDrop(e, id)}
          onDragEnd={handleDragEnd}
          style={{
            cursor: "grab",
            opacity: draggingId === id ? 0.4 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {renderItem(id, draggingId === id)}
        </div>
      ))}
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
