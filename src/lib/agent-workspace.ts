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
