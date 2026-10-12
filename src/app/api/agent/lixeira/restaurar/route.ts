/**
 * POST /api/agent/lixeira/restaurar — corpo JSON { "lote_id": "<id>" } ou
 * { "item_ids": ["<id>", …] }. Devolve o que voltou e o que não pôde voltar
 * (com o motivo — ex.: o mesmo lançamento já foi importado de novo).
 */
import { revalidatePath } from "next/cache";

import { AgentInputError, agentRoute, coreCall, readJson, uuidValue } from "@/lib/agent-api";
import { restoreFromTrash } from "@/lib/trash";

export const runtime = "nodejs";

export const POST = agentRoute(
  async ({ householdId, req }) => {
    const body = await readJson(req);
    let sel: { itemIds?: string[]; batchId?: string };
    if (body.lote_id != null) {
      sel = { batchId: uuidValue(body.lote_id, "lote_id") };
    } else if (Array.isArray(body.item_ids) && body.item_ids.length) {
      sel = { itemIds: body.item_ids.map((v, i) => uuidValue(v, `item_ids[${i}]`)) };
    } else {
      throw new AgentInputError('Envie "lote_id" ou "item_ids"');
    }

    const r = await coreCall(restoreFromTrash(householdId, sel));
    revalidatePath("/financeiro", "layout");
    return {
      ok: r.skipped.length === 0,
      restaurados: r.restored.map((x) => x.label),
      nao_restaurados: r.skipped.map((x) => ({ item_id: x.id, descricao: x.label, motivo: x.motivo })),
    };
  },
  { rateLimit: 30 }
);
