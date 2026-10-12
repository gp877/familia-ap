/**
 * DELETE /api/agent/uploads/{id} — manda pra Lixeira um PDF enviado e os
 * lançamentos dele, igual ao botão Excluir de Documentos: extrato leva o
 * upload + lançamentos; fatura leva a fatura inteira (PDFs + lançamentos).
 * Restaurável em /api/agent/lixeira.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { uploads } from "@/db/schema";
import { AgentNotFoundError, agentRoute, coreCall, uuidValue } from "@/lib/agent-api";
import { trashInvoiceCascade, trashStatementUpload } from "@/lib/trash";

export const runtime = "nodejs";

export const DELETE = agentRoute(
  async ({ householdId, userId, params }) => {
    const id = uuidValue(params.id, "id");
    const up = await db.query.uploads.findFirst({
      columns: { id: true, invoiceId: true },
      where: and(eq(uploads.id, id), eq(uploads.householdId, householdId)),
    });
    if (!up) throw new AgentNotFoundError("Upload não encontrado");

    const actor = { householdId, userId, via: "agent" as const };
    const r = up.invoiceId
      ? await coreCall(trashInvoiceCascade(actor, up.invoiceId))
      : await coreCall(trashStatementUpload(actor, id));

    revalidatePath("/financeiro/documentos");
    revalidatePath("/financeiro/transacoes");
    revalidatePath("/financeiro/lixeira");
    return {
      ok: true,
      id,
      escopo: up.invoiceId ? "fatura inteira" : "extrato",
      lancamentos_na_lixeira: r.removedTransactions,
      lote_lixeira: r.batchId,
    };
  },
  { rateLimit: 10 }
);
