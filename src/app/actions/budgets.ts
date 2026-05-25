"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function upsertBudget(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const categoryId = formData.get("categoryId") as string;
  const yearRaw = formData.get("year") as string;
  const monthRaw = formData.get("month") as string;
  const amountRaw = formData.get("plannedAmount") as string;

  if (!categoryId || !yearRaw || !amountRaw) {
    throw new Error("Categoria, ano e valor obrigatórios");
  }

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  });
  if (!cat || cat.householdId !== householdId) {
    throw new Error("Categoria não encontrada");
  }

  const year = parseInt(yearRaw, 10);
  const month = monthRaw ? parseInt(monthRaw, 10) : 0; // 0 = anual

  // upsert: tenta achar, se existe atualiza, senão insere
  const existing = await db
    .select()
    .from(budgets)
    .where(
      sql`${budgets.householdId} = ${householdId} AND ${budgets.categoryId} = ${categoryId} AND ${budgets.year} = ${year} AND ${budgets.month} = ${month}`
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(budgets)
      .set({ plannedAmount: amountRaw, updatedAt: new Date() })
      .where(eq(budgets.id, existing[0].id));
  } else {
    await db.insert(budgets).values({
      householdId,
      categoryId,
      year,
      month,
      plannedAmount: amountRaw,
    });
  }

  revalidatePath("/financeiro/orcamento");
  revalidatePath("/financeiro/dre");
}

export async function deleteBudget(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const b = await db.query.budgets.findFirst({ where: eq(budgets.id, id) });
  if (!b || b.householdId !== householdId) throw new Error("Orçamento não encontrado");
  await db.delete(budgets).where(eq(budgets.id, id));
  revalidatePath("/financeiro/orcamento");
  revalidatePath("/financeiro/dre");
}
