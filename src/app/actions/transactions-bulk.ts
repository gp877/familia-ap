"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, categoryRules, transactions } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

/**
 * Aplica uma categoria a múltiplas transações de uma vez.
 * Opcionalmente cria regra `contains` por descrição pra cada uma.
 */
export async function bulkSetCategory(
  transactionIds: string[],
  categoryId: string | null,
  createRules: boolean
) {
  const { householdId } = await requireUserAndHousehold();
  if (transactionIds.length === 0) return;

  if (categoryId) {
    const cat = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
    });
    if (!cat || cat.householdId !== householdId) {
      throw new Error("Categoria não encontrada");
    }
  }

  await db
    .update(transactions)
    .set({ categoryId, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, transactionIds),
        eq(transactions.householdId, householdId)
      )
    );

  if (categoryId && createRules) {
    // Cria regra `contains` pra cada descrição única (skip se já existe)
    const txs = await db.query.transactions.findMany({
      where: and(
        inArray(transactions.id, transactionIds),
        eq(transactions.householdId, householdId)
      ),
    });
    const uniqueDescs = [...new Set(txs.map((t) => t.description))];
    for (const desc of uniqueDescs) {
      const existing = await db.query.categoryRules.findFirst({
        where: and(
          eq(categoryRules.householdId, householdId),
          eq(categoryRules.pattern, desc)
        ),
      });
      if (!existing) {
        await db.insert(categoryRules).values({
          householdId,
          categoryId,
          pattern: desc,
          matchType: "contains",
        });
      }
    }
  }

  revalidatePath("/financeiro/transacoes");
}

export async function bulkSetStatus(
  transactionIds: string[],
  status: "pending" | "confirmed" | "ignored"
) {
  const { householdId } = await requireUserAndHousehold();
  if (transactionIds.length === 0) return;

  await db
    .update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, transactionIds),
        eq(transactions.householdId, householdId)
      )
    );

  revalidatePath("/financeiro/transacoes");
}

export async function bulkDelete(transactionIds: string[]) {
  const { householdId } = await requireUserAndHousehold();
  if (transactionIds.length === 0) return;
  await db
    .delete(transactions)
    .where(
      and(
        inArray(transactions.id, transactionIds),
        eq(transactions.householdId, householdId)
      )
    );
  revalidatePath("/financeiro/transacoes");
}
