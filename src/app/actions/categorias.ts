"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createCategoria(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  const kindRaw = (formData.get("kind") as string) || "expense";
  const parentId = ((formData.get("parentId") as string) || "").trim() || null;
  const color = ((formData.get("color") as string) || "").trim() || null;

  // sortOrder = MAX existente +1 nesse grupo (kind+parent)
  const max = await db
    .select({ m: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.kind, kindRaw === "income" ? "income" : "expense"),
        parentId
          ? eq(categories.parentId, parentId)
          : sql`${categories.parentId} IS NULL`
      )
    )
    .then((r) => r[0]?.m ?? 0);

  await db.insert(categories).values({
    householdId,
    name,
    kind: kindRaw === "income" ? "income" : "expense",
    parentId,
    color,
    icon: ((formData.get("icon") as string) || "").trim() || null,
    sortOrder: max + 1,
  });

  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/orcamento");
}

/** Patch parcial (name, color, icon, parentId). */
export async function patchCategoria(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  for (const key of ["name", "color", "icon"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "name" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (formData.has("parentId")) {
    const v = ((formData.get("parentId") as string) || "").trim();
    // Não permite virar filha de si mesma
    if (v && v !== id) patch.parentId = v;
    else if (!v) patch.parentId = null;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(categories).set(patch).where(eq(categories.id, id));
  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/orcamento");
}

/**
 * Reordena categorias num grupo (mesmo kind+parent). Recebe a lista de IDs
 * na ordem desejada e atualiza `sortOrder` 1..N.
 */
export async function reorderCategorias(orderedIds: string[]) {
  const { householdId } = await requireUserAndHousehold();
  if (orderedIds.length === 0) return;

  const owned = await db.query.categories.findMany({
    where: and(
      eq(categories.householdId, householdId),
      inArray(categories.id, orderedIds)
    ),
  });
  const ownedIds = new Set(owned.map((c) => c.id));

  // Atualiza em batch — uma query por id pra simplificar (lista é curta)
  await Promise.all(
    orderedIds
      .filter((id) => ownedIds.has(id))
      .map((id, idx) =>
        db
          .update(categories)
          .set({ sortOrder: idx + 1 })
          .where(eq(categories.id, id))
      )
  );

  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/transacoes");
}

/**
 * Exclui uma categoria. Se `replaceWithId` for fornecido, move TODOS os
 * lançamentos (e subcategorias, se for principal) pra essa categoria
 * antes de apagar. Se for null, lançamentos ficam sem categoria.
 */
export async function deleteCategoriaWithMerge(id: string, replaceWithId: string | null) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Categoria não encontrada");
  }

  // Valida a categoria de destino
  if (replaceWithId) {
    if (replaceWithId === id) throw new Error("Categoria destino inválida");
    const target = await db.query.categories.findFirst({
      where: eq(categories.id, replaceWithId),
    });
    if (!target || target.householdId !== householdId) {
      throw new Error("Categoria destino não encontrada");
    }
  }

  // Move transações
  if (replaceWithId) {
    await db
      .update(transactions)
      .set({ categoryId: replaceWithId })
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.categoryId, id)
        )
      );
  } else {
    await db
      .update(transactions)
      .set({ categoryId: null })
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.categoryId, id)
        )
      );
  }

  // Move subcategorias filhas
  await db
    .update(categories)
    .set({ parentId: replaceWithId ?? null })
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.parentId, id)
      )
    );

  // Apaga
  await db.delete(categories).where(eq(categories.id, id));

  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/orcamento");
}

/** @deprecated use deleteCategoriaWithMerge (mantido pra compat). */
export async function deleteCategoria(id: string) {
  await deleteCategoriaWithMerge(id, null);
}

/** @deprecated use patchCategoria. */
export async function updateCategoria(formData: FormData) {
  return patchCategoria(formData);
}

/** Adapter pro SortableList que envia FormData com `order` JSON. */
export async function reorderCategoriasForm(formData: FormData) {
  const raw = formData.get("order") as string;
  if (!raw) return;
  try {
    const ids = JSON.parse(raw) as string[];
    if (Array.isArray(ids)) await reorderCategorias(ids);
  } catch {
    // ignora payload inválido
  }
}
