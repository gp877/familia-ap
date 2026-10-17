/**
 * Tarefas (banco "Tarefas" do espaço de trabalho do dono do token).
 *
 * GET  /api/agent/tarefas — tarefas abertas (incluir_feitas=1 traz as feitas)
 *      + a descrição das propriedades (nomes e opções válidas).
 *      Filtros: status=<nome>, area=<nome>, prazo_ate=AAAA-MM-DD, busca=<texto>
 * POST /api/agent/tarefas — cria. Corpo JSON:
 *      { "titulo": "...", "propriedades": { "Status": "A fazer", "Prazo": "2026-10-20",
 *        "Prioridade": "Alta", "Área": "Indaiá", "Origem": "WhatsApp", "Com quem": "Fulano" },
 *        "conteudo": "texto (aceita # título, - lista, [] tarefa)", "permitir_duplicado": false }
 *      Tarefa aberta com o mesmo título → 409 com o id existente.
 * PATCH /api/agent/tarefas — configura o banco por nomes (ver configureDatabase):
 *      { "adicionar_propriedades": [...], "visualizacoes": [...] } (visualizações são substituídas)
 */
import { revalidatePath } from "next/cache";

import { AgentInputError, agentJson, agentRoute, coreCall, readJson } from "@/lib/agent-api";
import { configureDatabase, describeSchema, propsFromNames, propsToNames, rowOut, textToBlocks } from "@/lib/agent-workspace";
import { createPage, getTasksDatabase, listRows, setRowProps } from "@/lib/workspace";
import type { DbSchema, PropValue } from "@/lib/workspace-model";

export const runtime = "nodejs";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function doneIds(schema: DbSchema) {
  const status = schema.properties.find((p) => p.type === "status");
  return { status, done: new Set((status?.options ?? []).filter((o) => o.group === "done").map((o) => o.id)) };
}

export const GET = agentRoute(async ({ householdId, userId, url }) => {
  const actor = { householdId, userId, via: "agent" as const };
  const dbPage = await coreCall(getTasksDatabase(actor));
  const schema = (dbPage.schema as DbSchema) ?? { properties: [] };
  const rows = await listRows(actor, dbPage.id);
  const p = url.searchParams;
  const { status, done } = doneIds(schema);
  const incluirFeitas = p.get("incluir_feitas") === "1";
  const prazoProp = schema.properties.find((x) => x.type === "date");
  const prazoAte = p.get("prazo_ate");
  const busca = p.get("busca");

  const filtered = rows
    .map((r) => ({ r, nomes: propsToNames(schema, (r.props as Record<string, PropValue>) ?? {}) }))
    .filter(({ r, nomes }) => {
      const props = (r.props as Record<string, PropValue>) ?? {};
      if (!incluirFeitas && status && done.has(String(props[status.id] ?? ""))) return false;
      for (const [k, v] of p.entries()) {
        if (["incluir_feitas", "prazo_ate", "busca"].includes(k)) continue;
        const prop = schema.properties.find((x) => norm(x.name) === norm(k) || x.id === k);
        if (!prop) continue;
        const val = nomes[prop.name];
        if (Array.isArray(val) ? !val.some((x) => norm(String(x)) === norm(v)) : norm(String(val ?? "")) !== norm(v)) return false;
      }
      if (prazoAte && prazoProp) {
        const d = props[prazoProp.id];
        if (typeof d !== "string" || d > prazoAte) return false;
      }
      if (busca && !norm(r.title).includes(norm(busca))) return false;
      return true;
    });

  return {
    banco_id: dbPage.id,
    propriedades_disponiveis: describeSchema(schema),
    total: filtered.length,
    tarefas: filtered.map(({ r }) => rowOut(schema, r)),
  };
});

export const POST = agentRoute(
  async ({ householdId, userId, req }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const body = await readJson(req);
    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    if (!titulo) throw new AgentInputError('"titulo" é obrigatório');

    const dbPage = await coreCall(getTasksDatabase(actor));
    const schema = (dbPage.schema as DbSchema) ?? { properties: [] };

    if (body.permitir_duplicado !== true) {
      const { status, done } = doneIds(schema);
      const dup = (await listRows(actor, dbPage.id)).find(
        (r) => norm(r.title) === norm(titulo) && !(status && done.has(String(((r.props as Record<string, PropValue>) ?? {})[status.id] ?? "")))
      );
      if (dup) {
        return agentJson({ erro: "Já existe uma tarefa aberta com esse título. Envie permitir_duplicado: true se for outra.", id_existente: dup.id }, 409);
      }
    }

    const props = await coreCall(propsFromNames(actor, dbPage, body.propriedades));
    const row = await coreCall(
      createPage(actor, {
        parentId: dbPage.id,
        kind: "row",
        title: titulo,
        content: typeof body.conteudo === "string" && body.conteudo.trim() ? textToBlocks(body.conteudo) : [],
      })
    );
    if (Object.keys(props).length) await coreCall(setRowProps(actor, row.id, props));
    revalidatePath("/tarefas", "layout");

    const fresh = (await listRows(actor, dbPage.id)).find((r) => r.id === row.id) ?? row;
    const freshDb = await getTasksDatabase(actor);
    return agentJson({ ok: true, ...rowOut((freshDb.schema as DbSchema) ?? schema, fresh) }, 201);
  },
  { rateLimit: 60 }
);

export const PATCH = agentRoute(
  async ({ householdId, userId, req }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const body = await readJson(req);
    const dbPage = await coreCall(getTasksDatabase(actor));
    const r = await coreCall(configureDatabase(actor, dbPage, body));
    revalidatePath("/tarefas", "layout");
    return { ok: true, propriedades_disponiveis: describeSchema(r.schema), visualizacoes: (r.views ?? []).map((v) => v.name) };
  },
  { rateLimit: 20 }
);
