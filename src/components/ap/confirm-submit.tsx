"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Botão de submit dentro de form que mostra `confirm()` antes de enviar.
 * Server Components não aceitam onClick — por isso este é client.
 */
export function ConfirmSubmitButton({
  children,
  confirmMsg = "Tem certeza?",
  style,
}: {
  children: ReactNode;
  confirmMsg?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(confirmMsg)) e.preventDefault();
      }}
      style={style}
    >
      {children}
    </button>
  );
}
