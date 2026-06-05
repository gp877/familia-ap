"use server";

import { and, eq } from "drizzle-orm";
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

function addYears(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

  // Materializa N ocorrências futuras. Geramos generosamente — o user
  // pode deletar a série toda depois. Janelas escolhidas pra cobrir
  // ~1 ano à frente em cada modalidade.
  const [oy, om, od] = occurredOn.split("-").map(Number);
  const baseDow = new Date(oy, om - 1, od).getDay();

  // weekly aceita múltiplos dias da semana (0=dom..6=sab).
  // yearly aceita múltiplos meses (1=jan..12=dez).
  // Se nenhum vier marcado, cai pro dia/mês do occurredOn.
  const daysOfWeekRaw = formData.getAll("daysOfWeek").map((d) => Number(d));
  const daysOfWeek = daysOfWeekRaw.length > 0 ? daysOfWeekRaw : [baseDow];
  const monthsRaw = formData.getAll("months").map((m) => Number(m));
  const months = monthsRaw.length > 0 ? monthsRaw : [om];

  const dates: string[] = [];
  if (recurring === "once") {
    dates.push(occurredOn);
  } else if (recurring === "daily") {
    for (let i = 0; i < 60; i++) dates.push(addDays(occurredOn, i));
  } else if (recurring === "weekly") {
    // 52 semanas × N dias selecionados. Sempre >= occurredOn.
    for (let w = 0; w < 52; w++) {
      for (const dow of daysOfWeek) {
        const offset = ((dow - baseDow + 7) % 7) + w * 7;
        dates.push(addDays(occurredOn, offset));
      }
    }
  } else if (recurring === "biweekly") {
    for (let i = 0; i < 26; i++) dates.push(addDays(occurredOn, 14 * i));
  } else if (recurring === "monthly") {
    for (let i = 0; i < 24; i++) dates.push(addMonths(occurredOn, i));
  } else if (recurring === "yearly") {
    // 5 anos × N meses selecionados. Ano 0 pula meses < mês original
    // (já passaram nesse ano).
    for (let y = 0; y < 5; y++) {
      for (const m of months) {
        if (y === 0 && m < om) continue;
        const yr = oy + y;
        dates.push(`${yr}-${String(m).padStart(2, "0")}-${String(od).padStart(2, "0")}`);
      }
    }
  }

  // dedupe (defensivo) + ordem cronológica
  const unique = Array.from(new Set(dates)).sort();

  await db.insert(compromissos).values(
    unique.map((date) => ({
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
  await db
    .delete(compromissos)
    .where(
      and(eq(compromissos.householdId, householdId), eq(compromissos.seriesId, seriesId))
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

/**
 * Patch genérico de um único campo. Aceita `title`, `time`, `who`, `location`,
 * `notes`. Outros campos são ignorados.
 */
export async function patchCompromisso(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;

  const existing = await db.query.compromissos.findFirst({
    where: eq(compromissos.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  const allowed = ["title", "time", "who", "location", "notes", "occurredOn"];
  for (const key of allowed) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      // título não pode ser vazio
      if (key === "title" && !v) continue;
      patch[key] = v || null;
    }
  }

  if (Object.keys(patch).length === 0) return;
  await db.update(compromissos).set(patch).where(eq(compromissos.id, id));
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
