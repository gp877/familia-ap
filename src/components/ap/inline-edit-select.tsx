"use client";

import { useRef, useState, useTransition } from "react";

type Option = { value: string; label: string };

/**
 * Select inline que parece um pill clicável. Click abre dropdown nativo.
 * Auto-save no change.
 */
export function InlineEditSelect({
  initialValue = "",
  options,
  action,
  hiddenFields = {},
  fieldName = "value",
  placeholder = "—",
  fontSize = 11.5,
  background = "var(--card2)",
  color = "var(--ink-d)",
}: {
  initialValue?: string;
  options: Option[];
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  fieldName?: string;
  placeholder?: string;
  fontSize?: number;
  background?: string;
  color?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLSelectElement>(null);

  function submit(v: string) {
    const fd = new FormData();
    for (const [k, val] of Object.entries(hiddenFields)) fd.set(k, val);
    fd.set(fieldName, v);
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <select
      ref={ref}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        submit(e.target.value);
      }}
      style={{
        padding: "3px 8px",
        background,
        border: "none",
        outline: "none",
        fontSize,
        fontWeight: 600,
        fontFamily: "inherit",
        color: value ? color : "var(--muted)",
        borderRadius: 999,
        appearance: "none",
        cursor: "pointer",
        textAlign: "center",
      }}
    >
      {!value && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
