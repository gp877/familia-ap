/**
 * Ponte entre a API de agentes e o espaço de trabalho (lib/workspace).
 * O agente fala por NOMES ("Status": "Fazendo", "Prazo": "2026-10-20") e
 * texto simples; aqui viram ids de propriedade/opção e blocos.
 */
import type { WsPage } from "./workspace";
import { updateDatabase } from "./workspace";
import type { WsActor } from "./workspace";
import {
  type Block,
  type BlockType,
  COLORS,
  type DbSchema,
  type PropValue,
  type SelectOption,
  type View,
  newId,
} from "./workspace-model";
import { AgentInputError } from "./agent-api";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** { "Nome da propriedade": valor } → { propId: valor }. Cria opção de seleção que não existir (menos Status). */
export async function propsFromNames(
  actor: WsActor,
  dbPage: WsPage,
  input: unknown
): Promise<Record<string, PropValue>> {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new AgentInputError('"propriedades" deve ser um objeto { "Nome": valor }');
  const schema: DbSchema = structuredClone((dbPage.schema as DbSchema) ?? { properties: [] });
  let schemaChanged = false;
  const out: Record<string, PropValue> = {};

  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const prop = schema.properties.find((p) => norm(p.name) === norm(name) || p.id === name);
    if (!prop) {
      throw new AgentInputError(`Propriedade "${name}" não existe. Existem: ${schema.properties.map((p) => p.name).join(", ")}`);
    }
    if (raw == null || raw === "") {
      out[prop.id] = null;
      continue;
    }
    if (prop.type === "select" || prop.type === "status" || prop.type === "multi_select") {
      const names = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const ids: string[] = [];
      for (const n of names) {
        let opt = prop.options?.find((o) => norm(o.name) === norm(n) || o.id === n);
        if (!opt) {
          if (prop.type === "status") {
            throw new AgentInputError(`Status "${n}" não existe. Use: ${(prop.options ?? []).map((o) => o.name).join(", ")}`);
          }
          opt = { id: newId(), name: n.slice(0, 60), color: COLORS[1 + ((prop.options?.length ?? 0) % (COLORS.length - 1))] } as SelectOption;
          prop.options = [...(prop.options ?? []), opt];
          schemaChanged = true;
        }
        ids.push(opt.id);
      }
      out[prop.id] = prop.type === "multi_select" ? ids : ids[0];
      continue;
    }
    if (prop.type === "checkbox") {
      out[prop.id] = raw === true || ["sim", "true", "1", "x"].includes(norm(String(raw)));
      continue;
    }
    out[prop.id] = raw as PropValue;
  }
  if (schemaChanged) await updateDatabase(actor, dbPage.id, { schema });
  return out;
}

/** { propId: valor } → { "Nome": valor legível } pra devolver ao agente. */
export function propsToNames(schema: DbSchema, props: Record<string, PropValue> | null) {
  const out: Record<string, PropValue> = {};
  for (const p of schema.properties) {
    const v = props?.[p.id];
    if (v == null || v === "") continue;
    if (p.type === "select" || p.type === "status") out[p.name] = p.options?.find((o) => o.id === v)?.name ?? null;
    else if (p.type === "multi_select") out[p.name] = (v as string[]).map((id) => p.options?.find((o) => o.id === id)?.name ?? id);
    else out[p.name] = v;
  }
  return out;
}

/** Descrição do banco pro agente saber o que pode preencher. */
export function describeSchema(schema: DbSchema) {
  return schema.properties.map((p) => ({
    nome: p.name,
    tipo: p.type,
    ...(p.options ? { opcoes: p.options.map((o) => o.name) } : {}),
  }));
}

const LINE_RULES: Array<[RegExp, BlockType, ((m: RegExpMatchArray) => Partial<Block>)?]> = [
  [/^###\s+(.*)$/, "h3"],
  [/^##\s+(.*)$/, "h2"],
  [/^#\s+(.*)$/, "h1"],
  [/^\[(x|X)\]\s+(.*)$/, "todo", () => ({ checked: true })],
  [/^\[\s?\]\s+(.*)$/, "todo", () => ({ checked: false })],
  [/^[-*•]\s+(.*)$/, "bullet"],
  [/^\d+[.)]\s+(.*)$/, "numbered"],
  [/^>\s+(.*)$/, "quote"],
];

/** Texto simples (com atalhos de markdown) → blocos. */
export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (/^💡\s*/u.test(line)) {
      blocks.push({ id: newId(), type: "callout", text: line.replace(/^💡\s*/u, "").slice(0, 5000) });
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ id: newId(), type: "divider", text: "" });
      continue;
    }
    let done = false;
    for (const [rx, type, extra] of LINE_RULES) {
      const m = line.match(rx);
      if (m) {
        blocks.push({ id: newId(), type, text: (m[m.length - 1] ?? "").slice(0, 5000), ...(extra?.(m) ?? {}) });
        done = true;
        break;
      }
    }
    if (!done) blocks.push({ id: newId(), type: "paragraph", text: line.slice(0, 5000) });
  }
  while (blocks.length && blocks[blocks.length - 1].type === "paragraph" && !blocks[blocks.length - 1].text) blocks.pop();
  return blocks.slice(0, 1500);
}

/** Blocos → texto simples pra leitura do agente. */
export function blocksToText(blocks: Block[] | null): string {
  let n = 0;
  return (blocks ?? [])
    .map((b) => {
      n = b.type === "numbered" ? n + 1 : 0;
      switch (b.type) {
        case "h1":
          return "# " + b.text;
        case "h2":
          return "## " + b.text;
        case "h3":
          return "### " + b.text;
        case "todo":
          return (b.checked ? "[x] " : "[ ] ") + b.text;
        case "bullet":
          return "- " + b.text;
        case "numbered":
          return `${n}. ${b.text}`;
        case "quote":
          return "> " + b.text;
        case "divider":
          return "---";
        case "page":
          return `[subpágina ${b.pageId}]`;
        case "toggle":
          return "▸ " + b.text + (b.body ? "\n  " + b.body.replace(/\n/g, "\n  ") : "");
        default:
          return b.text;
      }
    })
    .join("\n");
}

/** Linha de banco no formato da API (nomes legíveis). */
export function rowOut(schema: DbSchema, r: { id: string; title: string; props: unknown; createdVia: string; agentUpdatedAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return {
    id: r.id,
    titulo: r.title,
    propriedades: propsToNames(schema, (r.props as Record<string, PropValue>) ?? {}),
    criada_em: r.createdAt.toISOString(),
    atualizada_em: r.updatedAt.toISOString(),
    feita_pela_ia: r.createdVia === "agent",
    revisada_pela_ia_em: r.agentUpdatedAt ? r.agentUpdatedAt.toISOString() : null,
  };
}

const PROP_TYPES = ["text", "number", "select", "multi_select", "status", "date", "checkbox", "url", "person"] as const;
const VIEW_TYPES = ["table", "board", "list", "calendar"] as const;
const OPS = ["is", "is_not", "contains", "not_contains", "empty", "not_empty", "before", "after", "on_or_before", "on_or_after", "checked", "unchecked"] as const;

function papelDe(v: unknown) {
  if (v === "instrucao_ia") return "ai_prompt" as const;
  if (v === "status_ia") return "ai_status" as const;
  if (v === "prioridade") return "priority" as const;
  return undefined;
}

/**
 * Configura um banco por NOMES: cria propriedades novas e/ou substitui as
 * visualizações. Filtros aceitam o nome da opção (ou "@hoje" em datas).
 *   { "adicionar_propriedades": [{ "nome", "tipo", "opcoes"?: ["A", "B"] }],
 *     "visualizacoes": [{ "nome", "tipo": "table|board|list|calendar", "agrupar_por"?, "data"?,
 *        "filtros"?: [{ "propriedade", "operador", "valor"? }], "ordenar"?: [{ "propriedade", "direcao": "asc|desc" }],
 *        "ocultar"?: ["Nome da propriedade"], "modos"?: [{ "nome", "filtros" }] }],
 *     "opcoes"?: { "Prop": { "renomear"?: {"Velho": "Novo"}, "adicionar"?: [], "remover"?: [], "ordem"?: [] } },
 *     "papeis"?: { "Prop": "prioridade" | "instrucao_ia" | "status_ia" | null } }
 */
export async function configureDatabase(actor: WsActor, dbPage: WsPage, body: Record<string, unknown>) {
  const schema: DbSchema = structuredClone((dbPage.schema as DbSchema) ?? { properties: [] });
  const add = Array.isArray(body.adicionar_propriedades) ? (body.adicionar_propriedades as Array<Record<string, unknown>>) : [];
  for (const p of add) {
    const nome = String(p.nome ?? "").trim();
    const tipo = String(p.tipo ?? "") as (typeof PROP_TYPES)[number];
    if (!nome || !PROP_TYPES.includes(tipo)) throw new AgentInputError(`Propriedade inválida: ${JSON.stringify(p)}`);
    if (schema.properties.some((x) => norm(x.name) === norm(nome))) continue;
    const opcoes = Array.isArray(p.opcoes) ? p.opcoes.map(String) : [];
    const papel = papelDe(p.papel);
    schema.properties.push({
      id: newId(),
      name: nome,
      type: tipo,
      ...(papel ? { role: papel } : {}),
      ...(["select", "multi_select", "status"].includes(tipo)
        ? { options: opcoes.map((o, i) => ({ id: newId(), name: o, color: COLORS[1 + (i % (COLORS.length - 1))] })) }
        : {}),
    });
  }

  // Opções de select por nome: { "Tipo": { renomear: {"Velho": "Novo"}, adicionar: [...], remover: [...], ordem: [...] } }
  if (body.opcoes && typeof body.opcoes === "object") {
    for (const [nomeProp, cfg] of Object.entries(body.opcoes as Record<string, Record<string, unknown>>)) {
      const prop = schema.properties.find((x) => norm(x.name) === norm(nomeProp));
      if (!prop || !prop.options) throw new AgentInputError(`"${nomeProp}" não é uma propriedade com opções`);
      for (const [velho, novo] of Object.entries((cfg.renomear as Record<string, string>) ?? {})) {
        const o = prop.options.find((x) => norm(x.name) === norm(velho));
        if (o && String(novo).trim()) o.name = String(novo).trim().slice(0, 60);
      }
      for (const nome of Array.isArray(cfg.adicionar) ? cfg.adicionar.map(String) : []) {
        if (!prop.options.some((x) => norm(x.name) === norm(nome)))
          prop.options.push({ id: newId(), name: nome.slice(0, 60), color: COLORS[1 + (prop.options.length % (COLORS.length - 1))] });
      }
      const remover = new Set((Array.isArray(cfg.remover) ? cfg.remover.map(String) : []).map(norm));
      prop.options = prop.options.filter((x) => !remover.has(norm(x.name)));
      if (Array.isArray(cfg.ordem)) {
        const ordem = cfg.ordem.map((x) => norm(String(x)));
        const pos = (n: string) => (ordem.indexOf(norm(n)) + 1 || 999);
        prop.options.sort((a, b) => pos(a.name) - pos(b.name));
      }
    }
  }
  // Papéis em propriedades existentes: { "Prioridade": "prioridade" }
  if (body.papeis && typeof body.papeis === "object") {
    for (const [nomeProp, papel] of Object.entries(body.papeis as Record<string, unknown>)) {
      const prop = schema.properties.find((x) => norm(x.name) === norm(nomeProp));
      if (!prop) throw new AgentInputError(`Propriedade "${nomeProp}" não existe`);
      const r = papelDe(papel);
      if (r) prop.role = r;
      else delete prop.role;
    }
  }

  const propId = (nome: unknown) => {
    if (nome === "Nome" || nome === "title") return "title";
    const p = schema.properties.find((x) => norm(x.name) === norm(String(nome ?? "")));
    if (!p) throw new AgentInputError(`Propriedade "${nome}" não existe`);
    return p.id;
  };
  const optVal = (pid: string, v: unknown) => {
    if (v == null) return undefined;
    if (/^@hoje([+-]\d{1,3})?$/.test(String(v))) return String(v);
    const p = schema.properties.find((x) => x.id === pid);
    const o = p?.options?.find((x) => norm(x.name) === norm(String(v)));
    return o ? o.id : String(v);
  };

  let views: View[] | undefined;
  if (Array.isArray(body.visualizacoes)) {
    views = (body.visualizacoes as Array<Record<string, unknown>>).map((v) => {
      const tipo = String(v.tipo ?? "table") as (typeof VIEW_TYPES)[number];
      if (!VIEW_TYPES.includes(tipo)) throw new AgentInputError(`Visualização com tipo inválido: ${v.tipo}`);
      const parseFiltros = (lista: unknown) =>
        (Array.isArray(lista) ? (lista as Array<Record<string, unknown>>) : []).map((f) => {
          const pid = propId(f.propriedade);
          const op = String(f.operador ?? "is") as (typeof OPS)[number];
          if (!OPS.includes(op)) throw new AgentInputError(`Operador inválido: ${f.operador}`);
          return { prop: pid, op, ...(f.valor != null ? { value: optVal(pid, f.valor) } : {}) };
        });
      const ordenar = Array.isArray(v.ordenar) ? (v.ordenar as Array<Record<string, unknown>>) : [];
      return {
        id: newId(),
        name: String(v.nome ?? "Visualização").slice(0, 60),
        type: tipo,
        ...(v.agrupar_por ? { groupBy: propId(v.agrupar_por) } : {}),
        ...(v.data ? { dateProp: propId(v.data) } : {}),
        filters: parseFiltros(v.filtros),
        sorts: ordenar.map((s) => ({ prop: propId(s.propriedade), dir: s.direcao === "desc" ? ("desc" as const) : ("asc" as const) })),
        ...(Array.isArray(v.ocultar) ? { hidden: v.ocultar.map(propId) } : {}),
        ...(Array.isArray(v.modos)
          ? { modes: (v.modos as Array<Record<string, unknown>>).map((m) => ({ id: newId(), name: String(m.nome ?? "Filtro").slice(0, 40), filters: parseFiltros(m.filtros) })) }
          : {}),
      };
    });
    if (!views.length) throw new AgentInputError("Envie ao menos uma visualização");
  }
  await updateDatabase(actor, dbPage.id, { schema, ...(views ? { views } : {}) });
  return { schema, views };
}
