"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { categoryRules, transactions, users } from "@/db/schema";
import {
  manuallyMarkInternal,
  manuallyUnmarkInternal,
} from "@/lib/internal-transfer";

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
export async function createManualTransaction(input: {
  bankAccountId: string;
  occurredOn: string; // YYYY-MM-DD
  description: string;
  amount: string; // "1234.56"
  kind: "debit" | "credit";
  categoryId?: string | null;
  notes?: string;
}) {
  const { userId, householdId } = await requireUser();
  if (!input.bankAccountId) throw new Error("Conta obrigatória");
  if (!input.description.trim()) throw new Error("Descrição obrigatória");
  if (!input.amount || isNaN(parseFloat(input.amount))) {
    throw new Error("Valor inválido");
  }

  let categoryId: string | null = input.categoryId ?? null;
  if (!categoryId) {
    const { applyAutoCategorization } = await import("@/lib/categorization");
    categoryId = await applyAutoCategorization(householdId, input.description);
  }

  const [created] = await db
    .insert(transactions)
    .values({
      householdId,
      bankAccountId: input.bankAccountId,
      uploadId: null,
      invoiceId: null,
      categoryId,
      createdById: userId,
      occurredOn: new Date(input.occurredOn),
      amount: input.amount,
      kind: input.kind,
      description: input.description.trim(),
      rawDescription: input.notes?.trim()
        ? `[manual] ${input.description.trim()} — ${input.notes.trim()}`
        : `[manual] ${input.description.trim()}`,
      status: "confirmed",
    })
    .returning();

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
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }

  if (splits.length === 0) {
    await db
      .update(transactions)
      .set({ splits: null, updatedAt: new Date() })
      .where(eq(transactions.id, transactionId));
    revalidatePath("/financeiro/transacoes");
    return;
  }

  const expected = parseFloat(tx.amount);
  const sum = splits.reduce((s, p) => s + parseFloat(p.amount), 0);
  if (Math.abs(sum - expected) > 0.01) {
    throw new Error(
      `Soma dos splits (R$ ${sum.toFixed(2)}) não bate com o total (R$ ${expected.toFixed(2)})`
    );
  }

  await db
    .update(transactions)
    .set({
      splits,
      categoryId: splits[0].categoryId, // categoria principal = primeiro split
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId));
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
