/**
 * Uma tarefa (ou qualquer linha de banco do espaço de trabalho).
 *
 * GET    → propriedades + conteúdo em texto
 * PATCH  → { "titulo"?, "propriedades"?: { "Nome": valor }, "adicionar_texto"?: "...", "conteudo"?: "substitui tudo" }
 * DELETE → manda pra Lixeira do espaço (restaurável pelas telas)
 */
import { revalidatePath } from "next/cache";

import { AgentInputError, agentRoute, coreCall, readJson, uuidValue } from "@/lib/agent-api";
import { blocksToText, propsFromNames, rowOut, textToBlocks } from "@/lib/agent-workspace";
import { archivePage, getPage, setRowProps, updatePage } from "@/lib/workspace";
import type { Block, DbSchema } from "@/lib/workspace-model";

export const runtime = "nodejs";

async function load(actor: { householdId: string; userId: string; via: "agent" }, id: string) {
  const row = await coreCall(getPage(actor, id));
  if (row.kind !== "row" || !row.parentId) throw new AgentInputError("Esse id não é uma tarefa/linha de banco (use /api/agent/paginas)");
  const dbPage = await coreCall(getPage(actor, row.parentId));
  return { row, dbPage, schema: (dbPage.schema as DbSchema) ?? { properties: [] } };
}

export const GET = agentRoute(async ({ householdId, userId, params }) => {
  const actor = { householdId, userId, via: "agent" as const };
  const { row, dbPage, schema } = await load(actor, uuidValue(params.id, "id"));
  return { ...rowOut(schema, row), banco: { id: dbPage.id, titulo: dbPage.title }, conteudo: blocksToText(row.content as Block[]) };
});

export const PATCH = agentRoute(
  async ({ householdId, userId, params, req }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const id = uuidValue(params.id, "id");
    const body = await readJson(req);
    const { row, dbPage } = await load(actor, id);

    if (body.propriedades != null) {
      const props = await coreCall(propsFromNames(actor, dbPage, body.propriedades));
      await coreCall(setRowProps(actor, id, props));
    }
    const patch: { title?: string; content?: Block[] } = {};
    if (typeof body.titulo === "string" && body.titulo.trim()) patch.title = body.titulo.trim();
    if (typeof body.conteudo === "string") patch.content = textToBlocks(body.conteudo);
    else if (typeof body.adicionar_texto === "string" && body.adicionar_texto.trim()) {
      patch.content = [...((row.content as Block[]) ?? []), ...textToBlocks(body.adicionar_texto)];
    }
    if (Object.keys(patch).length) await coreCall(updatePage(actor, id, patch));
    revalidatePath("/tarefas", "layout");

    const fresh = await load(actor, id);
    return { ok: true, ...rowOut(fresh.schema, fresh.row), conteudo: blocksToText(fresh.row.content as Block[]) };
  },
  { rateLimit: 60 }
);

export const DELETE = agentRoute(
  async ({ householdId, userId, params }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const id = uuidValue(params.id, "id");
    await load(actor, id);
    await coreCall(archivePage(actor, id));
    revalidatePath("/tarefas", "layout");
    return { ok: true, id, lixeira: "Restaurável em Tarefas › Lixeira" };
  },
  { rateLimit: 30 }
);
