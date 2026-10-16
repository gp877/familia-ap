/**
 * Uma página do espaço de trabalho.
 *
 * GET    → título + conteúdo em texto (se for banco: propriedades e linhas)
 * PATCH  → { "titulo"?, "icone"?, "conteudo"?: "substitui tudo", "adicionar_texto"?: "acrescenta no fim" }
 * DELETE → Lixeira do espaço (leva junto o que estiver dentro; restaurável pelas telas)
 */
import { revalidatePath } from "next/cache";

import { agentRoute, coreCall, readJson, uuidValue } from "@/lib/agent-api";
import { blocksToText, describeSchema, rowOut, textToBlocks } from "@/lib/agent-workspace";
import { archivePage, getPage, listRows, listSubpages, updatePage } from "@/lib/workspace";
import type { Block, DbSchema } from "@/lib/workspace-model";

export const runtime = "nodejs";

export const GET = agentRoute(async ({ householdId, userId, params }) => {
  const actor = { householdId, userId, via: "agent" as const };
  const page = await coreCall(getPage(actor, uuidValue(params.id, "id")));
  const sub = await listSubpages(actor, page.id);
  const base = {
    id: page.id,
    tipo: page.kind === "database" ? "banco" : page.kind === "row" ? "linha" : "pagina",
    titulo: page.title,
    icone: page.icon,
    pai_id: page.parentId,
    conteudo: blocksToText(page.content as Block[]),
    subpaginas: sub.map((s) => ({ id: s.id, titulo: s.title, tipo: s.kind === "database" ? "banco" : "pagina" })),
    feita_pela_ia: page.createdVia === "agent",
  };
  if (page.kind !== "database") return base;
  const schema = (page.schema as DbSchema) ?? { properties: [] };
  const rows = await listRows(actor, page.id);
  return { ...base, propriedades_disponiveis: describeSchema(schema), linhas: rows.map((r) => rowOut(schema, r)) };
});

export const PATCH = agentRoute(
  async ({ householdId, userId, params, req }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const id = uuidValue(params.id, "id");
    const body = await readJson(req);
    const page = await coreCall(getPage(actor, id));
    const patch: { title?: string; icon?: string | null; content?: Block[] } = {};
    if (typeof body.titulo === "string" && body.titulo.trim()) patch.title = body.titulo.trim();
    if (typeof body.icone === "string") patch.icon = body.icone.slice(0, 16) || null;
    if (typeof body.conteudo === "string") patch.content = textToBlocks(body.conteudo);
    else if (typeof body.adicionar_texto === "string" && body.adicionar_texto.trim()) {
      patch.content = [...((page.content as Block[]) ?? []), ...textToBlocks(body.adicionar_texto)];
    }
    await coreCall(updatePage(actor, id, patch));
    revalidatePath("/tarefas", "layout");
    const fresh = await getPage(actor, id);
    return { ok: true, id, titulo: fresh.title, conteudo: blocksToText(fresh.content as Block[]) };
  },
  { rateLimit: 60 }
);

export const DELETE = agentRoute(
  async ({ householdId, userId, params }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const id = uuidValue(params.id, "id");
    const r = await coreCall(archivePage(actor, id));
    revalidatePath("/tarefas", "layout");
    return { ok: true, id, itens_na_lixeira: r.archived };
  },
  { rateLimit: 30 }
);
