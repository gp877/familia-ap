/**
 * GET /api/agent/lixeira — o que está na Lixeira, agrupado por lote (cada
 * exclusão = um lote). Restaurar: POST /api/agent/lixeira/restaurar.
 */
import { agentRoute } from "@/lib/agent-api";
import { listTrash } from "@/lib/trash";

export const runtime = "nodejs";

const TIPO: Record<string, string> = {
  transaction: "lancamento",
  upload: "pdf",
  invoice: "fatura",
};

export const GET = agentRoute(async ({ householdId }) => {
  const items = await listTrash(householdId);
  const lotes = new Map<string, { lote_id: string; motivo: string | null; excluido_em: string; excluido_pela_ia: boolean; itens: unknown[] }>();
  for (const i of items) {
    let lote = lotes.get(i.batchId);
    if (!lote) {
      lote = {
        lote_id: i.batchId,
        motivo: i.reason,
        excluido_em: i.deletedAt.toISOString(),
        excluido_pela_ia: i.deletedVia === "agent",
        itens: [],
      };
      lotes.set(i.batchId, lote);
    }
    lote.itens.push({ item_id: i.id, tipo: TIPO[i.entityType] ?? i.entityType, id_original: i.entityId, descricao: i.label });
  }
  return { total_itens: items.length, lotes: [...lotes.values()] };
});
