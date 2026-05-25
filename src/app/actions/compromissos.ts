"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { compromissos } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export async function createCompromisso(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const occurredOn = formData.get("occurredOn") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!occurredOn || !title) throw new Error("Data e título obrigatórios");

  const time = ((formData.get("time") as string) || "").trim() || null;
  const who = ((formData.get("who") as string) || "").trim() || null;
  const location = ((formData.get("location") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const recurring = (formData.get("recurring") as string) || "once";

  const seriesId = recurring !== "once" ? crypto.randomUUID() : null;

  // Gera as datas conforme recorrência
  const dates: string[] = [occurredOn];
  if (recurring === "weekly") {
    for (let i = 1; i < 12; i++) dates.push(addDays(occurredOn, 7 * i));
  } else if (recurring === "biweekly") {
    for (let i = 1; i < 6; i++) dates.push(addDays(occurredOn, 14 * i));
  } else if (recurring === "monthly") {
    for (let i = 1; i < 12; i++) dates.push(addMonths(occurredOn, i));
  }

  await db.insert(compromissos).values(
    dates.map((date) => ({
      householdId,
      createdById: userId,
      occurredOn: date,
      title,
      time,
      who,
      location,
      notes,
      recurringRule: recurring !== "once" ? recurring : null,
      seriesId,
    }))
  );

  revalidatePath("/compromissos");
}

export async function deleteSeries(seriesId: string) {
  const { householdId } = await requireUserAndHousehold();
  const { and } = await import("drizzle-orm");
  await db
    .delete(compromissos)
    .where(
      and(
        eq(compromissos.householdId, householdId),
        eq(compromissos.seriesId, seriesId)
      )
    );
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
