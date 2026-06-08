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

/**
 * Resolve campos de nascimento a partir do form. Aceita:
 *   - `birthDate` (YYYY-MM-DD) → extrai monthDay + birthYear
 *   - `monthDay` (legado) + `birthYear` separados
 *
 * Retorna `null` em monthDay quando o form não tinha nenhum dos dois.
 * Retorna birthYear=null quando vier só MM-DD ou birthYear vazio.
 */
function readBirthFields(formData: FormData): {
  monthDay: string | null;
  birthYear: number | null;
} {
  const birthDateRaw = (formData.get("birthDate") as string | null)?.trim();
  if (birthDateRaw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw)) {
      return {
        monthDay: birthDateRaw.slice(5),
        birthYear: parseInt(birthDateRaw.slice(0, 4), 10),
      };
    }
    // ano omitido (formato MM-DD ou --MM-DD)
    if (/^-?-?\d{2}-\d{2}$/.test(birthDateRaw)) {
      return {
        monthDay: birthDateRaw.replace(/^-+/, ""),
        birthYear: null,
      };
    }
  }
  const monthDayRaw = (formData.get("monthDay") as string | null)?.trim();
  const birthYearRaw = (formData.get("birthYear") as string | null)?.trim();
  return {
    monthDay: monthDayRaw ? parseMonthDay(monthDayRaw) : null,
    birthYear: birthYearRaw ? parseInt(birthYearRaw, 10) || null : null,
  };
}

export async function createAniversario(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  const { monthDay, birthYear } = readBirthFields(formData);
  if (!monthDay) throw new Error("Data de nascimento obrigatória");

  await db.insert(aniversarios).values({
    householdId,
    createdById: userId,
    name,
    monthDay,
    birthYear,
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
  if (!name) throw new Error("Nome obrigatório");

  const { monthDay, birthYear } = readBirthFields(formData);
  if (!monthDay) throw new Error("Data de nascimento obrigatória");

  await db
    .update(aniversarios)
    .set({
      name,
      monthDay,
      birthYear,
      relation: ((formData.get("relation") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    })
    .where(eq(aniversarios.id, id));

  revalidatePath("/aniversarios");
}

/** Patch genérico (name/monthDay/birthYear/relation/notes) */
export async function patchAniversario(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.aniversarios.findFirst({
    where: eq(aniversarios.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | number | null> = {};
  if (formData.has("name")) {
    const v = ((formData.get("name") as string) || "").trim();
    if (v) patch.name = v;
  }
  // Aceita o campo unificado `birthDate` (YYYY-MM-DD) — atualiza monthDay
  // e birthYear de uma só vez. Mantém também o suporte aos campos antigos
  // pra retrocompatibilidade com chamadas inline existentes.
  if (formData.has("birthDate")) {
    const v = ((formData.get("birthDate") as string) || "").trim();
    if (v) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        patch.monthDay = v.slice(5);
        patch.birthYear = parseInt(v.slice(0, 4), 10);
      } else if (/^-?-?\d{2}-\d{2}$/.test(v)) {
        patch.monthDay = v.replace(/^-+/, "");
        patch.birthYear = null;
      }
    }
  }
  if (formData.has("monthDay")) {
    const v = ((formData.get("monthDay") as string) || "").trim();
    if (v) patch.monthDay = parseMonthDay(v);
  }
  if (formData.has("birthYear")) {
    const v = ((formData.get("birthYear") as string) || "").trim();
    patch.birthYear = v ? parseInt(v, 10) : null;
  }
  if (formData.has("relation")) {
    const v = ((formData.get("relation") as string) || "").trim();
    patch.relation = v || null;
  }
  if (formData.has("notes")) {
    const v = ((formData.get("notes") as string) || "").trim();
    patch.notes = v || null;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(aniversarios).set(patch).where(eq(aniversarios.id, id));
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
