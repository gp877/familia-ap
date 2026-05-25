"use client";

import { useRef, useState, useTransition } from "react";

/**
 * Date picker que parece um chip de texto. Click abre o picker nativo.
 * Auto-save no change.
 */
export function InlineEditDate({
  initialValue = "",
  action,
  hiddenFields = {},
  fieldName = "date",
  fontSize = 12,
  type = "date",
}: {
  initialValue?: string;
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  fieldName?: string;
  fontSize?: number;
  type?: "date" | "time" | "month";
}) {
  const [value, setValue] = useState(initialValue);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  function submit(v: string) {
    const fd = new FormData();
    for (const [k, val] of Object.entries(hiddenFields)) fd.set(k, val);
    fd.set(fieldName, v);
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (e.target.value) submit(e.target.value);
      }}
      style={{
        padding: "2px 6px",
        background: "transparent",
        border: "none",
        outline: "none",
        fontSize,
        fontFamily: "inherit",
        color: value ? "var(--ink-d)" : "var(--muted)",
        cursor: "pointer",
        borderRadius: 6,
      }}
    />
  );
}
