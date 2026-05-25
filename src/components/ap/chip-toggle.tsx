"use client";

import { useTransition } from "react";

type ChipState = {
  value: string;
  label: string;
  background?: string;
  color?: string;
};

/**
 * Pill clicável que cicla entre valores. Útil pra status com poucas opções
 * (planned → in_progress → past, draft → sent → received, etc).
 */
export function ChipToggle({
  current,
  states,
  action,
  hiddenFields = {},
  fieldName = "value",
}: {
  current: string;
  states: ChipState[];
  action: (fd: FormData) => Promise<void> | void;
  hiddenFields?: Record<string, string>;
  fieldName?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const currentIdx = Math.max(0, states.findIndex((s) => s.value === current));
  const curState = states[currentIdx] ?? states[0];
  const nextState = states[(currentIdx + 1) % states.length];

  function handleClick() {
    const fd = new FormData();
    for (const [k, val] of Object.entries(hiddenFields)) fd.set(k, val);
    fd.set(fieldName, nextState.value);
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={`Próximo: ${nextState.label}`}
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: curState.background ?? "var(--card2)",
        color: curState.color ?? "var(--ink-d)",
        border: "none",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.02em",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {curState.label}
    </button>
  );
}
