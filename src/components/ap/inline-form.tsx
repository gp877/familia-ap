"use client";

import { X } from "lucide-react";
import { useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "@/components/ap/icon";

type InlineFormProps = {
  buttonLabel: string;
  children: React.ReactNode;
};

/**
 * Toggle inline com `<details>` HTML + listener de submit que fecha automaticamente
 * o details após submit (com pequeno delay pra o server action processar).
 * Aceita JSX direto como children (sem render prop, sem violação RSC).
 */
export function InlineForm({ buttonLabel, children }: InlineFormProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function handleSubmit() {
    // Fecha o details depois que o form submit (server action) rodou.
    // Delay pequeno: usuário vê o spinner brevemente, depois fecha.
    setTimeout(() => {
      if (detailsRef.current) detailsRef.current.open = false;
    }, 250);
  }

  return (
    <div style={{ padding: "0 20px" }} onSubmit={handleSubmit}>
      <details ref={detailsRef} style={{ width: "100%" }}>
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
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 5,
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
  padding: "10px 14px",
  borderRadius: 12,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "1px solid transparent",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};

export function SubmitButton({
  children,
  pendingLabel = "Salvando…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px 18px",
        borderRadius: 14,
        background: pending ? "var(--card2)" : "var(--accent)",
        color: pending ? "var(--muted)" : "var(--accent-on)",
        border: "none",
        fontWeight: 700,
        fontSize: 14,
        cursor: pending ? "wait" : "pointer",
        marginTop: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Botão de submit pequeno (pill) com pending state também.
 */
export function PillSubmitButton({
  children,
  pendingLabel = "...",
  background = "var(--accent)",
  color = "var(--accent-on)",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  background?: string;
  color?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        background: pending ? "var(--card2)" : background,
        color: pending ? "var(--muted)" : color,
        border: "none",
        fontWeight: 700,
        fontSize: 11.5,
        cursor: pending ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {pending ? (
        <>
          <Spinner size={11} />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{
          animation: "ap-spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{`@keyframes ap-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

/**
 * Botão de excluir que chama uma server action.
 */
export function DeleteBtn({
  action,
  confirmMsg = "Excluir?",
}: {
  action: () => Promise<void> | void;
  /** Passe `null` pra deletar sem prompt de confirmação. */
  confirmMsg?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  function handleClick() {
    if (confirmMsg !== null && !confirm(confirmMsg)) return;
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
        width: 36,
        height: 36,
        borderRadius: 18,
        background: "transparent",
        color: "var(--muted)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <X size={16} />
    </button>
  );
}

/**
 * Botão de voltar — usa router.back() do Next.js.
 */
export function BackButton({ label = "Voltar", href }: { label?: string; href?: string }) {
  function handleClick() {
    if (href) {
      window.location.href = href;
    } else {
      window.history.back();
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        background: "var(--card)",
        color: "var(--ink-d)",
        border: "1px solid var(--line-d)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </button>
  );
}
