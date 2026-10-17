"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { wsArchive, wsRename, wsSetRowProps } from "@/app/actions/workspace";
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
  createdAt?: string;
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
            {row.createdAt && (
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: 4 }}>
                aberta em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.createdAt))}
              </span>
            )}
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
        <AskAi row={row} schema={schema} onSent={onClose} />
        <RowProps dbId={dbId} rowId={row.id} schema={schema} props={row.props} people={people} />
        <BlockEditor key={row.id} pageId={row.id} initial={row.content ?? []} subpages={[]} />
      </div>
    </div>
  );
}

/**
 * "🤖 Pedir à IA": escreve a instrução e põe a tarefa na fila da IA (1ª opção
 * da propriedade com papel ai_status). A tarefa some das listas até a IA
 * terminar; o arrastão (WhatsApp ou VS Code) executa a fila.
 */
function AskAi({ row, schema, onSent }: { row: PeekRow; schema: DbSchema; onSent: () => void }) {
  const promptProp = schema.properties.find((p) => p.role === "ai_prompt");
  const statusProp = schema.properties.find((p) => p.role === "ai_status");
  const atual = promptProp ? String(row.props?.[promptProp.id] ?? "") : "";
  const [texto, setTexto] = useState(atual);
  const [aberto, setAberto] = useState(!!atual);
  const [pending, start] = useTransition();
  if (!promptProp || !statusProp?.options?.length) return null;
  const fila = statusProp.options[0];
  const st = statusProp.options.find((o) => o.id === row.props?.[statusProp.id]);
  const naFila = st?.id === fila.id;

  const enviar = () =>
    start(async () => {
      await wsSetRowProps(row.id, { [promptProp.id]: texto.trim(), [statusProp.id]: fila.id });
      onSent();
    });
  const cancelar = () => start(() => wsSetRowProps(row.id, { [statusProp.id]: null }));

  if (!aberto) {
    return (
      <div style={{ marginBottom: 8 }}>
        <GhostButton onClick={() => setAberto(true)}>🤖 Pedir à IA</GhostButton>
      </div>
    );
  }
  return (
    <div style={{ border: "0.5px solid var(--accent)", borderRadius: 10, padding: 10, marginBottom: 10, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>🤖 Pedir à IA</span>
        {st && <span style={{ fontSize: 11.5, color: "var(--muted-d)" }}>situação: <b>{st.name}</b></span>}
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={'O que a IA deve fazer? Ex.: "agenda com o fornecedor terça 10h e avisa ele por WhatsApp"'}
        rows={3}
        style={{ width: "100%", resize: "vertical", background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: "inherit", outline: "none" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={pending || !texto.trim()}
          onClick={enviar}
          style={{ padding: "6px 12px", borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-on)", fontWeight: 700, fontSize: 12.5, cursor: "pointer", opacity: pending || !texto.trim() ? 0.5 : 1, fontFamily: "inherit" }}
        >
          {naFila ? "Atualizar pedido" : "Enviar para a IA"}
        </button>
        {naFila && <GhostButton onClick={cancelar}>Tirar da fila</GhostButton>}
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          A tarefa sai das suas listas e vai para a fila 🤖. Mande &quot;arrastão&quot; no grupo Claude (ou peça no VS Code) para a IA executar.
        </span>
      </div>
    </div>
  );
}
