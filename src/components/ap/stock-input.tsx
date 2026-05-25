"use client";

import { useRef, useTransition } from "react";

import { updateItemStockForm } from "@/app/actions/supermercado";

/**
 * Input de estoque com auto-save no blur (sem botão visível).
 * Precisa ser Client Component porque usa onBlur — Server Components
 * não aceitam event handlers em props.
 */
export function StockInput({
  itemId,
  defaultStock,
  low,
}: {
  itemId: string;
  defaultStock: string | null;
  low: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      await updateItemStockForm(fd);
    });
  }

  return (
    <form ref={formRef} action={updateItemStockForm}>
      <input type="hidden" name="itemId" value={itemId} />
      <input
        name="stock"
        type="number"
        step="0.01"
        defaultValue={defaultStock ?? ""}
        placeholder="estoque"
        disabled={isPending}
        onBlur={handleBlur}
        style={{
          width: 70,
          padding: "4px 8px",
          borderRadius: 8,
          background: low ? "var(--alert)" : "var(--card2)",
          color: low ? "var(--accent-on)" : "var(--ink)",
          border: "none",
          fontSize: 12,
          fontFamily: "inherit",
          textAlign: "right",
          opacity: isPending ? 0.6 : 1,
        }}
      />
    </form>
  );
}
