"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { sonhos } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createSonho(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Título obrigatório");

  await db.insert(sonhos).values({
    householdId,
    createdById: userId,
    title,
    description: ((formData.get("description") as string) || "").trim() || null,
    imageUrl: ((formData.get("imageUrl") as string) || "").trim() || null,
    status: "active",
  });

  revalidatePath("/sonhos");
  revalidatePath("/");
}

export async function updateSonho(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.sonhos.findFirst({
    where: eq(sonhos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Sonho não encontrado");
  }

  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Título obrigatório");

  await db
    .update(sonhos)
    .set({
      title,
      description: ((formData.get("description") as string) || "").trim() || null,
      imageUrl: ((formData.get("imageUrl") as string) || "").trim() || null,
    })
    .where(eq(sonhos.id, id));

  revalidatePath("/sonhos");
  revalidatePath("/");
}

export async function markSonhoRealized(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.sonhos.findFirst({
    where: eq(sonhos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Sonho não encontrado");
  }
  await db
    .update(sonhos)
    .set({
      status: "realized",
      realizedDate: new Date().toISOString().slice(0, 10),
    })
    .where(eq(sonhos.id, id));
  revalidatePath("/sonhos");
}

export async function reopenSonho(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.sonhos.findFirst({
    where: eq(sonhos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Sonho não encontrado");
  }
  await db
    .update(sonhos)
    .set({ status: "active", realizedDate: null })
    .where(eq(sonhos.id, id));
  revalidatePath("/sonhos");
}

/** Patch genérico (title/description/imageUrl) */
export async function patchSonho(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.sonhos.findFirst({ where: eq(sonhos.id, id) });
  if (!existing || existing.householdId !== householdId) return;
  const patch: Record<string, string | null> = {};
  for (const key of ["title", "description", "imageUrl"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "title" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(sonhos).set(patch).where(eq(sonhos.id, id));
  revalidatePath("/sonhos");
}

/** Toggle entre active/realized */
export async function toggleSonhoStatus(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.sonhos.findFirst({ where: eq(sonhos.id, id) });
  if (!existing || existing.householdId !== householdId) return;
  if (existing.status === "active") {
    await db
      .update(sonhos)
      .set({ status: "realized", realizedDate: new Date().toISOString().slice(0, 10) })
      .where(eq(sonhos.id, id));
  } else {
    await db
      .update(sonhos)
      .set({ status: "active", realizedDate: null })
      .where(eq(sonhos.id, id));
  }
  revalidatePath("/sonhos");
}

export async function deleteSonho(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.sonhos.findFirst({
    where: eq(sonhos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Sonho não encontrado");
  }
  await db.delete(sonhos).where(eq(sonhos.id, id));
  revalidatePath("/sonhos");
  revalidatePath("/");
}
