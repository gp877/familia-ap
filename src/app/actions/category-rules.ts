"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { categoryRules, users } from "@/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

export async function updateCategoryRule(
  ruleId: string,
  patch: {
    pattern?: string;
    matchType?: "exact" | "prefix" | "contains" | "regex";
    categoryId?: string;
    isActive?: boolean;
  }
) {
  const { householdId } = await requireUser();
  const rule = await db.query.categoryRules.findFirst({
    where: eq(categoryRules.id, ruleId),
  });
  if (!rule || rule.householdId !== householdId) {
    throw new Error("Regra não encontrada");
  }
  await db
    .update(categoryRules)
    .set({
      ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
      ...(patch.matchType !== undefined ? { matchType: patch.matchType } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    })
    .where(eq(categoryRules.id, ruleId));
  revalidatePath("/financeiro/categorias/regras");
}

export async function deleteCategoryRule(ruleId: string) {
  const { householdId } = await requireUser();
  await db
    .delete(categoryRules)
    .where(
      and(eq(categoryRules.id, ruleId), eq(categoryRules.householdId, householdId))
    );
  revalidatePath("/financeiro/categorias/regras");
}

/** Form-action variant */
export async function deleteCategoryRuleForm(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await deleteCategoryRule(id);
}
