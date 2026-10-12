"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import {
  manuallyMarkInternal,
  manuallyUnmarkInternal,
} from "@/lib/internal-transfer";
import {
  createManualTransactionCore,
  setTransactionCategoryCore,
  setTransactionSplitsCore,
  setTransactionStatusCore,
} from "@/lib/transactions-core";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

export async function setTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  createRule: boolean
): Promise<{ ruleCreated: boolean; appliedToOthers: number }> {
  const result = await setTransactionCategoryCore(await requireUser(), transactionId, categoryId, createRule);
  revalidatePath("/financeiro/transacoes");
  return result;
}

/**
 * Marca transação como interna manualmente (override do detector automático).
 * Se pairId informado, pareia ambas. Se não, marca solo (sem par).
 */
export async function markAsInternalManually(
  transactionId: string,
  pairId: string | null
) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  if (pairId) {
    const pair = await db.query.transactions.findFirst({
      where: eq(transactions.id, pairId),
    });
    if (!pair || pair.householdId !== householdId) {
      throw new Error("Par não encontrado");
    }
  }
  await manuallyMarkInternal(transactionId, pairId);
  revalidatePath("/financeiro/transacoes");
  revalidatePath(`/financeiro/faturas`);
}

/**
 * Desfaz a marcação de interna manualmente. Se havia par, desfaz ambas.
 * Marca como tocada manualmente pro auto-detector não re-marcar em re-runs.
 */
export async function unmarkAsInternalManually(transactionId: string) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await manuallyUnmarkInternal(transactionId);
  revalidatePath("/financeiro/transacoes");
  revalidatePath(`/financeiro/faturas`);
}

/**
 * Cria uma transação manualmente (sem upload de PDF). Usada quando o usuário
 * nota uma linha faltante. Aplica auto-categorização das regras se nenhuma cat
 * for informada.
 */
export async function createManualTransaction(
  input: Parameters<typeof createManualTransactionCore>[1]
) {
  const created = await createManualTransactionCore(await requireUser(), input);
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro");
  return created;
}

/**
 * Define os splits de categoria de uma transação. Valida que a sum bate com
 * o valor (tolerância 1 centavo). Splits vazios → remove split (volta a
 * usar só a categoria principal). Mantém categoryId apontando pra primeira
 * categoria do split (pra retrocompatibilidade com listagens simples).
 */
export async function setTransactionSplits(
  transactionId: string,
  splits: Array<{ categoryId: string; amount: string; note?: string }>
) {
  await setTransactionSplitsCore(await requireUser(), transactionId, splits);
  revalidatePath("/financeiro/transacoes");
}

export async function setTransactionStatus(
  transactionId: string,
  status: "pending" | "confirmed" | "ignored"
) {
  await setTransactionStatusCore(await requireUser(), transactionId, status);
  revalidatePath("/financeiro/transacoes");
}

export async function deleteTransaction(transactionId: string) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await db.delete(transactions).where(eq(transactions.id, transactionId));
  revalidatePath("/financeiro/transacoes");
}
