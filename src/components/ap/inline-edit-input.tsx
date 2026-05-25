"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Input que parece texto normal. Auto-save no blur ou Enter.
 * Aceita valor inicial (pra editar registro existente) ou vazio (criar novo).
 * Action recebe FormData com os hiddenFields + fieldName.
 * Esc descarta a edição.
 */
export function InlineEditInput({
  initialValue = "",
  action,
  hiddenFields = {},
  fieldName = "title",
  placeholder = "",
  fontSize = 13,
  fontWeight = 600,
  color = "var(--ink)",
  italic = false,
  multiline = false,
}: {
  initialValue?: string;
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  fieldName?: string;
  placeholder?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  italic?: boolean;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const savedValueRef = useRef(initialValue);

  // Mantém sincronizado se o valor inicial mudar (server re-render)
  useEffect(() => {
    setValue(initialValue);
    savedValueRef.current = initialValue;
  }, [initialValue]);

  function submit(force = false) {
    const trimmed = value.trim();
    if (!force && trimmed === savedValueRef.current.trim()) return;
    if (!force && trimmed === "" && savedValueRef.current === "") return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set(fieldName, trimmed);
    savedValueRef.current = trimmed;
    startTransition(async () => {
      await action(fd);
    });
  }

  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(e.target.value),
    onBlur: () => submit(),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
      }
      if (e.key === "Escape") {
        setValue(savedValueRef.current);
        (e.currentTarget as HTMLElement).blur();
      }
    },
    placeholder,
    disabled: isPending,
    style: {
      width: "100%",
      padding: 0,
      margin: 0,
      fontSize,
      fontWeight,
      color: value ? color : "var(--muted)",
      fontStyle: italic ? "italic" : "normal",
      background: "transparent",
      border: "none",
      outline: "none",
      fontFamily: "inherit",
      lineHeight: 1.35,
      opacity: isPending ? 0.6 : 1,
      resize: "none",
    } as React.CSSProperties,
  };

  return multiline ? (
    <textarea
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      rows={1}
      {...sharedProps}
    />
  ) : (
    <input ref={inputRef as React.RefObject<HTMLInputElement>} {...sharedProps} />
  );
}
