"use client";

import { useTransition } from "react";

/**
 * Checkbox que toggle estado com auto-save.
 */
export function CheckboxToggle({
  checked,
  action,
  hiddenFields = {},
  size = 18,
  ariaLabel = "Marcar",
}: {
  checked: boolean;
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  size?: number;
  ariaLabel?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const fd = new FormData();
    for (const [k, val] of Object.entries(hiddenFields)) fd.set(k, val);
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={ariaLabel}
      aria-pressed={checked}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        background: checked ? "var(--accent)" : "transparent",
        color: checked ? "var(--accent-on)" : "transparent",
        border: `1.5px solid ${checked ? "var(--accent)" : "var(--line-d)"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.7),
        fontWeight: 800,
        flexShrink: 0,
        padding: 0,
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {checked ? "✓" : ""}
    </button>
  );
}
