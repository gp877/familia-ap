"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { wsCreatePage, wsMoveRow, wsSetRowProps, wsUpdateDatabase } from "@/app/actions/workspace";
import {
  type Block,
  type DbSchema,
  type Property,
  type PropValue,
  type View,
  applyView,
  todayBrt,
} from "@/lib/workspace-model";

import { type CellCtx, type Person, PropCell, PropDisplay } from "./prop-cell";
import { RowPeek } from "./row-peek";
import { AddPropertyButton, PropertyMenu, ViewTabs, ViewToolbar } from "./schema-editor";
import { AiBadge, GhostButton, Popover, Tag, TextField } from "./ws-ui";

/** Concluir rápido: a bolinha ○ na frente de cada tarefa (status do grupo "Concluído"). */
type DoneCtx = { isDone: (r: RowData) => boolean; toggle: (r: RowData) => void };
const DoneContext = createContext<DoneCtx | null>(null);
/** Clicar no título abre a tarefa "por cima" (peek) em vez de trocar de página. */
const PeekContext = createContext<((id: string) => void) | null>(null);
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
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPatches({});
  }
  const manual = manualViews.has(baseView.id);
  const view = useMemo(() => (manual && baseView.sorts.length ? { ...baseView, sorts: [] } : baseView), [manual, baseView]);
  const patch = (id: string, p: Patch) =>
    setPatches((o) => ({ ...o, [id]: { props: { ...o[id]?.props, ...p.props }, sortOrder: p.sortOrder ?? o[id]?.sortOrder } }));
  const effRows = useMemo(
    () =>
      rows.map((r) => {
        const p = patches[r.id];
        if (!p) return r;
        return { ...r, props: p.props ? { ...r.props, ...p.props } : r.props, sortOrder: p.sortOrder ?? r.sortOrder };
      }),
    [rows, patches]
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
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <DoneContext.Provider value={doneCtx}>
    <PeekContext.Provider value={setPeekId}>
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
      <Legend board={view.type === "board"} />
      {view.type === "table" && <TableView ctx={ctx} view={view} props={shownProps} rows={visible} views={views} />}
      {view.type === "list" && <ListView ctx={ctx} props={shownProps} rows={visible} />}
      {view.type === "board" && <BoardView ctx={ctx} view={view} props={shownProps} rows={visible} onMove={onMove} />}
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
    </PeekContext.Provider>
    </DoneContext.Provider>
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
      <AiBadge created={row.createdVia === "agent"} revisedAt={row.createdVia === "agent" ? null : row.agentUpdatedAt} />
    </a>
  );
}

/** Valores de propriedades em linha, enxutos (cartões e lista). */
function Chips({ props, row, people }: { props: Property[]; row: RowData; people: CellCtx["people"] }) {
  const shown = props.filter((p) => row.props?.[p.id] != null && row.props?.[p.id] !== "" && !(Array.isArray(row.props?.[p.id]) && !(row.props?.[p.id] as string[]).length));
  if (!shown.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 11.5 }}>
      {shown.map((p) => (
        <PropDisplay key={p.id} prop={p} value={row.props?.[p.id] ?? null} people={people} compact />
      ))}
    </div>
  );
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
type DragState = { id: string; x: number; y: number; offX: number; offY: number; w: number; over: { col: string; index: number } | null };

function BoardView({ ctx, view, props, rows, onMove }: { ctx: CellCtx; view: View; props: Property[]; rows: RowData[]; onMove: MoveFn }) {
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
        : [...(group.options ?? []).map((o) => ({ key: o.id, label: <Tag color={o.color}>{o.name}</Tag>, value: o.id as PropValue })), { key: "", label: `Sem ${group.name}`, value: null }];
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
      const col = cols.find((c) => c.key === d.over!.col);
      if (!row || !col) return;
      const list = rows.filter((r) => keyOf(r) === col.key && r.id !== row.id).map((r) => r.id);
      list.splice(d.over.index, 0, row.id);
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
      <RowTitle row={r} wrap size={13} />
      <Chips props={cardProps} row={r} people={ctx.people} />
    </div>
  );
  const line = <div style={{ height: 3, borderRadius: 2, background: "var(--accent)", margin: "1px 0" }} />;

  return (
    <div ref={boardRef} style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
      {cols.map((col) => {
        const items = rows.filter((r) => keyOf(r) === col.key);
        if (col.key === "" && items.length === 0 && group.type !== "checkbox" && !drag) return null;
        const overHere = drag?.over?.col === col.key;
        const shown = items.filter((r) => r.id !== drag?.id || !overHere);
        return (
          <div
            key={col.key || "none"}
            data-col={col.key}
            style={{ width: 244, flexShrink: 0, background: overHere ? "var(--card2)" : "var(--surf)", borderRadius: 10, padding: 6, transition: "background .1s" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 6px", fontSize: 12, color: "var(--muted-d)" }}>
              {col.label} <span>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 8 }}>
              {(() => {
                const out: React.ReactNode[] = [];
                const vis = overHere ? shown : items;
                vis.forEach((r, i) => {
                  if (overHere && drag!.over!.index === i) out.push(<div key="__line">{line}</div>);
                  out.push(card(r));
                });
                if (overHere && drag!.over!.index >= vis.length) out.push(<div key="__line">{line}</div>);
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

