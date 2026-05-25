"use client";

import { useRef, useState, useTransition } from "react";

/**
 * Input inline que cria registro ao apertar Enter (ou blur com texto).
 * Sem botão visível. Mostra spinner discreto durante o submit.
 * O servidor action deve aceitar (formData) e ter os campos hidden necessários.
 */
export function QuickAddInput({
  action,
  hiddenFields = {},
  placeholder = "+ adicionar...",
  fieldName = "title",
  fontSize = 13,
}: {
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  placeholder?: string;
  fieldName?: string;
  fontSize?: number;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set(fieldName, trimmed);
    startTransition(async () => {
      await action(fd);
      setValue("");
      inputRef.current?.focus();
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: 1,
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={() => {
          if (value.trim()) submit();
        }}
        disabled={isPending}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: "4px 10px",
          fontSize,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
      {isPending && (
        <Spinner />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="var(--muted)" strokeWidth="2.4" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{
          animation: "qai-spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{`@keyframes qai-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
