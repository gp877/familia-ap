"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { invoices, transactions } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createInvoice(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const bankAccountId = formData.get("bankAccountId") as string;
  const referenceMonth = formData.get("referenceMonth") as string;
  if (!bankAccountId || !referenceMonth) {
    throw new Error("Cartão e mês de referência obrigatórios");
  }
  if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
    throw new Error("Mês deve estar no formato YYYY-MM");
  }

  await db.insert(invoices).values({
    householdId,
    bankAccountId,
    referenceMonth,
    dueDate: ((formData.get("dueDate") as string) || "").trim() || null,
    closingDate: ((formData.get("closingDate") as string) || "").trim() || null,
    totalAmount: ((formData.get("totalAmount") as string) || "").trim() || null,
    minimumAmount: ((formData.get("minimumAmount") as string) || "").trim() || null,
    status: "open",
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/financeiro/faturas");
}

export async function deleteInvoice(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.householdId !== householdId) throw new Error("Fatura não encontrada");
  await db.delete(invoices).where(eq(invoices.id, id));
  revalidatePath("/financeiro/faturas");
}

/**
 * Liga uma transação de pagamento (do extrato) a uma fatura,
 * marcando a fatura como `paid` e gravando paidByTransactionId.
 */
export async function linkInvoicePayment(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const invoiceId = formData.get("invoiceId") as string;
  const transactionId = formData.get("transactionId") as string;
  if (!invoiceId || !transactionId) throw new Error("Fatura e transação obrigatórias");

  const [inv, tx] = await Promise.all([
    db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) }),
    db.query.transactions.findFirst({ where: eq(transactions.id, transactionId) }),
  ]);
  if (!inv || inv.householdId !== householdId) throw new Error("Fatura não encontrada");
  if (!tx || tx.householdId !== householdId) throw new Error("Transação não encontrada");

  await db
    .update(invoices)
    .set({ paidByTransactionId: transactionId, status: "paid", updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  // Marca o pagamento como interno — não conta como despesa do mês
  // (a despesa real são as compras DENTRO da fatura).
  if (!tx.isInternalTransfer || !tx.internalTransferType) {
    await db
      .update(transactions)
      .set({
        isInternalTransfer: true,
        internalTransferType: "card_payment",
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));
  }

  revalidatePath(`/financeiro/faturas/${invoiceId}`);
  revalidatePath("/financeiro/faturas");
}

export async function unlinkInvoicePayment(invoiceId: string) {
  const { householdId } = await requireUserAndHousehold();
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv || inv.householdId !== householdId) throw new Error("Fatura não encontrada");
  await db
    .update(invoices)
    .set({ paidByTransactionId: null, status: "open", updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
  revalidatePath(`/financeiro/faturas/${invoiceId}`);
}

/** Form-action wrappers (Next.js 16 não aceita arrow inline com "use server" no JSX). */
export async function unlinkInvoicePaymentForm(formData: FormData) {
  const id = formData.get("invoiceId") as string;
  if (!id) return;
  await unlinkInvoicePayment(id);
}

export async function deleteInvoiceForm(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await deleteInvoice(id);
}

/**
 * Atribui transações em massa a uma fatura (quando o usuário identifica
 * que vários lançamentos pertencem àquela fatura específica).
 */
export async function assignTransactionsToInvoice(
  invoiceId: string,
  transactionIds: string[]
) {
  const { householdId } = await requireUserAndHousehold();
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv || inv.householdId !== householdId) throw new Error("Fatura não encontrada");

  for (const txId of transactionIds) {
    await db
      .update(transactions)
      .set({ invoiceId, updatedAt: new Date() })
      .where(and(eq(transactions.id, txId), eq(transactions.householdId, householdId)));
  }

  revalidatePath(`/financeiro/faturas/${invoiceId}`);
}
