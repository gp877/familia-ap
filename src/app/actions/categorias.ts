"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createCategoria(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  const kindRaw = (formData.get("kind") as string) || "expense";
  const parentId = ((formData.get("parentId") as string) || "").trim() || null;

  await db.insert(categories).values({
    householdId,
    name,
    kind: kindRaw === "income" ? "income" : "expense",
    parentId: parentId || null,
    color: ((formData.get("color") as string) || "").trim() || null,
    icon: ((formData.get("icon") as string) || "").trim() || null,
  });

  revalidatePath("/financeiro/categorias");
}

export async function updateCategoria(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Categoria não encontrada");
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  await db
    .update(categories)
    .set({
      name,
      color: ((formData.get("color") as string) || "").trim() || null,
      icon: ((formData.get("icon") as string) || "").trim() || null,
    })
    .where(eq(categories.id, id));

  revalidatePath("/financeiro/categorias");
}

/** Patch parcial (name, color, icon). */
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
  if (Object.keys(patch).length === 0) return;
  await db.update(categories).set(patch).where(eq(categories.id, id));
  revalidatePath("/financeiro/categorias");
}

export async function deleteCategoria(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Categoria não encontrada");
  }
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/financeiro/categorias");
}
