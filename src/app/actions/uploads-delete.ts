"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { uploads } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";
import { trashInvoiceCascade, trashStatementUpload } from "@/lib/trash";

function revalidate() {
  revalidatePath("/financeiro/documentos");
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro/lixeira");
}

/**
 * Manda pra LIXEIRA um upload (extrato bancário) e TODAS as transações
 * associadas. Útil quando houve erro de extração ou o PDF foi do mês errado.
 * O PDF no Vercel Blob fica guardado até a lixeira ser esvaziada.
 */
export async function deleteStatementUpload(uploadId: string) {
  const { userId, householdId } = await requireUserAndHousehold();

  const up = await db.query.uploads.findFirst({
    where: and(eq(uploads.id, uploadId), eq(uploads.householdId, householdId)),
  });
  if (!up) throw new Error("Upload não encontrado");
  if (up.sourceType !== "bank_statement") {
    throw new Error("Este upload não é um extrato — use deleteInvoice");
  }

  const r = await trashStatementUpload({ userId, householdId, via: "app" }, uploadId);
  revalidate();
  return { removedTransactions: r.removedTransactions };
}

/**
 * Manda pra LIXEIRA uma fatura, o(s) upload(s) vinculados e TODAS as
 * transações lançadas naquela fatura. Útil quando a fatura foi importada
 * com mês errado, ou o sistema confundiu a identificação.
 */
export async function deleteInvoiceCascade(invoiceId: string) {
  const { userId, householdId } = await requireUserAndHousehold();
  const r = await trashInvoiceCascade({ userId, householdId, via: "app" }, invoiceId);
  revalidate();
  return { removedTransactions: r.removedTransactions, removedUploads: r.removedUploads };
}
