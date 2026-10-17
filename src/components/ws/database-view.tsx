"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { wsArchive, wsCreatePage, wsMoveRow, wsRestore, wsSetRowProps, wsUpdateDatabase } from "@/app/actions/workspace";
import {
  type Block,
  type Color,
  COLORS,
  type DbSchema,
  type Property,
  type PropValue,
  type View,
  applyView,
  newId,
  todayBrt,
} from "@/lib/workspace-model";

import { type CellCtx, type Person, PropCell, PropDisplay } from "./prop-cell";
import { accentColor } from "./colors";
import { RowPeek } from "./row-peek";
import { AddPropertyButton, PropertyMenu, ViewTabs, ViewToolbar } from "./schema-editor";
import { AiBadge, GhostButton, Popover, Tag, TextField } from "./ws-ui";

/** Concluir rápido: a bolinha ○ na frente de cada tarefa (status do grupo "Concluído"). */
type DoneCtx = { isDone: (r: RowData) => boolean; toggle: (r: RowData) => void };
const DoneContext = createContext<DoneCtx | null>(null);
/** Clicar no título abre a tarefa "por cima" (peek) em vez de trocar de página. */
const PeekContext = createContext<((id: string) => void) | null>(null);
/** 🤖 rápido no cartão: manda a orientação pra fila da IA sem abrir a tarefa. */
type AskFn = ((row: RowData, text: string) => void) | null;
const AskContext = createContext<AskFn>(null);
/** Trocar o valor de uma etiqueta direto no cartão (prioridade, tipo…), sem abrir a tarefa. */
type SetPropFn = (row: RowData, propId: string, value: PropValue) => void;
const SetPropContext = createContext<SetPropFn | null>(null);
/** Criar nome novo / arquivar nome direto no menu da etiqueta. */
type OptionOps = { create: (row: RowData, prop: Property, name: string) => void; archive: (prop: Property, optId: string, archived: boolean) => void };
const OptionOpsContext = createContext<OptionOps | null>(null);
/** Arrastar no quadro: grava coluna + ordem (otimista). */
type MoveFn = (row: RowData, values: Record<string, PropValue> | null, orderedIds: string[]) => void;

export type RowData = {
  id: string;
  title: string;
  icon: string | null;
  props: Record<string, PropValue>;
  sortOrder: number;
  createdAt: string;
  createdVia: string;
  agentUpdatedAt: string | null;
  content?: Block[];
};

export function DatabaseView({
  dbId,
  schema,
  views,
  rows,
  people,
}: {
  dbId: string;
  schema: DbSchema;
  views: View[];
  rows: RowData[];
  people: Person[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = views.some((v) => v.id === sp.get("v")) ? sp.get("v")! : views[0].id;
  const baseView = views.find((v) => v.id === activeId)!;

  // ── alterações otimistas (some/move na hora; o servidor confirma depois) ──
  type Patch = { props?: Record<string, PropValue>; sortOrder?: number };
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [manualViews, setManualViews] = useState<Set<string>>(new Set()); // visões que viraram "ordem manual"
  const [gone, setGone] = useState<Set<string>>(new Set()); // mandadas pra Lixeira (somem na hora)
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPatches({});
    setGone(new Set());
  }
  const manual = manualViews.has(baseView.id);
  // filtros rápidos (?m=) e formato (Quadro/Tabela/Calendário) trocados dentro da mesma visualização
  const modes = useMemo(() => baseView.modes ?? [], [baseView]);
  const mode = modes.find((m) => m.id === sp.get("m"));
  const [viewOverride, setViewOverride] = useState<Record<string, Partial<Pick<View, "type" | "sorts">>>>({});
  const shapedView = useMemo(
    () => ({ ...baseView, ...viewOverride[baseView.id], filters: mode ? mode.filters : baseView.filters }),
    [baseView, viewOverride, mode]
  );
  const view = useMemo(() => (manual && shapedView.sorts.length ? { ...shapedView, sorts: [] } : shapedView), [manual, shapedView]);
  const patch = (id: string, p: Patch) =>
    setPatches((o) => ({ ...o, [id]: { props: { ...o[id]?.props, ...p.props }, sortOrder: p.sortOrder ?? o[id]?.sortOrder } }));
  const effRows = useMemo(
    () =>
      rows.filter((r) => !gone.has(r.id)).map((r) => {
        const p = patches[r.id];
        if (!p) return r;
        return { ...r, props: p.props ? { ...r.props, ...p.props } : r.props, sortOrder: p.sortOrder ?? r.sortOrder };
      }),
    [rows, patches, gone]
  );

  // ── aviso com "Desfazer" ──
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };
  const [, startBg] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startBg(async () => {
      try {
        await fn();
      } catch (e) {
        setPatches({});
        alert(e instanceof Error ? e.message : String(e));
      }
    });

  // ── concluir rápido ──
  const statusProp = schema.properties.find((p) => p.type === "status");
  const doneOpt = statusProp?.options?.find((o) => o.group === "done");
  const reopenOpt = statusProp?.options?.find((o) => (o.group ?? "todo") === "todo");
  const setStatus = (row: RowData, value: PropValue) => {
    if (!statusProp) return;
    patch(row.id, { props: { [statusProp.id]: value } });
    run(() => wsSetRowProps(row.id, { [statusProp.id]: value }));
  };
  const doneCtx: DoneCtx | null =
    statusProp && doneOpt
      ? {
          isDone: (r) => r.props?.[statusProp.id] === doneOpt.id,
          toggle: (r) => {
            const prev = r.props?.[statusProp.id] ?? null;
            const wasDone = prev === doneOpt.id;
            setStatus(r, wasDone ? (reopenOpt?.id ?? null) : doneOpt.id);
            showToast(`${wasDone ? "↺ Reaberta" : "✓ Concluída"}: ${r.title}`, () => setStatus(r, prev));
          },
        }
      : null;

  // ── arrastar no quadro ──
  const onMove: MoveFn = (row, values, orderedIds) => {
    if (values) patch(row.id, { props: values });
    orderedIds.forEach((id, i) => patch(id, { sortOrder: (i + 1) * 10 }));
    if (baseView.sorts.length && !manualViews.has(baseView.id)) {
      setManualViews((s) => new Set(s).add(baseView.id));
      run(() => wsUpdateDatabase(dbId, { views: views.map((v) => (v.id === baseView.id ? { ...v, sorts: [] } : v)) }));
      showToast("Ordem manual ligada nesta visualização (a ordenação automática foi tirada).");
    }
    run(() => wsMoveRow(row.id, values, orderedIds));
  };

  // ── etiqueta clicável no cartão ──
  const setProp: SetPropFn = (row, propId, value) => {
    patch(row.id, { props: { [propId]: value } });
    run(() => wsSetRowProps(row.id, { [propId]: value }));
  };

  // ── nomes (opções) criados/arquivados pelo menu da etiqueta ──
  const withOptions = (propId: string, fn: (opts: NonNullable<Property["options"]>) => NonNullable<Property["options"]>): DbSchema => ({
    properties: schema.properties.map((p) => (p.id === propId ? { ...p, options: fn(p.options ?? []) } : p)),
  });
  const optionOps: OptionOps = {
    create: (row, prop, name) => {
      const opt = { id: newId(), name: name.slice(0, 60), color: COLORS[1 + ((prop.options?.length ?? 0) % (COLORS.length - 1))] as Color };
      patch(row.id, { props: { [prop.id]: opt.id } });
      run(async () => {
        await wsUpdateDatabase(dbId, { schema: withOptions(prop.id, (o) => [...o, opt]) });
        await wsSetRowProps(row.id, { [prop.id]: opt.id });
      });
    },
    archive: (prop, optId, archived) =>
      run(() => wsUpdateDatabase(dbId, { schema: withOptions(prop.id, (o) => o.map((x) => (x.id === optId ? { ...x, archived: archived || undefined } : x))) })),
  };

  // ── formato da visualização ──
  const layouts = ([["board", "▦ Quadro"], ["table", "☰ Tabela"], ["calendar", "📅 Calendário"]] as const).filter(
    ([t]) => (t !== "board" || baseView.groupBy) && (t !== "calendar" || baseView.dateProp)
  );
  const setLayout = (type: View["type"]) => {
    setViewOverride((o) => ({ ...o, [baseView.id]: { ...o[baseView.id], type } }));
    run(() => wsUpdateDatabase(dbId, { views: views.map((v) => (v.id === baseView.id ? { ...v, type } : v)) }));
  };

  // ── ordenar: manual · prazo · prioridade ──
  const prazoProp = schema.properties.find((p) => p.id === baseView.dateProp) ?? schema.properties.find((p) => p.type === "date");
  const prioProp = schema.properties.find((p) => p.role === "priority");
  const sortNow = view.sorts[0]?.prop;
  const sortMode = prazoProp && sortNow === prazoProp.id ? "prazo" : prioProp && sortNow === prioProp.id ? "prio" : "manual";
  const setSort = (m: "manual" | "prazo" | "prio") => {
    const by = (a?: Property, b?: Property) => [a, b].filter((x): x is Property => !!x).map((x) => ({ prop: x.id, dir: "asc" as const }));
    const sorts = m === "prazo" ? by(prazoProp, prioProp) : m === "prio" ? by(prioProp, prazoProp) : [];
    setViewOverride((o) => ({ ...o, [baseView.id]: { ...o[baseView.id], sorts } }));
    setManualViews((s) => {
      const n = new Set(s);
      n.delete(baseView.id);
      return n;
    });
    run(() => wsUpdateDatabase(dbId, { views: views.map((v) => (v.id === baseView.id ? { ...v, sorts } : v)) }));
  };

  // ── soltar na barra de baixo: concluir · arquivar · excluir ──
  const archProp = schema.properties.find((p) => p.role === "archived");
  const dropActions: DropAction[] = [...(statusProp && doneOpt ? (["done"] as const) : []), ...(archProp ? (["archive"] as const) : []), "trash"];
  const onDropAction = (row: RowData, a: DropAction) => {
    if (a === "done" && doneCtx) {
      if (!doneCtx.isDone(row)) doneCtx.toggle(row);
      return;
    }
    if (a === "archive" && archProp) {
      setProp(row, archProp.id, true);
      showToast(`📦 Arquivada: ${row.title}`, () => setProp(row, archProp.id, false));
      return;
    }
    setGone((g) => new Set(g).add(row.id));
    run(() => wsArchive(row.id));
    showToast(`🗑️ Na Lixeira: ${row.title}`, () => {
      setGone((g) => {
        const n = new Set(g);
        n.delete(row.id);
        return n;
      });
      run(() => wsRestore(row.id));
    });
  };

  // ── 🤖 orientação rápida ──
  const promptProp = schema.properties.find((p) => p.role === "ai_prompt");
  const aiStatusProp = schema.properties.find((p) => p.role === "ai_status");
  const filaOpt = aiStatusProp?.options?.[0];
  const ask: AskFn =
    promptProp && aiStatusProp && filaOpt
      ? (row, text) => {
          const before = { [promptProp.id]: row.props?.[promptProp.id] ?? null, [aiStatusProp.id]: row.props?.[aiStatusProp.id] ?? null };
          const values = { [promptProp.id]: text, [aiStatusProp.id]: filaOpt.id };
          patch(row.id, { props: values });
          run(() => wsSetRowProps(row.id, values));
          showToast(`🤖 Enviada para a IA: ${row.title}`, () => {
            patch(row.id, { props: before });
            run(() => wsSetRowProps(row.id, before));
          });
        }
      : null;

  // ── tarefa aberta por cima (peek) ──
  const [peekId, setPeekId] = useState<string | null>(null);
  const peekRow = peekId ? effRows.find((r) => r.id === peekId) : undefined;
  const closePeek = useCallback(() => setPeekId(null), [setPeekId]);

  const visible = useMemo(() => applyView(effRows, view, schema), [effRows, view, schema]);
  const ctx: CellCtx = { dbId, schema, people };
  const shownProps = schema.properties.filter((p) => !(view.hidden ?? []).includes(p.id));

  const select = (id: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("v", id);
    q.delete("m");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const selectMode = (id: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (id) q.set("m", id);
    else q.delete("m");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const modeCounts = useMemo(
    () => [baseView.filters, ...modes.map((m) => m.filters)].map((filters) => applyView(effRows, { ...baseView, filters, sorts: [] }, schema).length),
    [effRows, baseView, modes, schema]
  );

  return (
    <DoneContext.Provider value={doneCtx}>
    <PeekContext.Provider value={setPeekId}>
    <AskContext.Provider value={ask}>
    <SetPropContext.Provider value={setProp}>
    <OptionOpsContext.Provider value={optionOps}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {toast && (
        <div
          role="status"
          style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 80, display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderRadius: 10, background: "var(--card2)", border: "0.5px solid var(--line-d)", boxShadow: "0 10px 30px rgba(0,0,0,.45)", fontSize: 13, color: "var(--ink)", maxWidth: "calc(100vw - 32px)" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              style={{ border: 0, background: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}
            >
              Desfazer
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap", borderBottom: "0.5px solid var(--line-d)", paddingBottom: 4 }}>
        <ViewTabs dbId={dbId} views={views} activeId={activeId} onSelect={select} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {visible.length}
            {visible.length !== effRows.length ? `/${effRows.length}` : ""} {visible.length === 1 ? "item" : "itens"}
          </span>
          <ViewToolbar dbId={dbId} schema={schema} views={views} view={baseView} />
        </div>
      </div>
      {(modes.length > 0 || layouts.length > 1) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {modes.length > 0 &&
              [{ id: null as string | null, name: "Todas" }, ...modes].map((m, i) => (
                <button key={m.id ?? "todas"} type="button" className="ws-chip" data-on={(mode?.id ?? null) === m.id || undefined} onClick={() => selectMode(m.id)}>
                  {m.name} <span style={{ opacity: 0.6 }}>{modeCounts[i]}</span>
                </button>
              ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(prazoProp || prioProp) && view.type !== "calendar" && (
            <div style={{ display: "flex", gap: 2, background: "var(--surf)", borderRadius: 8, padding: 2, alignItems: "center" }} title="Ordenar os cartões">
              <span style={{ fontSize: 11, color: "var(--muted)", padding: "0 4px 0 6px" }}>Ordenar</span>
              {([["manual", "✋ Manual"], ...(prazoProp ? [["prazo", "📅 Prazo"]] : []), ...(prioProp ? [["prio", "🔥 Prioridade"]] : [])] as Array<[typeof sortMode, string]>).map(([m, label]) => (
                <button key={m} type="button" className="ws-seg" data-on={sortMode === m || undefined} onClick={() => sortMode !== m && setSort(m)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {layouts.length > 1 && (
            <div style={{ display: "flex", gap: 2, background: "var(--surf)", borderRadius: 8, padding: 2 }}>
              {layouts.map(([t, label]) => (
                <button key={t} type="button" className="ws-seg" data-on={view.type === t || undefined} onClick={() => view.type !== t && setLayout(t)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
      <Legend board={view.type === "board"} />
      {view.type === "table" && <TableView ctx={ctx} view={view} props={shownProps} rows={visible} views={views} />}
      {view.type === "list" && <ListView ctx={ctx} props={shownProps} rows={visible} />}
      {view.type === "board" && <BoardView ctx={ctx} view={view} props={shownProps} rows={visible} onMove={onMove} dropActions={dropActions} onDropAction={onDropAction} />}
      {view.type === "calendar" && <CalendarView ctx={ctx} view={view} rows={visible} />}
      {peekRow && (
        <RowPeek
          row={peekRow}
          dbId={dbId}
          schema={schema}
          people={people}
          done={statusProp && doneOpt ? peekRow.props?.[statusProp.id] === doneOpt.id : null}
          onToggleDone={() => doneCtx?.toggle(peekRow)}
          onClose={closePeek}
        />
      )}
    </div>
    </OptionOpsContext.Provider>
    </SetPropContext.Provider>
    </AskContext.Provider>
    </PeekContext.Provider>
    </DoneContext.Provider>
  );
}

/** 🤖 no cartão: balão com a orientação → fila da IA. */
function QuickAsk({ row }: { row: RowData }) {
  const ask = useContext(AskContext);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  if (!ask) return null;
  const close = () => {
    setPos(null);
    setText("");
  };
  const send = () => {
    if (!text.trim()) return;
    ask(row, text.trim());
    close();
  };
  return (
    <>
      <button
        type="button"
        title="Pedir à IA (orientação rápida)"
        aria-label="Pedir à IA"
        className="ws-quick"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const w = Math.min(320, window.innerWidth - 24);
          setPos({ x: Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)), y: Math.min(r.bottom + 6, window.innerHeight - 190) });
        }}
        style={{ border: 0, background: "transparent", padding: "0 2px", fontSize: 13, lineHeight: 1, cursor: "pointer", flexShrink: 0, borderRadius: 4 }}
      >
        🤖
      </button>
      {pos &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: "fixed", inset: 0, zIndex: 85 }}
          >
            <div onMouseDown={close} style={{ position: "absolute", inset: 0 }} />
            <div
              style={{ position: "absolute", left: pos.x, top: pos.y, width: Math.min(320, window.innerWidth - 24), background: "var(--card)", border: "0.5px solid var(--accent)", borderRadius: 10, boxShadow: "0 14px 36px rgba(0,0,0,.5)", padding: 10 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🤖 {row.title}</div>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                }}
                rows={3}
                placeholder="O que a IA deve fazer?"
                style={{ width: "100%", resize: "vertical", background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", borderRadius: 7, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6 }}>
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>Ctrl+Enter envia · Esc fecha</span>
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={send}
                  style={{ padding: "5px 10px", borderRadius: 7, border: 0, background: "var(--accent)", color: "var(--accent-on)", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: text.trim() ? 1 : 0.5, fontFamily: "inherit" }}
                >
                  Enviar para a IA
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/** Legenda curta dos símbolos dos cartões. */
function Legend({ board }: { board: boolean }) {
  const item = (sym: React.ReactNode, txt: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {sym}
      {txt}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11, color: "var(--muted)" }}>
      {item(<span style={{ width: 11, height: 11, borderRadius: 999, border: "1.5px solid var(--muted)", display: "inline-block" }} />, "toque para concluir")}
      {item(<span>🤖</span>, "pedir à IA (vai para a fila; mande \"arrastão\" para executar)")}
      {item(<span style={{ fontSize: 9, fontWeight: 800, color: "var(--accent)", border: "0.5px solid var(--accent)", borderRadius: 999, padding: "0 4px" }}>IA</span>, "criada pelo assistente")}
      {item(<span style={{ color: "var(--alert)", fontWeight: 600 }}>📅 atrasada</span>, "prazo vencido")}
      {item(<span>🖱️</span>, board ? "clique abre · arraste para mover (no celular: segure e arraste)" : "clique abre a tarefa")}
    </div>
  );
}

/** Bolinha de concluir. Toque = Feito (ou reabre, se já estiver feito). */
function DoneCheck({ row }: { row: RowData }) {
  const ctx = useContext(DoneContext);
  if (!ctx) return null;
  const done = ctx.isDone(row);
  return (
    <button
      type="button"
      title={done ? "Reabrir" : "Concluir"}
      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.toggle(row);
      }}
      className="ws-done"
      style={{
        width: 17,
        height: 17,
        flexShrink: 0,
        borderRadius: 999,
        border: done ? "0" : "1.5px solid var(--muted)",
        background: done ? "var(--accent)" : "transparent",
        color: "var(--accent-on)",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: "17px",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done ? "✓" : ""}
    </button>
  );
}

/** Ao criar uma linha numa visualização filtrada, já preenche o que o filtro pede. */
function defaultsFromView(view: View, schema: DbSchema): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const f of view.filters) {
    const p = schema.properties.find((x) => x.id === f.prop);
    if (!p || !f.value) continue;
    if (f.op === "is" && (p.type === "select" || p.type === "status" || p.type === "person")) out[p.id] = f.value;
    if (f.op === "contains" && p.type === "multi_select") out[p.id] = [f.value];
    if (p.type === "date" && f.value?.startsWith("@hoje") && ["is", "on_or_before", "on_or_after"].includes(f.op)) out[p.id] = todayBrt();
  }
  return out;
}

function NewRow({ ctx, preset, label = "Novo", compact }: { ctx: CellCtx; preset?: Record<string, PropValue>; label?: string; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const create = () => {
    const t = title.trim();
    if (!t) return setEditing(false);
    start(async () => {
      await wsCreatePage({ parentId: ctx.dbId, kind: "row", title: t, props: preset ?? {} });
      setTitle("");
    });
  };
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{ textAlign: "left", padding: compact ? "6px 8px" : "8px 10px", border: 0, background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", width: "100%" }}
      >
        + {label}
      </button>
    );
  }
  return (
    <div style={{ padding: 4, opacity: pending ? 0.6 : 1 }}>
      <TextField autoFocus value={title} onChange={setTitle} onEnter={create} placeholder="Nome e Enter" />
    </div>
  );
}

/** Título da linha. `wrap` (cartões e lista): quebra em até 2 linhas em vez de cortar. Clique abre por cima. */
function RowTitle({ row, wrap = false, size = 13.5 }: { row: RowData; wrap?: boolean; size?: number }) {
  const router = useRouter();
  const peek = useContext(PeekContext);
  return (
    <a
      href={`/tarefas/${row.id}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return; // Ctrl+clique abre a página numa aba nova
        e.preventDefault();
        if (peek) peek(row.id);
        else router.push(`/tarefas/${row.id}`);
      }}
      title={row.title}
      draggable={false}
      style={{ display: "flex", alignItems: wrap ? "flex-start" : "center", gap: 7, color: "var(--ink)", textDecoration: "none", fontWeight: 500, fontSize: size, lineHeight: 1.3, minWidth: 0 }}
    >
      <span style={{ display: "inline-flex", marginTop: wrap ? 1 : 0 }}>
        <DoneCheck row={row} />
      </span>
      {row.icon && <span>{row.icon}</span>}
      <span
        style={
          wrap
            ? { flex: 1, minWidth: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }
            : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
        }
      >
        {row.title || "Sem título"}
      </span>
      <QuickAsk row={row} />
      <AiBadge created={row.createdVia === "agent"} revisedAt={row.createdVia === "agent" ? null : row.agentUpdatedAt} />
    </a>
  );
}

/** Valores de propriedades em linha, enxutos (cartões e lista). */
function Chips({ props, row, people, askEmpty = [], strongEmpty = false }: { props: Property[]; row: RowData; people: CellCtx["people"]; askEmpty?: Property[]; strongEmpty?: boolean }) {
  const shown = props.filter((p) => row.props?.[p.id] != null && row.props?.[p.id] !== "" && !(Array.isArray(row.props?.[p.id]) && !(row.props?.[p.id] as string[]).length));
  const semPrazo = props.find((p) => p.type === "date" && !shown.includes(p));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 11.5 }}>
      {shown.map((p) =>
        p.type === "select" || p.type === "status" || p.type === "date" ? (
          <ChipMenu key={p.id} prop={p} row={row} people={people} />
        ) : (
          <PropDisplay key={p.id} prop={p} value={row.props?.[p.id] ?? null} people={people} compact />
        )
      )}
      {semPrazo && <ChipMenu prop={semPrazo} row={row} people={people} />}
      {askEmpty.filter((p) => !shown.includes(p)).map((p) => (
        <ChipMenu key={p.id} prop={p} row={row} people={people} strongEmpty={strongEmpty} />
      ))}
      <span title="Data de abertura" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--muted)" }}>
        aberta {abertura(row.createdAt)}
      </span>
    </div>
  );
}

/** Etiqueta do cartão que abre as opções ali mesmo (ex.: Alta / Média / Baixa). */
function ChipMenu({ prop, row, people, strongEmpty = false }: { prop: Property; row: RowData; people: CellCtx["people"]; strongEmpty?: boolean }) {
  const setProp = useContext(SetPropContext);
  const ops = useContext(OptionOpsContext);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [novo, setNovo] = useState("");
  const [verArq, setVerArq] = useState(false);
  const [arq, setArq] = useState<Record<string, boolean>>({}); // arquivar/voltar na hora (o servidor confirma depois)
  const value = row.props?.[prop.id] ?? null;
  const isArq = (o: { id: string; archived?: boolean }) => arq[o.id] ?? !!o.archived;
  const ativos = (prop.options ?? []).filter((o) => !isArq(o) || o.id === value);
  const arquivados = (prop.options ?? []).filter((o) => isArq(o) && o.id !== value);
  const podeEditar = !!ops && prop.type === "select";
  const fechar = () => {
    setPos(null);
    setNovo("");
    setVerArq(false);
  };
  const criar = () => {
    const nome = novo.trim();
    if (!nome || !ops) return;
    const igual = (prop.options ?? []).find((o) => o.name.trim().toLowerCase() === nome.toLowerCase());
    if (igual) {
      if (isArq(igual)) {
        setArq((a) => ({ ...a, [igual.id]: false }));
        ops.archive(prop, igual.id, false);
      }
      setProp?.(row, prop.id, igual.id);
    } else ops.create(row, prop, nome);
    fechar();
  };
  const arquivar = (id: string, v: boolean) => {
    setArq((a) => ({ ...a, [id]: v }));
    ops?.archive(prop, id, v);
  };
  if (!setProp) return <PropDisplay prop={prop} value={value} people={people} compact />;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      <button
        type="button"
        title={`${prop.name}: clique para trocar`}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: Math.min(r.left, window.innerWidth - 190), y: Math.min(r.bottom + 4, window.innerHeight - 240) });
        }}
        style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "inherit", lineHeight: 1 }}
      >
        {prop.type === "date" && value == null ? (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>📅 + prazo</span>
        ) : value == null ? (
          strongEmpty ? (
            <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>👤 + {prop.name.toLowerCase()}</span>
          ) : (
            <span title={`${prop.name}: escolher`} style={{ fontSize: 11, color: "var(--muted)" }}>👤 +</span>
          )
        ) : (
          <PropDisplay prop={prop} value={value} people={people} compact />
        )}
      </button>
      {pos &&
        createPortal(
          <div onPointerDown={stop} onClick={stop} style={{ position: "fixed", inset: 0, zIndex: 85 }}>
            <div onMouseDown={fechar} style={{ position: "absolute", inset: 0 }} />
            <div style={{ position: "absolute", left: pos.x, top: pos.y, width: 200, maxHeight: "min(420px, calc(100vh - 24px))", overflowY: "auto", background: "var(--card)", border: "0.5px solid var(--line-d)", borderRadius: 9, boxShadow: "0 12px 30px rgba(0,0,0,.5)", padding: 4 }}>
              <div style={{ fontSize: 10.5, color: "var(--muted)", padding: "3px 6px 5px" }}>{prop.name}</div>
              {prop.type === "date" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 4px 4px" }}>
                  <input
                    type="date"
                    autoFocus
                    defaultValue={typeof value === "string" ? value : ""}
                    onChange={(e) => e.target.value && setProp(row, prop.id, e.target.value)}
                    style={{ background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", borderRadius: 6, padding: "5px 6px", font: "inherit", fontSize: 12.5, colorScheme: "dark" }}
                  />
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {([["Hoje", 0], ["Amanhã", 1], ["+7 dias", 7]] as const).map(([l, d]) => (
                      <button key={l} type="button" className="ws-chip" onClick={() => { setProp(row, prop.id, todayBrt(d)); setPos(null); }}>
                        {l}
                      </button>
                    ))}
                    {value != null && (
                      <button type="button" className="ws-chip" onClick={() => { setProp(row, prop.id, null); setPos(null); }}>
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
              )}
              {ativos.map((o) => (
                <div key={o.id} className="ws-opt" style={{ display: "flex", alignItems: "center", borderRadius: 6, background: o.id === value ? "var(--surf)" : "transparent" }}>
                  <button
                    type="button"
                    className="ws-menu-item"
                    onClick={() => {
                      setProp(row, prop.id, o.id);
                      fechar();
                    }}
                    style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 6, padding: "5px 6px", border: 0, background: "transparent", borderRadius: 6, cursor: "pointer", font: "inherit" }}
                  >
                    <PropDisplay prop={prop} value={o.id} people={people} compact />
                    {o.id === value && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>✓</span>}
                  </button>
                  {podeEditar && o.id !== value && (
                    <button type="button" className="ws-opt-arq" title="Arquivar este nome (sai da lista)" onClick={() => arquivar(o.id, true)}>
                      📦
                    </button>
                  )}
                </div>
              ))}
              {podeEditar && (
                <div style={{ borderTop: "0.5px solid var(--line-d)", marginTop: 4, paddingTop: 4 }}>
                  <input
                    value={novo}
                    onChange={(e) => setNovo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") criar();
                      if (e.key === "Escape") fechar();
                    }}
                    placeholder="+ Novo nome (Enter)"
                    style={{ width: "100%", background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", borderRadius: 6, padding: "5px 7px", font: "inherit", fontSize: 12.5, outline: "none" }}
                  />
                  {arquivados.length > 0 && (
                    <button type="button" className="ws-chip" style={{ marginTop: 4, width: "100%" }} onClick={() => setVerArq((v) => !v)}>
                      {verArq ? "Esconder arquivados" : `Mostrar arquivados (${arquivados.length})`}
                    </button>
                  )}
                  {verArq &&
                    arquivados.map((o) => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", opacity: 0.75 }}>
                        <PropDisplay prop={prop} value={o.id} people={people} compact />
                        <button type="button" className="ws-chip" style={{ marginLeft: "auto", padding: "1px 8px" }} title="Volta para a lista" onClick={() => arquivar(o.id, false)}>
                          ↩ voltar
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/** "12/10" (dia/mês em Brasília) a partir do createdAt. */
function abertura(createdAt: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(createdAt));
}

/** Cor da faixa lateral do cartão: a opção da propriedade com papel "priority". */
function prioColorOf(schema: DbSchema, r: RowData): string | null {
  const prio = schema.properties.find((p) => p.role === "priority");
  const opt = prio?.options?.find((o) => o.id === r.props?.[prio.id]);
  return opt ? accentColor(opt.color) : null;
}

// ── Tabela ─────────────────────────────────────────────────────────
function TableView({ ctx, view, props, rows, views }: { ctx: CellCtx; view: View; props: Property[]; rows: RowData[]; views: View[] }) {
  const [menu, setMenu] = useState<string | null>(null);
  const hide = (propId: string) =>
    wsUpdateDatabase(ctx.dbId, { views: views.map((v) => (v.id === view.id ? { ...v, hidden: [...(v.hidden ?? []), propId] } : v)) });
  return (
    <div style={{ overflowX: "auto", border: "0.5px solid var(--line-d)", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 280 + props.length * 150, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 280 }} />
          {props.map((p) => (
            <col key={p.id} style={{ width: p.type === "checkbox" ? 90 : 160 }} />
          ))}
          <col style={{ width: 44 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th}>Nome</th>
            {props.map((p) => (
              <th key={p.id} style={{ ...th, position: "relative", cursor: "pointer" }} onClick={() => setMenu(p.id)}>
                {p.name}
                <Popover open={menu === p.id} onClose={() => setMenu(null)} width={260}>
                  <PropertyMenu dbId={ctx.dbId} schema={ctx.schema} prop={p} onClose={() => setMenu(null)} onHide={() => void hide(p.id)} />
                </Popover>
              </th>
            ))}
            <th style={{ ...th, padding: 2 }}>
              <AddPropertyButton dbId={ctx.dbId} schema={ctx.schema} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="ws-row">
              <td style={td}>
                <RowTitle row={r} />
              </td>
              {props.map((p) => (
                <td key={p.id} style={{ ...td, padding: 1 }}>
                  <PropCell ctx={ctx} rowId={r.id} prop={p} value={r.props?.[p.id] ?? null} />
                </td>
              ))}
              <td style={td} />
            </tr>
          ))}
        </tbody>
      </table>
      <NewRow ctx={ctx} preset={defaultsFromView(view, ctx.schema)} />
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--muted-d)",
  padding: "7px 8px",
  borderBottom: "0.5px solid var(--line-d)",
  borderRight: "0.5px solid var(--line)",
  whiteSpace: "nowrap",
  overflow: "visible",
};
const td: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "0.5px solid var(--line)",
  borderRight: "0.5px solid var(--line)",
  verticalAlign: "middle",
  overflow: "visible",
};

// ── Lista ──────────────────────────────────────────────────────────
function ListView({ ctx, props, rows }: { ctx: CellCtx; props: Property[]; rows: RowData[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.length === 0 && <Empty />}
      {rows.map((r) => (
        <div key={r.id} className="ws-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px", borderBottom: "0.5px solid var(--line)", borderRadius: 4, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <RowTitle row={r} wrap />
          </div>
          <Chips props={props} row={r} people={ctx.people} />
        </div>
      ))}
      <NewRow ctx={ctx} />
    </div>
  );
}

function Empty() {
  return <div style={{ padding: "18px 8px", fontSize: 13, color: "var(--muted)" }}>Nada por aqui com esses filtros.</div>;
}

// ── Quadro (kanban) ────────────────────────────────────────────────
// Arrastar com ponteiro (mouse e toque): mouse começa a arrastar depois de
// mover 5 px; no toque, segurar ~0,3 s. Uma linha mostra onde vai cair.
type DropAction = "done" | "archive" | "trash";
type DragState = { id: string; x: number; y: number; offX: number; offY: number; w: number; over: { col: string; index: number } | { drop: DropAction } | null };
const DROP_LABEL: Record<DropAction, { icon: string; text: string; color: string }> = {
  done: { icon: "✓", text: "Concluir", color: "#46aa64" },
  archive: { icon: "📦", text: "Arquivar", color: "#3c82e6" },
  trash: { icon: "🗑️", text: "Excluir", color: "#e6463c" },
};

function BoardView({
  ctx,
  view,
  props,
  rows,
  onMove,
  dropActions = [],
  onDropAction,
}: {
  ctx: CellCtx;
  view: View;
  props: Property[];
  rows: RowData[];
  onMove: MoveFn;
  dropActions?: DropAction[];
  onDropAction?: (row: RowData, a: DropAction) => void;
}) {
  const group = ctx.schema.properties.find((p) => p.id === view.groupBy);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{ id: string; x: number; y: number; touch: boolean; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null>(null);
  const justDragged = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  type Col = { key: string; label: React.ReactNode; value: PropValue };
  const cols: Col[] = !group
    ? []
    : group.type === "checkbox"
      ? [
          { key: "true", label: "☑ Marcado", value: true },
          { key: "false", label: "☐ Desmarcado", value: false },
        ]
      : group.type === "person"
        ? [...ctx.people.map((p) => ({ key: p.id, label: <Tag>👤 {p.name?.split(" ")[0]}</Tag>, value: p.id as PropValue })), { key: "", label: `Sem ${group.name}`, value: null }]
        : [
            ...(group.options ?? [])
              .filter((o) => !o.archived || rows.some((r) => r.props?.[group.id] === o.id))
              .map((o) => ({ key: o.id, label: <Tag color={o.color}>{o.name}</Tag>, value: o.id as PropValue })),
            { key: "", label: `Sem ${group.name}`, value: null },
          ];
  const keyOf = useCallback(
    (r: RowData) => {
      if (!group) return "";
      const v = r.props?.[group.id];
      if (group.type === "checkbox") return v === true ? "true" : "false";
      return v == null ? "" : String(v);
    },
    [group]
  );

  const setD = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // onde cairia: coluna sob o ponteiro + posição entre os cartões
  const targetAt = (x: number, y: number, dragId: string) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const dropEl = el?.closest<HTMLElement>("[data-drop]");
    if (dropEl) return { drop: dropEl.dataset.drop as DropAction };
    const colEl = el?.closest<HTMLElement>("[data-col]");
    if (!colEl) return null;
    const cards = [...colEl.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== dragId);
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    return { col: colEl.dataset.col ?? "", index };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      const d = dragRef.current;
      if (p && !d) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (p.touch) {
          if (dist > 8 && p.timer) {
            clearTimeout(p.timer); // rolou a tela antes de segurar: não é arraste
            pending.current = null;
          }
          return;
        }
        if (dist > 5) {
          const r = p.el.getBoundingClientRect();
          setD({ id: p.id, x: e.clientX, y: e.clientY, offX: p.x - r.left, offY: p.y - r.top, w: r.width, over: null });
          pending.current = null;
        }
        return;
      }
      if (!d) return;
      // rolagem automática perto das bordas
      const b = boardRef.current?.getBoundingClientRect();
      if (b && boardRef.current) {
        if (e.clientX > b.right - 40) boardRef.current.scrollLeft += 14;
        else if (e.clientX < b.left + 40) boardRef.current.scrollLeft -= 14;
      }
      if (e.clientY > window.innerHeight - 50) window.scrollBy(0, 14);
      else if (e.clientY < 50) window.scrollBy(0, -14);
      setD({ ...d, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY, d.id) });
    };
    const up = () => {
      const p = pending.current;
      if (p?.timer) clearTimeout(p.timer);
      pending.current = null;
      const d = dragRef.current;
      if (!d) return;
      setD(null);
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 50);
      if (!d.over || !group) return;
      const row = rows.find((r) => r.id === d.id);
      if ("drop" in d.over) {
        if (row) onDropAction?.(row, d.over.drop);
        return;
      }
      const over = d.over;
      const col = cols.find((c) => c.key === over.col);
      if (!row || !col) return;
      const list = rows.filter((r) => keyOf(r) === col.key && r.id !== row.id).map((r) => r.id);
      list.splice(over.index, 0, row.id);
      const sameCol = keyOf(row) === col.key;
      const before = rows.filter((r) => keyOf(r) === col.key).map((r) => r.id);
      if (sameCol && before.join() === list.join()) return; // não mudou nada
      onMove(row, sameCol ? null : { [group.id]: col.value }, list);
    };
    const noScroll = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("touchmove", noScroll);
    };
  });

  if (!group) {
    return <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Escolha em “Agrupar” por qual propriedade montar as colunas.</div>;
  }
  const cardProps = props.filter((p) => p.id !== group.id);
  // todo cartão sem responsável mostra "👤 +" (na coluna Delegada, em destaque) para delegar na hora
  const delegateProp = ctx.schema.properties.find((p) => p.role === "delegate");
  const optName = (r: RowData) => group.options?.find((o) => o.id === r.props?.[group.id])?.name ?? "";
  const dragged = drag ? rows.find((r) => r.id === drag.id) : undefined;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, r: RowData) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, textarea")) return;
    const touch = e.pointerType !== "mouse";
    const el = e.currentTarget;
    const start = { id: r.id, x: e.clientX, y: e.clientY, touch, timer: null as ReturnType<typeof setTimeout> | null, el };
    if (touch) {
      start.timer = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        navigator.vibrate?.(15);
        setD({ id: r.id, x: start.x, y: start.y, offX: start.x - rect.left, offY: start.y - rect.top, w: rect.width, over: null });
        pending.current = null;
      }, 300);
    }
    pending.current = start;
  };

  const card = (r: RowData, ghost = false) => (
    <div
      key={r.id}
      data-card={ghost ? undefined : r.id}
      onPointerDown={ghost ? undefined : (e) => onPointerDown(e, r)}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={(e) => drag && e.preventDefault()}
      style={{
        background: "var(--card)",
        border: ghost ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
        borderLeft: prioColorOf(ctx.schema, r) ? `3px solid ${prioColorOf(ctx.schema, r)}` : ghost ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
        borderRadius: 7,
        padding: "6px 8px",
        cursor: drag ? "grabbing" : "grab",
        opacity: !ghost && drag?.id === r.id ? 0.3 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
        boxShadow: ghost ? "0 14px 32px rgba(0,0,0,.5)" : undefined,
      }}
    >
      <RowTitle row={r} wrap size={12.5} />
      <Chips props={cardProps} row={r} people={ctx.people} askEmpty={delegateProp ? [delegateProp] : []} strongEmpty={/delegad/i.test(optName(r))} />
    </div>
  );
  const line = <div style={{ height: 3, borderRadius: 2, background: "var(--accent)", margin: "1px 0" }} />;

  return (
    <div ref={boardRef} style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
      {cols.map((col) => {
        const items = rows.filter((r) => keyOf(r) === col.key);
        if (col.key === "" && items.length === 0 && group.type !== "checkbox" && !drag) return null;
        const overIdx = drag?.over && "col" in drag.over && drag.over.col === col.key ? drag.over.index : -1;
        const overHere = overIdx >= 0;
        const shown = items.filter((r) => r.id !== drag?.id || !overHere);
        return (
          <div
            key={col.key || "none"}
            data-col={col.key}
            style={{ flex: "1 1 0", minWidth: 250, maxWidth: 440, background: overHere ? "var(--card2)" : "var(--surf)", borderRadius: 10, padding: 6, transition: "background .1s" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 6px", fontSize: 12, color: "var(--muted-d)" }}>
              {col.label} <span>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 8 }}>
              {(() => {
                const out: React.ReactNode[] = [];
                const vis = overHere ? shown : items;
                vis.forEach((r, i) => {
                  if (overIdx === i) out.push(<div key="__line">{line}</div>);
                  out.push(card(r));
                });
                if (overHere && overIdx >= vis.length) out.push(<div key="__line">{line}</div>);
                return out;
              })()}
            </div>
            <NewRow ctx={ctx} compact preset={{ ...defaultsFromView(view, ctx.schema), ...(col.value == null ? {} : { [group.id]: col.value }) }} />
          </div>
        );
      })}
      {drag && dragged && (
        <div style={{ position: "fixed", left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w, zIndex: 90, pointerEvents: "none", transform: "rotate(2deg)" }}>
          {card(dragged, true)}
        </div>
      )}
      {drag && dropActions.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 88, display: "flex", justifyContent: "center", gap: 10, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0))" }}>
          {dropActions.map((a) => {
            const on = !!drag.over && "drop" in drag.over && drag.over.drop === a;
            const d = DROP_LABEL[a];
            return (
              <div
                key={a}
                data-drop={a}
                style={{ flex: "0 1 200px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 64, borderRadius: 12, border: `1.5px dashed ${d.color}`, background: on ? d.color : "var(--card)", color: on ? "#fff" : "var(--ink)", fontWeight: 700, fontSize: 14, transform: on ? "scale(1.05)" : undefined, transition: "all .1s" }}
              >
                <span style={{ fontSize: 18 }}>{d.icon}</span> {d.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendário ─────────────────────────────────────────────────────
function CalendarView({ ctx, view, rows }: { ctx: CellCtx; view: View; rows: RowData[] }) {
  const dateProp = ctx.schema.properties.find((p) => p.id === view.dateProp && p.type === "date");
  const today = todayBrt();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [dragging, setDragging] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [, start] = useTransition();
  if (!dateProp) return <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Escolha em “Data” qual propriedade de data usar.</div>;

  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // semana começa na segunda
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<string, RowData[]>();
  for (const r of rows) {
    const d = r.props?.[dateProp.id];
    if (typeof d === "string") byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const semData = rows.filter((r) => !r.props?.[dateProp.id]).length;
  const nomeMes = first.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <strong style={{ fontSize: 15, textTransform: "capitalize", flex: 1 }}>{nomeMes}</strong>
        <GhostButton onClick={() => shift(-1)}>‹</GhostButton>
        <GhostButton onClick={() => setYm(today.slice(0, 7))}>Hoje</GhostButton>
        <GhostButton onClick={() => shift(1)}>›</GhostButton>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: "0.5px solid var(--line-d)", borderRadius: 8, overflow: "hidden" }}>
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => (
          <div key={d} style={{ padding: "5px 6px", fontSize: 11, color: "var(--muted)", borderBottom: "0.5px solid var(--line-d)", textAlign: "right" }}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            onDragOver={(e) => d && e.preventDefault()}
            onDrop={() => {
              if (d && dragging) start(async () => void (await wsSetRowProps(dragging, { [dateProp.id]: d })));
              setDragging(null);
            }}
            onDoubleClick={() => d && setAdding(d)}
            style={{ minHeight: 92, padding: 4, borderRight: (i + 1) % 7 ? "0.5px solid var(--line)" : 0, borderBottom: "0.5px solid var(--line)", background: d ? "transparent" : "var(--surf)", position: "relative", minWidth: 0 }}
          >
            {d && (
              <>
                <div style={{ textAlign: "right", fontSize: 11.5, marginBottom: 3 }}>
                  <span
                    onClick={() => setAdding(d)}
                    title="Adicionar neste dia"
                    style={{ cursor: "pointer", padding: "1px 6px", borderRadius: 999, background: d === today ? "var(--accent)" : "transparent", color: d === today ? "var(--accent-on)" : "var(--muted-d)", fontWeight: d === today ? 700 : 400 }}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
                {(byDay.get(d) ?? []).map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setDragging(r.id)}
                    style={{ background: "var(--card)", border: "0.5px solid var(--line-d)", borderRadius: 5, padding: "2px 5px", marginBottom: 3, fontSize: 11.5, cursor: "grab", overflow: "hidden" }}
                  >
                    <RowTitle row={r} />
                  </div>
                ))}
                {adding === d && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: 22, zIndex: 20, padding: 4 }}>
                    <TextField
                      autoFocus
                      value={title}
                      onChange={setTitle}
                      placeholder="Nome e Enter"
                      onEnter={() => {
                        const t = title.trim();
                        setAdding(null);
                        setTitle("");
                        if (t) start(async () => void (await wsCreatePage({ parentId: ctx.dbId, kind: "row", title: t, props: { ...defaultsFromView(view, ctx.schema), [dateProp.id]: d } })));
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {semData > 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{semData} sem data (não aparecem no calendário)</div>}
    </div>
  );
}

