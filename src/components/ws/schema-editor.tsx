"use client";

import { useState } from "react";

import { wsUpdateDatabase } from "@/app/actions/workspace";
import {
  COLOR_LABEL,
  COLORS,
  type Color,
  type DbSchema,
  FILTER_OP_LABEL,
  type Filter,
  type FilterOp,
  PROP_LABEL,
  type PropType,
  type Property,
  STATUS_GROUP_LABEL,
  type StatusGroup,
  TITLE_PROP,
  VIEW_LABEL,
  type View,
  type ViewType,
  newId,
  opsFor,
} from "@/lib/workspace-model";

import { GhostButton, MenuItem, MenuLabel, Popover, Tag, TextField, colorStyle } from "./ws-ui";

const TYPES: PropType[] = ["text", "number", "select", "multi_select", "status", "date", "checkbox", "url", "person"];

async function saveSchema(dbId: string, schema: DbSchema) {
  try {
    await wsUpdateDatabase(dbId, { schema });
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}
async function saveViews(dbId: string, views: View[]) {
  try {
    await wsUpdateDatabase(dbId, { views });
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

/** Menu de uma propriedade (cabeçalho da coluna). */
export function PropertyMenu({
  dbId,
  schema,
  prop,
  onClose,
  onHide,
}: {
  dbId: string;
  schema: DbSchema;
  prop: Property;
  onClose: () => void;
  onHide?: () => void;
}) {
  const [name, setName] = useState(prop.name);
  const replace = (p: Property) => saveSchema(dbId, { properties: schema.properties.map((x) => (x.id === prop.id ? p : x)) });
  const hasOptions = prop.type === "select" || prop.type === "multi_select" || prop.type === "status";

  return (
    <div>
      <TextField
        autoFocus
        value={name}
        onChange={setName}
        onEnter={() => {
          if (name.trim()) void replace({ ...prop, name: name.trim() });
          onClose();
        }}
      />
      <MenuLabel>Tipo</MenuLabel>
      <select
        value={prop.type}
        onChange={(e) => {
          const type = e.target.value as PropType;
          const keepsOptions = ["select", "multi_select", "status"].includes(type);
          void replace({
            ...prop,
            name: name.trim() || prop.name,
            type,
            options: keepsOptions
              ? (prop.options ?? []).map((o) => ({ ...o, ...(type === "status" ? { group: o.group ?? ("todo" as StatusGroup) } : {}) }))
              : undefined,
          });
        }}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", fontSize: 13, colorScheme: "dark" }}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {PROP_LABEL[t]}
          </option>
        ))}
      </select>
      {hasOptions && <OptionsEditor prop={prop} onChange={(options) => replace({ ...prop, options })} />}
      <div style={{ height: 1, background: "var(--line-d)", margin: "6px 0" }} />
      {name.trim() && name.trim() !== prop.name && (
        <MenuItem
          onClick={() => {
            void replace({ ...prop, name: name.trim() });
            onClose();
          }}
        >
          Salvar nome
        </MenuItem>
      )}
      {onHide && (
        <MenuItem
          onClick={() => {
            onHide();
            onClose();
          }}
        >
          Esconder nesta visualização
        </MenuItem>
      )}
      <MenuItem
        danger
        onClick={() => {
          if (!confirm(`Excluir a propriedade "${prop.name}"? Os valores dela somem de todas as linhas.`)) return;
          void saveSchema(dbId, { properties: schema.properties.filter((p) => p.id !== prop.id) });
          onClose();
        }}
      >
        Excluir propriedade
      </MenuItem>
    </div>
  );
}

function OptionsEditor({ prop, onChange }: { prop: Property; onChange: (o: NonNullable<Property["options"]>) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const options = prop.options ?? [];
  const set = (id: string, patch: Partial<NonNullable<Property["options"]>[number]>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  return (
    <div>
      <MenuLabel>Opções</MenuLabel>
      {options.map((o, i) => (
        <div key={o.id} style={{ position: "relative" }}>
          <MenuItem onClick={() => setEditing(editing === o.id ? null : o.id)} hint={prop.type === "status" ? STATUS_GROUP_LABEL[o.group ?? "todo"] : "editar"}>
            <Tag color={o.color}>{o.name}</Tag>
          </MenuItem>
          {editing === o.id && (
            <div style={{ padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "0.5px solid var(--line-d)" }}>
              <TextField value={o.name} onChange={(v) => set(o.id, { name: v })} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {COLORS.map((c: Color) => (
                  <button
                    key={c}
                    type="button"
                    title={COLOR_LABEL[c]}
                    onClick={() => set(o.id, { color: c })}
                    style={{ ...colorStyle(c), width: 22, height: 22, borderRadius: 5, border: o.color === c ? "2px solid var(--ink)" : "0.5px solid var(--line-d)", cursor: "pointer" }}
                  />
                ))}
              </div>
              {prop.type === "status" && (
                <select
                  value={o.group ?? "todo"}
                  onChange={(e) => set(o.id, { group: e.target.value as StatusGroup })}
                  style={{ padding: "4px 6px", borderRadius: 6, background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", fontSize: 12.5, colorScheme: "dark" }}
                >
                  {(["todo", "doing", "done"] as StatusGroup[]).map((g) => (
                    <option key={g} value={g}>
                      Grupo: {STATUS_GROUP_LABEL[g]}
                    </option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <GhostButton disabled={i === 0} onClick={() => { const a = [...options]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }}>↑</GhostButton>
                <GhostButton disabled={i === options.length - 1} onClick={() => { const a = [...options]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange(a); }}>↓</GhostButton>
                <GhostButton onClick={() => onChange(options.filter((x) => x.id !== o.id))}>Excluir opção</GhostButton>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ padding: "4px 0" }}>
        <TextField
          value={newName}
          onChange={setNewName}
          placeholder="+ nova opção (Enter)"
          onEnter={() => {
            if (!newName.trim()) return;
            onChange([...options, { id: newId(), name: newName.trim(), color: COLORS[1 + (options.length % (COLORS.length - 1))], ...(prop.type === "status" ? { group: "todo" as StatusGroup } : {}) }]);
            setNewName("");
          }}
        />
      </div>
    </div>
  );
}

/** Botão "+" de nova propriedade. */
export function AddPropertyButton({ dbId, schema }: { dbId: string; schema: DbSchema }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div style={{ position: "relative" }}>
      <GhostButton onClick={() => setOpen(true)} title="Nova propriedade">+</GhostButton>
      <Popover open={open} onClose={() => setOpen(false)} width={240} align="right">
        <TextField autoFocus value={name} onChange={setName} placeholder="Nome da propriedade" />
        <MenuLabel>Tipo</MenuLabel>
        {TYPES.map((t) => (
          <MenuItem
            key={t}
            onClick={() => {
              const p: Property = { id: newId(), name: name.trim() || PROP_LABEL[t], type: t, ...(["select", "multi_select", "status"].includes(t) ? { options: t === "status" ? [
                { id: newId(), name: "A fazer", color: "gray", group: "todo" },
                { id: newId(), name: "Fazendo", color: "blue", group: "doing" },
                { id: newId(), name: "Feito", color: "green", group: "done" },
              ] : [] } : {}) };
              void saveSchema(dbId, { properties: [...schema.properties, p] });
              setName("");
              setOpen(false);
            }}
          >
            {PROP_LABEL[t]}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}

// ── visualizações ─────────────────────────────────────────────────

export function ViewTabs({
  dbId,
  views,
  activeId,
  onSelect,
}: {
  dbId: string;
  views: View[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rename, setRename] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", borderBottom: "0.5px solid var(--line-d)", paddingBottom: 4 }}>
      {views.map((v) => (
        <div key={v.id} style={{ position: "relative" }}>
          <GhostButton
            active={v.id === activeId}
            onClick={() => {
              if (v.id === activeId) {
                setRename(v.name);
                setMenu(v.id);
              } else onSelect(v.id);
            }}
            title={v.id === activeId ? "Clique para editar a visualização" : undefined}
          >
            {viewIcon(v.type)} {v.name}
          </GhostButton>
          <Popover open={menu === v.id} onClose={() => setMenu(null)} width={230}>
            <TextField
              autoFocus
              value={rename}
              onChange={setRename}
              onEnter={() => {
                if (rename.trim()) void saveViews(dbId, views.map((x) => (x.id === v.id ? { ...x, name: rename.trim() } : x)));
                setMenu(null);
              }}
            />
            <MenuLabel>Tipo</MenuLabel>
            {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => (
              <MenuItem key={t} active={v.type === t} onClick={() => void saveViews(dbId, views.map((x) => (x.id === v.id ? { ...x, type: t } : x)))}>
                {viewIcon(t)} {VIEW_LABEL[t]}
              </MenuItem>
            ))}
            <div style={{ height: 1, background: "var(--line-d)", margin: "4px 0" }} />
            <MenuItem
              onClick={() => {
                const copy = { ...v, id: newId(), name: v.name + " (cópia)" };
                void saveViews(dbId, [...views, copy]);
                setMenu(null);
                onSelect(copy.id);
              }}
            >
              Duplicar
            </MenuItem>
            {views.length > 1 && (
              <MenuItem
                danger
                onClick={() => {
                  const rest = views.filter((x) => x.id !== v.id);
                  void saveViews(dbId, rest);
                  setMenu(null);
                  onSelect(rest[0].id);
                }}
              >
                Excluir visualização
              </MenuItem>
            )}
          </Popover>
        </div>
      ))}
      <div style={{ position: "relative" }}>
        <GhostButton onClick={() => setAdding(true)} title="Nova visualização">+</GhostButton>
        <Popover open={adding} onClose={() => setAdding(false)} width={200}>
          <MenuLabel>Nova visualização</MenuLabel>
          {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => (
            <MenuItem
              key={t}
              onClick={() => {
                const v: View = { id: newId(), name: VIEW_LABEL[t], type: t, filters: [], sorts: [] };
                void saveViews(dbId, [...views, v]);
                setAdding(false);
                onSelect(v.id);
              }}
            >
              {viewIcon(t)} {VIEW_LABEL[t]}
            </MenuItem>
          ))}
        </Popover>
      </div>
    </div>
  );
}

export function viewIcon(t: ViewType) {
  return t === "table" ? "▦" : t === "board" ? "▥" : t === "calendar" ? "▤" : "☰";
}

type PropRef = { id: string; name: string; type: PropType | "title"; options?: Property["options"] };

/** Barra de Filtro / Ordenar / Agrupar / Propriedades da visualização ativa. */
export function ViewToolbar({ dbId, schema, views, view }: { dbId: string; schema: DbSchema; views: View[]; view: View }) {
  const [open, setOpen] = useState<null | "filter" | "sort" | "group" | "props" | "date">(null);
  const all: PropRef[] = [{ id: TITLE_PROP, name: "Nome", type: "title" }, ...schema.properties];
  const save = (patch: Partial<View>) => void saveViews(dbId, views.map((v) => (v.id === view.id ? { ...v, ...patch } : v)));
  const groupable = schema.properties.filter((p) => ["select", "status", "person", "checkbox"].includes(p.type));
  const dates = schema.properties.filter((p) => p.type === "date");

  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <GhostButton active={view.filters.length > 0} onClick={() => setOpen("filter")}>
          Filtro{view.filters.length ? ` · ${view.filters.length}` : ""}
        </GhostButton>
        <Popover open={open === "filter"} onClose={() => setOpen(null)} width={360} align="right">
          <MenuLabel>Mostrar linhas onde…</MenuLabel>
          {view.filters.map((f, i) => (
            <FilterRow
              key={i}
              filter={f}
              props={all}
              onChange={(nf) => save({ filters: view.filters.map((x, j) => (j === i ? nf : x)) })}
              onRemove={() => save({ filters: view.filters.filter((_, j) => j !== i) })}
            />
          ))}
          <MenuItem onClick={() => save({ filters: [...view.filters, { prop: TITLE_PROP, op: "contains", value: "" }] })}>+ Adicionar filtro</MenuItem>
        </Popover>
      </div>
      <div style={{ position: "relative" }}>
        <GhostButton active={view.sorts.length > 0} onClick={() => setOpen("sort")}>
          Ordenar{view.sorts.length ? ` · ${view.sorts.length}` : ""}
        </GhostButton>
        <Popover open={open === "sort"} onClose={() => setOpen(null)} width={300} align="right">
          {view.sorts.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 4, padding: "3px 0" }}>
              <Select value={s.prop} onChange={(v) => save({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, prop: v } : x)) })} options={all.map((p) => [p.id, p.name])} />
              <Select value={s.dir} onChange={(v) => save({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, dir: v as "asc" | "desc" } : x)) })} options={[["asc", "Crescente"], ["desc", "Decrescente"]]} />
              <GhostButton onClick={() => save({ sorts: view.sorts.filter((_, j) => j !== i) })}>×</GhostButton>
            </div>
          ))}
          <MenuItem onClick={() => save({ sorts: [...view.sorts, { prop: TITLE_PROP, dir: "asc" }] })}>+ Adicionar ordenação</MenuItem>
        </Popover>
      </div>
      {view.type === "board" && (
        <div style={{ position: "relative" }}>
          <GhostButton onClick={() => setOpen("group")}>Agrupar: {schema.properties.find((p) => p.id === view.groupBy)?.name ?? "—"}</GhostButton>
          <Popover open={open === "group"} onClose={() => setOpen(null)} width={220} align="right">
            {groupable.length === 0 && <div style={{ padding: 8, fontSize: 12.5, color: "var(--muted)" }}>Crie uma propriedade de Status, Seleção, Pessoa ou Caixa para agrupar.</div>}
            {groupable.map((p) => (
              <MenuItem key={p.id} active={view.groupBy === p.id} onClick={() => { save({ groupBy: p.id }); setOpen(null); }}>
                {p.name}
              </MenuItem>
            ))}
          </Popover>
        </div>
      )}
      {view.type === "calendar" && (
        <div style={{ position: "relative" }}>
          <GhostButton onClick={() => setOpen("date")}>Data: {schema.properties.find((p) => p.id === view.dateProp)?.name ?? "—"}</GhostButton>
          <Popover open={open === "date"} onClose={() => setOpen(null)} width={220} align="right">
            {dates.length === 0 && <div style={{ padding: 8, fontSize: 12.5, color: "var(--muted)" }}>Crie uma propriedade de Data.</div>}
            {dates.map((p) => (
              <MenuItem key={p.id} active={view.dateProp === p.id} onClick={() => { save({ dateProp: p.id }); setOpen(null); }}>
                {p.name}
              </MenuItem>
            ))}
          </Popover>
        </div>
      )}
      {(view.type === "table" || view.type === "list" || view.type === "board") && (
        <div style={{ position: "relative" }}>
          <GhostButton onClick={() => setOpen("props")}>Propriedades</GhostButton>
          <Popover open={open === "props"} onClose={() => setOpen(null)} width={240} align="right">
            <MenuLabel>Mostrar nesta visualização</MenuLabel>
            {schema.properties.map((p) => {
              const hidden = (view.hidden ?? []).includes(p.id);
              return (
                <MenuItem key={p.id} onClick={() => save({ hidden: hidden ? (view.hidden ?? []).filter((x) => x !== p.id) : [...(view.hidden ?? []), p.id] })} hint={hidden ? "oculta" : "✓"}>
                  {p.name}
                </MenuItem>
              );
            })}
          </Popover>
        </div>
      )}
    </div>
  );
}

function FilterRow({ filter, props, onChange, onRemove }: { filter: Filter; props: PropRef[]; onChange: (f: Filter) => void; onRemove: () => void }) {
  const prop = props.find((p) => p.id === filter.prop) ?? props[0];
  const ops = opsFor(prop.type);
  const needsValue = !["empty", "not_empty", "checked", "unchecked"].includes(filter.op);
  return (
    <div style={{ display: "flex", gap: 4, padding: "3px 0", alignItems: "center", flexWrap: "wrap" }}>
      <Select
        value={filter.prop}
        onChange={(v) => {
          const np = props.find((p) => p.id === v)!;
          onChange({ prop: v, op: opsFor(np.type)[0], value: "" });
        }}
        options={props.map((p) => [p.id, p.name])}
      />
      <Select value={filter.op} onChange={(v) => onChange({ ...filter, op: v as FilterOp })} options={ops.map((o) => [o, FILTER_OP_LABEL[o]])} />
      {needsValue &&
        (prop.options ? (
          <Select value={filter.value ?? ""} onChange={(v) => onChange({ ...filter, value: v })} options={[["", "—"], ...prop.options.map((o) => [o.id, o.name] as [string, string])]} />
        ) : prop.type === "date" ? (
          <Select
            value={filter.value === "@hoje" ? "@hoje" : filter.value ? "custom" : ""}
            onChange={(v) => onChange({ ...filter, value: v === "@hoje" ? "@hoje" : v === "custom" ? new Intl.DateTimeFormat("en-CA").format(new Date()) : "" })}
            options={[["", "—"], ["@hoje", "Hoje"], ["custom", "Data fixa…"]]}
          />
        ) : (
          <input
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            placeholder="valor"
            style={{ flex: 1, minWidth: 80, padding: "4px 6px", borderRadius: 6, background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", fontSize: 12.5 }}
          />
        ))}
      {prop.type === "date" && filter.value && filter.value !== "@hoje" && (
        <input
          type="date"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          style={{ padding: "3px 6px", borderRadius: 6, background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", fontSize: 12.5, colorScheme: "dark" }}
        />
      )}
      <GhostButton onClick={onRemove}>×</GhostButton>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: "4px 6px", borderRadius: 6, background: "var(--surf)", color: "var(--ink)", border: "0.5px solid var(--line-d)", fontSize: 12.5, maxWidth: 150, colorScheme: "dark" }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
