"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ap/icon";

type Props = {
  buttonLabel: string;
  children: (close: () => void) => React.ReactNode;
};

/**
 * Toggle inline pra mostrar/esconder um formulário em qualquer página.
 * children recebe a função `close` pra fechar após submit.
 */
export function InlineForm({ buttonLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: "0 20px" }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 14,
            background: "var(--card)",
            color: "var(--ink-d)",
            border: "1px dashed var(--line-d)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Icon name="plus" size={15} stroke={2} />
          {buttonLabel}
        </button>
      ) : (
        <div
          style={{
            padding: 14,
            borderRadius: 16,
            background: "var(--card)",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "transparent",
              color: "var(--muted)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers de formulário
// ────────────────────────────────────────────────────────────

export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

export const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "1px solid transparent",
  fontSize: 13.5,
  fontFamily: "inherit",
};

export function SubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "10px 16px",
        borderRadius: 14,
        background: pending ? "var(--card2)" : "var(--accent)",
        color: pending ? "var(--muted)" : "var(--accent-on)",
        border: "none",
        fontWeight: 700,
        fontSize: 13.5,
        cursor: pending ? "not-allowed" : "pointer",
        marginTop: 6,
      }}
    >
      {children}
    </button>
  );
}

export function DeleteBtn({
  action,
  confirmMsg = "Excluir?",
}: {
  action: () => Promise<void>;
  confirmMsg?: string;
}) {
  const [isPending, startTransition] = useTransition();
  function handleClick() {
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      await action();
    });
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Excluir"
      aria-label="Excluir"
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        background: "transparent",
        color: "var(--muted)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <X size={14} />
    </button>
  );
}

export { Plus };
