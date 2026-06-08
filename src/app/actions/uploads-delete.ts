"use server";

import { del } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { invoices, transactions, uploads, users } from "@/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

/**
 * Apaga um upload (extrato bancário) e TODAS as transações associadas.
 * Útil quando houve erro de extração ou o PDF foi do mês errado.
 * Também tenta apagar o blob do Vercel Blob (se houver URL válida).
 */
export async function deleteStatementUpload(uploadId: string) {
  const { householdId } = await requireUser();

  const up = await db.query.uploads.findFirst({
    where: and(eq(uploads.id, uploadId), eq(uploads.householdId, householdId)),
  });
  if (!up) throw new Error("Upload não encontrado");
  if (up.sourceType !== "bank_statement") {
    throw new Error("Este upload não é um extrato — use deleteInvoice");
  }

  // 1) Deleta transações vinculadas ao upload (FK é set null por default)
  const removed = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.uploadId, uploadId)
      )
    )
    .returning({ id: transactions.id });

  // 2) Tenta apagar o blob no Vercel Blob — falha silenciosa se não der
  //    (URLs vazias dos seeds manuais ou já removidas)
  if (up.blobUrl && up.blobUrl.startsWith("http")) {
    try {
      await del(up.blobUrl);
    } catch (err) {
      console.warn("[deleteStatementUpload] del do blob falhou:", err);
    }
  }

  // 3) Apaga o upload
  await db.delete(uploads).where(eq(uploads.id, uploadId));

  revalidatePath("/financeiro/extratos");
  revalidatePath("/financeiro/transacoes");

  return { removedTransactions: removed.length };
}

/**
 * Apaga uma fatura, o(s) upload(s) vinculados e TODAS as transações
 * lançadas naquela fatura. Útil quando a fatura foi importada com
 * mês errado, ou o sistema confundiu a identificação.
 */
export async function deleteInvoiceCascade(invoiceId: string) {
  const { householdId } = await requireUser();

  const inv = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.householdId, householdId)),
  });
  if (!inv) throw new Error("Fatura não encontrada");

  // 1) Deleta transações da fatura
  const removed = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.invoiceId, invoiceId)
      )
    )
    .returning({ id: transactions.id });

  // 2) Apaga upload(s) que apontam pra essa fatura — geralmente 1 só
  const linkedUploads = await db.query.uploads.findMany({
    where: and(eq(uploads.householdId, householdId), eq(uploads.invoiceId, invoiceId)),
  });

  for (const up of linkedUploads) {
    if (up.blobUrl && up.blobUrl.startsWith("http")) {
      try {
        await del(up.blobUrl);
      } catch (err) {
        console.warn("[deleteInvoiceCascade] del do blob falhou:", err);
      }
    }
    await db.delete(uploads).where(eq(uploads.id, up.id));
  }

  // 3) Apaga a fatura
  await db.delete(invoices).where(eq(invoices.id, invoiceId));

  revalidatePath("/financeiro/faturas");
  revalidatePath("/financeiro/transacoes");

  return { removedTransactions: removed.length, removedUploads: linkedUploads.length };
}
