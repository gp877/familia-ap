"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { wsCreatePage, wsSetRowProps, wsUpdateDatabase } from "@/app/actions/workspace";
import {
  type DbSchema,
  type Property,
  type PropValue,
  type View,
  applyView,
  todayBrt,
} from "@/lib/workspace-model";

import { type CellCtx, type Person, PropCell, PropDisplay } from "./prop-cell";
import { AddPropertyButton, PropertyMenu, ViewTabs, ViewToolbar } from "./schema-editor";
import { AiBadge, GhostButton, Popover, Tag, TextField } from "./ws-ui";

export type RowData = {
  id: string;
  title: string;
  icon: string | null;
  props: Record<string, PropValue>;
  sortOrder: number;
  createdAt: string;
  createdVia: string;
  agentUpdatedAt: string | null;
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
  const view = views.find((v) => v.id === activeId)!;
  const visible = useMemo(() => applyView(rows, view, schema), [rows, view, schema]);
  const ctx: CellCtx = { dbId, schema, people };
  const shownProps = schema.properties.filter((p) => !(view.hidden ?? []).includes(p.id));

  const select = (id: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("v", id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap", borderBottom: "0.5px solid var(--line-d)", paddingBottom: 4 }}>
        <ViewTabs dbId={dbId} views={views} activeId={activeId} onSelect={select} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {visible.length}
            {visible.length !== rows.length ? `/${rows.length}` : ""} {visible.length === 1 ? "item" : "itens"}
          </span>
          <ViewToolbar dbId={dbId} schema={schema} views={views} view={view} />
        </div>
      </div>
      {view.type === "table" && <TableView ctx={ctx} view={view} props={shownProps} rows={visible} views={views} />}
      {view.type === "list" && <ListView ctx={ctx} props={shownProps} rows={visible} />}
      {view.type === "board" && <BoardView ctx={ctx} view={view} props={shownProps} rows={visible} />}
      {view.type === "calendar" && <CalendarView ctx={ctx} view={view} rows={visible} />}
    </div>
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

/** Título da linha. `wrap` (cartões e lista): quebra em até 2 linhas em vez de cortar. */
function RowTitle({ row, wrap = false, size = 13.5 }: { row: RowData; wrap?: boolean; size?: number }) {
  const router = useRouter();
  return (
    <a
      href={`/tarefas/${row.id}`}
      onClick={(e) => {
        e.preventDefault();
        router.push(`/tarefas/${row.id}`);
      }}
      title={row.title}
      style={{ display: "flex", alignItems: wrap ? "flex-start" : "center", gap: 6, color: "var(--ink)", textDecoration: "none", fontWeight: 500, fontSize: size, lineHeight: 1.3, minWidth: 0 }}
    >
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
      {row.createdVia === "agent" ? (
        <span title="Criada pelo assistente de IA" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", flexShrink: 0, marginTop: wrap ? 6 : 0 }} />
      ) : (
        <AiBadge revisedAt={row.agentUpdatedAt} />
      )}
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
function BoardView({ ctx, view, props, rows }: { ctx: CellCtx; view: View; props: Property[]; rows: RowData[] }) {
  const group = ctx.schema.properties.find((p) => p.id === view.groupBy);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!group) {
    return <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Escolha em “Agrupar” por qual propriedade montar as colunas.</div>;
  }
  type Col = { key: string; label: React.ReactNode; value: PropValue };
  const cols: Col[] =
    group.type === "checkbox"
      ? [
          { key: "true", label: "☑ Marcado", value: true },
          { key: "false", label: "☐ Desmarcado", value: false },
        ]
      : group.type === "person"
        ? [...ctx.people.map((p) => ({ key: p.id, label: <Tag>👤 {p.name?.split(" ")[0]}</Tag>, value: p.id as PropValue })), { key: "", label: `Sem ${group.name}`, value: null }]
        : [...(group.options ?? []).map((o) => ({ key: o.id, label: <Tag color={o.color}>{o.name}</Tag>, value: o.id as PropValue })), { key: "", label: `Sem ${group.name}`, value: null }];
  const keyOf = (r: RowData) => {
    const v = r.props?.[group.id];
    if (group.type === "checkbox") return v === true ? "true" : "false";
    return v == null ? "" : String(v);
  };
  const cardProps = props.filter((p) => p.id !== group.id);
  const move = (rowId: string, col: Col) =>
    start(async () => {
      await wsSetRowProps(rowId, { [group.id]: col.value });
    });

  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
      {cols.map((col) => {
        const items = rows.filter((r) => keyOf(r) === col.key);
        if (col.key === "" && items.length === 0 && group.type !== "checkbox") return null;
        return (
          <div
            key={col.key || "none"}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              if (dragging) move(dragging, col);
              setDragging(null);
              setOver(null);
            }}
            style={{ width: 244, flexShrink: 0, background: over === col.key ? "var(--card2)" : "var(--surf)", borderRadius: 10, padding: 6, transition: "background .1s" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 6px", fontSize: 12, color: "var(--muted-d)" }}>
              {col.label} <span>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={() => setDragging(r.id)}
                  onDragEnd={() => setDragging(null)}
                  style={{ background: "var(--card)", border: "0.5px solid var(--line-d)", borderRadius: 7, padding: "6px 8px", cursor: "grab", opacity: dragging === r.id ? 0.4 : 1, display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <RowTitle row={r} wrap size={13} />
                  <Chips props={cardProps} row={r} people={ctx.people} />
                </div>
              ))}
            </div>
            <NewRow ctx={ctx} compact preset={{ ...defaultsFromView(view, ctx.schema), ...(col.value == null ? {} : { [group.id]: col.value }) }} />
          </div>
        );
      })}
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

