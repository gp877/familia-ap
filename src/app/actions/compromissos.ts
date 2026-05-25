"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { compromissos } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createCompromisso(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const occurredOn = formData.get("occurredOn") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!occurredOn || !title) throw new Error("Data e título obrigatórios");

  const time = ((formData.get("time") as string) || "").trim() || null;
  const who = ((formData.get("who") as string) || "").trim() || null;
  const location = ((formData.get("location") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  await db.insert(compromissos).values({
    householdId,
    createdById: userId,
    occurredOn,
    title,
    time,
    who,
    location,
    notes,
  });

  revalidatePath("/compromissos");
}

export async function updateCompromisso(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.compromissos.findFirst({
    where: eq(compromissos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Compromisso não encontrado");
  }

  const occurredOn = formData.get("occurredOn") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!occurredOn || !title) throw new Error("Data e título obrigatórios");

  await db
    .update(compromissos)
    .set({
      occurredOn,
      title,
      time: ((formData.get("time") as string) || "").trim() || null,
      who: ((formData.get("who") as string) || "").trim() || null,
      location: ((formData.get("location") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    })
    .where(eq(compromissos.id, id));

  revalidatePath("/compromissos");
}

export async function deleteCompromisso(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.compromissos.findFirst({
    where: eq(compromissos.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Compromisso não encontrado");
  }
  await db.delete(compromissos).where(eq(compromissos.id, id));
  revalidatePath("/compromissos");
}
