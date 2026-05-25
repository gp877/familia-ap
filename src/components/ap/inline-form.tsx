"use client";

import { X } from "lucide-react";
import { useTransition } from "react";

import { Icon } from "@/components/ap/icon";

type InlineFormProps = {
  buttonLabel: string;
  children: React.ReactNode;
};

/**
 * Toggle inline com `<details>` nativo — server component compatível,
 * sem render prop e sem state cliente. Aceita JSX direto como children.
 */
export function InlineForm({ buttonLabel, children }: InlineFormProps) {
  return (
    <div style={{ padding: "0 20px" }}>
      <details style={{ width: "100%" }}>
        <summary
          style={{
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
            listStyle: "none",
            userSelect: "none",
          }}
        >
          <Icon name="plus" size={15} stroke={2} />
          {buttonLabel}
        </summary>
        <div
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 16,
            background: "var(--card)",
          }}
        >
          {children}
        </div>
      </details>
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
}: {
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      style={{
        width: "100%",
        padding: "10px 16px",
        borderRadius: 14,
        background: "var(--accent)",
        color: "var(--accent-on)",
        border: "none",
        fontWeight: 700,
        fontSize: 13.5,
        cursor: "pointer",
        marginTop: 6,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Botão de excluir que chama uma server action.
 * Aceita server action via prop (Next.js suporta isso).
 */
export function DeleteBtn({
  action,
  confirmMsg = "Excluir?",
}: {
  action: () => Promise<void> | void;
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
