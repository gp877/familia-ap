/**
 * PATCH /api/agent/transacoes/{id} — revisa um lançamento com as mesmas
 * regras da tela de Transações. Corpo JSON (todos opcionais, ao menos um):
 *
 *   categoria_id   uuid ou null (null = descategoriza e volta pra pendente).
 *                  Categorizar também CONFIRMA o lançamento.
 *   criar_regra    true = cria regra pra próximos PDFs e aplica nos
 *                  lançamentos parecidos ainda sem categoria (como na tela)
 *   status         pendente | confirmada | ignorada
 *   divisoes       [{ categoria_id, valor, nota? }] — soma = valor do
 *                  lançamento; [] remove a divisão
 *
 * DELETE /api/agent/transacoes/{id} — manda pra Lixeira (restaurável em
 * /api/agent/lixeira). Esvaziar a lixeira só pelas telas do app.
 */
import { revalidatePath } from "next/cache";

import {
  AgentInputError,
  AgentNotFoundError,
  agentRoute,
  coreCall,
  moneyValue,
  readJson,
  uuidValue,
} from "@/lib/agent-api";
import { trashEntities } from "@/lib/trash";
import {
  setTransactionCategoryCore,
  setTransactionSplitsCore,
  setTransactionStatusCore,
} from "@/lib/transactions-core";

export const runtime = "nodejs";

const STATUS: Record<string, "pending" | "confirmed" | "ignored"> = {
  pendente: "pending",
  confirmada: "confirmed",
  ignorada: "ignored",
};

export const PATCH = agentRoute(
  async ({ householdId, userId, req, params }) => {
    const actor = { householdId, userId, via: "agent" as const };
    const id = uuidValue(params.id, "id");
    const body = await readJson(req);

    const hasCategory = "categoria_id" in body;
    const hasStatus = "status" in body;
    const hasSplits = "divisoes" in body;
    if (!hasCategory && !hasStatus && !hasSplits) {
      throw new AgentInputError('Envie ao menos um de: categoria_id, status, divisoes');
    }

    // Valida tudo ANTES de gravar qualquer coisa
    const categoryId =
      hasCategory && body.categoria_id !== null ? uuidValue(body.categoria_id, "categoria_id") : null;
    const status = hasStatus ? STATUS[String(body.status)] : undefined;
    if (hasStatus && !status) {
      throw new AgentInputError('"status" deve ser pendente, confirmada ou ignorada');
    }
    let splits: Array<{ categoryId: string; amount: string; note?: string }> | undefined;
    if (hasSplits) {
      if (!Array.isArray(body.divisoes)) throw new AgentInputError('"divisoes" deve ser uma lista');
      splits = body.divisoes.map((d, i) => {
        const item = (d ?? {}) as Record<string, unknown>;
        return {
          categoryId: uuidValue(item.categoria_id, `divisoes[${i}].categoria_id`),
          amount: moneyValue(item.valor, `divisoes[${i}].valor`),
          ...(typeof item.nota === "string" ? { note: item.nota.slice(0, 200) } : {}),
        };
      });
    }

    const result: Record<string, unknown> = { ok: true, id };
    if (hasCategory) {
      const r = await coreCall(
        setTransactionCategoryCore(actor, id, categoryId, body.criar_regra === true)
      );
      result.categoria_id = categoryId;
      result.regra_criada = r.ruleCreated;
      result.aplicada_em_outros = r.appliedToOthers;
    }
    if (splits) {
      await coreCall(setTransactionSplitsCore(actor, id, splits));
      result.divisoes = splits.length;
    }
    if (status) {
      await coreCall(setTransactionStatusCore(actor, id, status));
      result.status = body.status;
    }

    revalidatePath("/financeiro/transacoes");
    revalidatePath("/financeiro");
    return result;
  },
  { rateLimit: 120 }
);

export const DELETE = agentRoute(
  async ({ householdId, userId, params }) => {
    const id = uuidValue(params.id, "id");
    const r = await trashEntities(
      { householdId, userId, via: "agent" },
      { transaction: [id] },
      "Excluída pelo assistente de IA"
    );
    if (!r.counts.transaction) throw new AgentNotFoundError("Transação não encontrada");
    revalidatePath("/financeiro/transacoes");
    revalidatePath("/financeiro/lixeira");
    return { ok: true, id, lote_lixeira: r.batchId };
  },
  { rateLimit: 30 }
);
