"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { wsArchive, wsRename } from "@/app/actions/workspace";
import type { Block, DbSchema, PropValue } from "@/lib/workspace-model";

import { BlockEditor } from "./block-editor";
import type { Person } from "./prop-cell";
import { RowProps } from "./row-props";
import { AiBadge, GhostButton } from "./ws-ui";

export type PeekRow = {
  id: string;
  title: string;
  props: Record<string, PropValue>;
  content?: Block[];
  createdVia: string;
  agentUpdatedAt: string | null;
};

/**
 * Tarefa aberta "por cima" do quadro (como o peek do Notion): abre na hora,
 * sem trocar de página. Esc ou clique fora fecha. "Abrir como página" leva
 * pra rota da linha.
 */
export function RowPeek({
  row,
  dbId,
  schema,
  people,
  done,
  onToggleDone,
  onClose,
}: {
  row: PeekRow;
  dbId: string;
  schema: DbSchema;
  people: Person[];
  done: boolean | null;
  onToggleDone: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(row.title);
  const [, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(document.activeElement as HTMLElement | null)?.closest?.(".ws-editable")) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const saveTitle = () => {
    if (title.trim() && title.trim() !== row.title) start(() => wsRename(row.id, title.trim()));
  };

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "6vh 12px 12px" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: "100%", maxWidth: 780, maxHeight: "88vh", overflowY: "auto", background: "var(--bg)", border: "0.5px solid var(--line-d)", borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.5)", padding: "12px 20px 8px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {done !== null && (
              <GhostButton onClick={onToggleDone} active={done}>
                {done ? "✓ Concluída · reabrir" : "○ Concluir"}
              </GhostButton>
            )}
            <AiBadge created={row.createdVia === "agent"} revisedAt={row.createdVia === "agent" ? null : row.agentUpdatedAt} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <GhostButton onClick={() => router.push(`/tarefas/${row.id}`)} title="Abrir em tela cheia">
              ↗ Abrir como página
            </GhostButton>
            <GhostButton
              onClick={() =>
                start(async () => {
                  await wsArchive(row.id);
                  onClose();
                })
              }
              title="Mandar para a Lixeira"
            >
              🗑️
            </GhostButton>
            <GhostButton onClick={onClose} title="Fechar (Esc)">
              ✕
            </GhostButton>
          </div>
        </div>
        <textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }}
          placeholder="Sem título"
          style={{ width: "100%", background: "transparent", border: 0, outline: "none", resize: "none", overflow: "hidden", fieldSizing: "content", color: "var(--ink)", fontSize: 22, fontWeight: 700, fontFamily: "inherit", padding: 0, lineHeight: 1.25, marginBottom: 8 } as React.CSSProperties}
        />
        <RowProps dbId={dbId} rowId={row.id} schema={schema} props={row.props} people={people} />
        <BlockEditor key={row.id} pageId={row.id} initial={row.content ?? []} subpages={[]} />
      </div>
    </div>
  );
}
