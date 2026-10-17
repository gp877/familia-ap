"use client";

import { useState, useTransition } from "react";

import { wsSetRowProps, wsUpdateDatabase } from "@/app/actions/workspace";
import {
  COLORS,
  type Color,
  type DbSchema,
  type Property,
  type PropValue,
  type SelectOption,
  STATUS_GROUP_LABEL,
  type StatusGroup,
  newId,
} from "@/lib/workspace-model";

import { MenuItem, MenuLabel, Popover, Tag, TextField, formatDateBr } from "./ws-ui";

export type Person = { id: string; name: string | null };

export type CellCtx = {
  dbId: string;
  schema: DbSchema;
  people: Person[];
};

/** Mostra o valor (sem editar). */
/** "hoje", "amanhã", "ontem", "atrasada 3d" ou "21 out" — data curta pros cartões. */
function shortDate(iso: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 864e5);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff < 0) return `atrasada ${-diff}d`;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(iso.slice(8, 10))} ${meses[Number(iso.slice(5, 7)) - 1]}`;
}

export function PropDisplay({ prop, value, people, compact = false }: { prop: Property; value: PropValue; people: Person[]; compact?: boolean }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  switch (prop.type) {
    case "select":
    case "status": {
      const o = prop.options?.find((x) => x.id === value);
      return o ? <Tag color={o.color} small={compact}>{prop.type === "status" ? "● " : ""}{o.name}</Tag> : null;
    }
    case "multi_select":
      return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
          {(value as string[]).map((id) => {
            const o = prop.options?.find((x) => x.id === id);
            return o ? <Tag key={id} color={o.color} small={compact}>{o.name}</Tag> : null;
          })}
        </span>
      );
    case "date":
      return compact ? (
        <span title={formatDateBr(String(value))} style={{ fontSize: 11.5, fontWeight: 600, color: dateColor(String(value)) }}>
          📅 {shortDate(String(value))}
        </span>
      ) : (
        <span style={{ fontSize: 13, color: dateColor(String(value)) }}>{formatDateBr(String(value))}</span>
      );
    case "checkbox":
      return <span style={{ fontSize: 14 }}>{value === true ? "☑" : "☐"}</span>;
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--ink-d)", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "person": {
      const p = people.find((x) => x.id === value);
      return <Tag color="default" small={compact}>👤 {p?.name?.split(" ")[0] ?? "?"}</Tag>;
    }
    default:
      return <span style={{ fontSize: compact ? 11.5 : 13, color: compact ? "var(--muted-d)" : "var(--ink-d)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: compact ? 160 : undefined }}>{String(value)}</span>;
  }
}

function dateColor(iso: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return iso < today ? "var(--alert)" : iso === today ? "var(--accent)" : "var(--ink-d)";
}

/** Célula editável: clica pra editar; salva sozinho. */
export function PropCell({
  ctx,
  rowId,
  prop,
  value,
  compact = false,
}: {
  ctx: CellCtx;
  rowId: string;
  prop: Property;
  value: PropValue;
  compact?: boolean;
}) {
  const [local, setLocal] = useState<PropValue>(value);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  // valor novo vindo do servidor substitui o local (padrão "ajustar estado na renderização")
  const [prevValue, setPrevValue] = useState(JSON.stringify(value));
  if (JSON.stringify(value) !== prevValue) {
    setPrevValue(JSON.stringify(value));
    setLocal(value);
  }

  const save = (v: PropValue) => {
    setLocal(v);
    start(async () => {
      try {
        await wsSetRowProps(rowId, { [prop.id]: v });
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        setLocal(value);
      }
    });
  };

  if (prop.type === "checkbox") {
    return (
      <div style={{ padding: compact ? 0 : "4px 6px" }}>
        <input
          type="checkbox"
          checked={local === true}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => save(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }}
        />
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <div
        className="ws-cell"
        onClick={() => setOpen(true)}
        style={{ minHeight: compact ? 20 : 30, padding: compact ? 0 : "5px 6px", cursor: "pointer", borderRadius: 4, display: "flex", alignItems: "center", overflow: "hidden" }}
      >
        <PropDisplay prop={prop} value={local} people={ctx.people} />
        {!compact && (local == null || local === "" || (Array.isArray(local) && !local.length)) && (
          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Vazio</span>
        )}
      </div>
      {open && (
        <Popover open onClose={() => setOpen(false)} width={prop.type === "date" ? 230 : 260}>
          <CellEditor ctx={ctx} prop={prop} value={local} onSave={save} onClose={() => setOpen(false)} />
        </Popover>
      )}
    </div>
  );
}

function CellEditor({
  ctx,
  prop,
  value,
  onSave,
  onClose,
}: {
  ctx: CellCtx;
  prop: Property;
  value: PropValue;
  onSave: (v: PropValue) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value == null ? "" : Array.isArray(value) ? "" : String(value));

  if (prop.type === "text" || prop.type === "url" || prop.type === "number") {
    const commit = () => {
      onSave(text.trim() === "" ? null : prop.type === "number" ? Number(text.replace(",", ".")) : text.trim());
      onClose();
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <TextField autoFocus value={text} onChange={setText} onEnter={commit} type={prop.type === "number" ? "text" : "text"} placeholder={prop.type === "url" ? "https://…" : prop.name} />
        <MenuItem onClick={commit} hint="Enter">Salvar</MenuItem>
      </div>
    );
  }
  if (prop.type === "date") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <TextField
          autoFocus
          type="date"
          value={text.slice(0, 10)}
          onChange={(v) => {
            setText(v);
            if (v) onSave(v);
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {[
            ["Hoje", 0],
            ["Amanhã", 1],
            ["+7 dias", 7],
          ].map(([l, d]) => (
            <MenuItem
              key={String(l)}
              onClick={() => {
                const dt = new Date(Date.now() + Number(d) * 864e5);
                onSave(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(dt));
                onClose();
              }}
            >
              {l}
            </MenuItem>
          ))}
        </div>
        <MenuItem
          danger
          onClick={() => {
            onSave(null);
            onClose();
          }}
        >
          Limpar data
        </MenuItem>
      </div>
    );
  }
  if (prop.type === "person") {
    return (
      <div>
        {ctx.people.map((p) => (
          <MenuItem
            key={p.id}
            active={value === p.id}
            onClick={() => {
              onSave(value === p.id ? null : p.id);
              onClose();
            }}
          >
            👤 {p.name ?? "Sem nome"}
          </MenuItem>
        ))}
      </div>
    );
  }
  return <OptionPicker ctx={ctx} prop={prop} value={value} onSave={onSave} onClose={onClose} />;
}

/** Seleção / múltipla / status: escolhe, busca e cria opção nova na hora. */
function OptionPicker({
  ctx,
  prop,
  value,
  onSave,
  onClose,
}: {
  ctx: CellCtx;
  prop: Property;
  value: PropValue;
  onSave: (v: PropValue) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const multi = prop.type === "multi_select";
  const selected = new Set(multi ? ((value as string[]) ?? []) : value ? [String(value)] : []);
  const opts = (prop.options ?? []).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  const exact = (prop.options ?? []).some((o) => o.name.toLowerCase() === q.trim().toLowerCase());

  const pick = (id: string) => {
    if (multi) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSave([...next]);
    } else {
      onSave(selected.has(id) ? null : id);
      onClose();
    }
  };

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    const opt: SelectOption = {
      id: newId(),
      name,
      color: COLORS[1 + ((prop.options?.length ?? 0) % (COLORS.length - 1))] as Color,
      ...(prop.type === "status" ? { group: "todo" as StatusGroup } : {}),
    };
    const schema: DbSchema = {
      properties: ctx.schema.properties.map((p) => (p.id === prop.id ? { ...p, options: [...(p.options ?? []), opt] } : p)),
    };
    await wsUpdateDatabase(ctx.dbId, { schema });
    setQ("");
    pick(opt.id);
  };

  const groups: Array<StatusGroup | null> = prop.type === "status" ? ["todo", "doing", "done"] : [null];
  return (
    <div>
      <TextField autoFocus value={q} onChange={setQ} onEnter={() => (opts[0] && !(!exact && q.trim()) ? pick(opts[0].id) : void create())} placeholder="Buscar ou criar opção" />
      <div style={{ marginTop: 6 }}>
        {groups.map((g) => {
          const list = g ? opts.filter((o) => (o.group ?? "todo") === g) : opts;
          if (!list.length) return null;
          return (
            <div key={g ?? "all"}>
              {g && <MenuLabel>{STATUS_GROUP_LABEL[g]}</MenuLabel>}
              {list.map((o) => (
                <MenuItem key={o.id} active={selected.has(o.id)} onClick={() => pick(o.id)} hint={selected.has(o.id) ? "✓" : undefined}>
                  <Tag color={o.color}>{o.name}</Tag>
                </MenuItem>
              ))}
            </div>
          );
        })}
        {q.trim() && !exact && (
          <MenuItem onClick={() => void create()}>
            Criar <Tag color="gray">{q.trim()}</Tag>
          </MenuItem>
        )}
      </div>
    </div>
  );
}
