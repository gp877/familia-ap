"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { categoryRules, transactions, users } from "@/db/schema";

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
) {
  const { householdId } = await requireUser();

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }

  await db
    .update(transactions)
    .set({ categoryId, updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));

  // Se categoryId informado E createRule, cria uma regra "contains" pra futuras
  if (categoryId && createRule) {
    const existing = await db.query.categoryRules.findFirst({
      where: eq(categoryRules.pattern, tx.description),
    });
    if (!existing) {
      await db.insert(categoryRules).values({
        householdId,
        categoryId,
        pattern: tx.description,
        matchType: "contains",
      });
    }
  }

  revalidatePath("/financeiro/transacoes");
}

export async function setTransactionStatus(
  transactionId: string,
  status: "pending" | "confirmed" | "ignored"
) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await db
    .update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));
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
