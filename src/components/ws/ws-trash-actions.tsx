"use client";

import { useTransition } from "react";

import { wsPurge, wsRestore } from "@/app/actions/workspace";

import { GhostButton } from "./ws-ui";

export function WsTrashActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
    });
  return (
    <div style={{ display: "flex", gap: 4, opacity: pending ? 0.5 : 1 }}>
      <GhostButton onClick={() => run(() => wsRestore(id))}>↺ Restaurar</GhostButton>
      <GhostButton
        onClick={() => {
          if (confirm("Apagar DEFINITIVAMENTE? Isso não tem volta.")) run(() => wsPurge(id));
        }}
      >
        <span style={{ color: "var(--alert)" }}>Apagar de vez</span>
      </GhostButton>
    </div>
  );
}
