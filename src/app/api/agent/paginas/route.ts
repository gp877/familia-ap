/**
 * Páginas do espaço de trabalho (anotações, fichas de contatos, atas…).
 *
 * GET  /api/agent/paginas — árvore de páginas e bancos (sem as linhas dos bancos)
 * POST /api/agent/paginas — cria página: { "titulo", "pai_id"?, "conteudo"?: texto, "icone"?: emoji, "tipo"?: "pagina"|"banco" }
 *      "banco" cria um banco de dados vazio (configure com PATCH /api/agent/tarefas + banco_id).
 *      Texto aceita # título, ## subtítulo, - lista, 1. numerada, [] tarefa, > citação, --- divisória.
 */
import { revalidatePath } from "next/cache";

import { AgentInputError, agentJson, agentRoute, coreCall, readJson, uuidValue } from "@/lib/agent-api";
import { textToBlocks } from "@/lib/agent-workspace";
import { createPage, ensureWorkspace, listTree } from "@/lib/workspace";

export const runtime = "nodejs";

export const GET = agentRoute(async ({ householdId, userId }) => {
  const actor = { householdId, userId, via: "agent" as const };
  await ensureWorkspace(actor);
  const tree = await listTree(actor);
  return {
    paginas: tree.map((p) => ({
      id: p.id,
      pai_id: p.parentId,
      tipo: p.kind === "database" ? "banco" : "pagina",
      titulo: p.title || "Sem título",
      icone: p.icon,
      compartilhada: p.visibility === "household",
    })),
  };
});

export const POST = agentRoute(
  async ({ householdId, userId, req }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const body = await readJson(req);
    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    if (!titulo) throw new AgentInputError('"titulo" é obrigatório');
    await ensureWorkspace(actor);
    const page = await coreCall(
      createPage(actor, {
        parentId: body.pai_id == null ? null : uuidValue(body.pai_id, "pai_id"),
        kind: body.tipo === "banco" ? "database" : "page",
        title: titulo,
        icon: typeof body.icone === "string" ? body.icone.slice(0, 16) : null,
        content: typeof body.conteudo === "string" ? textToBlocks(body.conteudo) : [],
      })
    );
    revalidatePath("/tarefas", "layout");
    return agentJson({ ok: true, id: page.id, titulo: page.title, link: `/tarefas/${page.id}` }, 201);
  },
  { rateLimit: 30 }
);
