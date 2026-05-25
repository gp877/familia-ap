"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { finsDeSemana } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createFimDeSemana(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const weekendDate = formData.get("weekendDate") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!weekendDate || !title) throw new Error("Data e título obrigatórios");

  await db.insert(finsDeSemana).values({
    householdId,
    createdById: userId,
    weekendDate,
    title,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/finais-de-semana");
}

export async function updateFimDeSemana(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.finsDeSemana.findFirst({
    where: eq(finsDeSemana.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Fim de semana não encontrado");
  }

  const weekendDate = formData.get("weekendDate") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!weekendDate || !title) throw new Error("Data e título obrigatórios");

  await db
    .update(finsDeSemana)
    .set({
      weekendDate,
      title,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    })
    .where(eq(finsDeSemana.id, id));

  revalidatePath("/finais-de-semana");
}

export async function deleteFimDeSemana(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.finsDeSemana.findFirst({
    where: eq(finsDeSemana.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Fim de semana não encontrado");
  }
  await db.delete(finsDeSemana).where(eq(finsDeSemana.id, id));
  revalidatePath("/finais-de-semana");
}
