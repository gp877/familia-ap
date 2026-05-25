"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { aniversarios, presentes } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

function parseMonthDay(input: string): string {
  // aceita "MM-DD" ou "YYYY-MM-DD" e devolve "MM-DD"
  const m = input.trim();
  if (/^\d{2}-\d{2}$/.test(m)) return m;
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return m.slice(5);
  throw new Error("Data inválida (use MM-DD ou YYYY-MM-DD)");
}

export async function createAniversario(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  const monthDayRaw = formData.get("monthDay") as string;
  if (!name || !monthDayRaw) throw new Error("Nome e data obrigatórios");

  const birthYearRaw = (formData.get("birthYear") as string)?.trim();
  const birthYear = birthYearRaw ? parseInt(birthYearRaw, 10) : null;

  await db.insert(aniversarios).values({
    householdId,
    createdById: userId,
    name,
    monthDay: parseMonthDay(monthDayRaw),
    birthYear: birthYear || null,
    relation: ((formData.get("relation") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/aniversarios");
}

export async function updateAniversario(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.aniversarios.findFirst({
    where: eq(aniversarios.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Aniversário não encontrado");
  }

  const name = (formData.get("name") as string)?.trim();
  const monthDayRaw = formData.get("monthDay") as string;
  if (!name || !monthDayRaw) throw new Error("Nome e data obrigatórios");

  const birthYearRaw = (formData.get("birthYear") as string)?.trim();

  await db
    .update(aniversarios)
    .set({
      name,
      monthDay: parseMonthDay(monthDayRaw),
      birthYear: birthYearRaw ? parseInt(birthYearRaw, 10) || null : null,
      relation: ((formData.get("relation") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    })
    .where(eq(aniversarios.id, id));

  revalidatePath("/aniversarios");
}

export async function deleteAniversario(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.aniversarios.findFirst({
    where: eq(aniversarios.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Aniversário não encontrado");
  }
  await db.delete(aniversarios).where(eq(aniversarios.id, id));
  revalidatePath("/aniversarios");
}

export async function addPresente(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const aniversarioId = formData.get("aniversarioId") as string;
  const yearRaw = formData.get("year") as string;
  const description = (formData.get("description") as string)?.trim();
  if (!aniversarioId || !yearRaw || !description) {
    throw new Error("Aniversário, ano e descrição obrigatórios");
  }

  const aniv = await db.query.aniversarios.findFirst({
    where: eq(aniversarios.id, aniversarioId),
  });
  if (!aniv || aniv.householdId !== householdId) {
    throw new Error("Aniversário não encontrado");
  }

  await db.insert(presentes).values({
    aniversarioId,
    year: parseInt(yearRaw, 10),
    description,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/aniversarios");
}

export async function deletePresente(presenteId: string) {
  const { householdId } = await requireUserAndHousehold();
  const present = await db.query.presentes.findFirst({
    where: eq(presentes.id, presenteId),
    with: { aniversario: true },
  });
  if (!present || present.aniversario.householdId !== householdId) {
    throw new Error("Presente não encontrado");
  }
  await db.delete(presentes).where(eq(presentes.id, presenteId));
  revalidatePath("/aniversarios");
}
