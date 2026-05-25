"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { roteiros, viagens } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createViagem(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Título obrigatório");

  const startDate = ((formData.get("startDate") as string) || "").trim() || null;
  const endDate = ((formData.get("endDate") as string) || "").trim() || null;
  const status = ((formData.get("status") as string) || "planned") as
    | "planned"
    | "in_progress"
    | "past";

  let nights: number | null = null;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    nights = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  }

  await db.insert(viagens).values({
    householdId,
    createdById: userId,
    title,
    destinationCity: ((formData.get("destinationCity") as string) || "").trim() || null,
    destinationCountry: ((formData.get("destinationCountry") as string) || "").trim() || null,
    startDate,
    endDate,
    nights,
    status,
    estimatedCost: ((formData.get("estimatedCost") as string) || "").trim() || null,
    flightInfo: ((formData.get("flightInfo") as string) || "").trim() || null,
    ticketsBought: formData.get("ticketsBought") === "on",
    coverImageUrl: ((formData.get("coverImageUrl") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/viagens");
}

export async function updateViagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.viagens.findFirst({ where: eq(viagens.id, id) });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Viagem não encontrada");
  }

  const startDate = ((formData.get("startDate") as string) || "").trim() || null;
  const endDate = ((formData.get("endDate") as string) || "").trim() || null;
  let nights: number | null = null;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    nights = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  }

  await db
    .update(viagens)
    .set({
      title: (formData.get("title") as string)?.trim() || existing.title,
      destinationCity: ((formData.get("destinationCity") as string) || "").trim() || null,
      destinationCountry: ((formData.get("destinationCountry") as string) || "").trim() || null,
      startDate,
      endDate,
      nights,
      status: ((formData.get("status") as string) || "planned") as "planned" | "in_progress" | "past",
      estimatedCost: ((formData.get("estimatedCost") as string) || "").trim() || null,
      flightInfo: ((formData.get("flightInfo") as string) || "").trim() || null,
      ticketsBought: formData.get("ticketsBought") === "on",
      coverImageUrl: ((formData.get("coverImageUrl") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    })
    .where(eq(viagens.id, id));

  revalidatePath("/viagens");
  revalidatePath(`/viagens/${id}`);
}

/** Patch genérico. Aceita title/destinationCity/destinationCountry/startDate/endDate/status/estimatedCost/flightInfo */
export async function patchViagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.viagens.findFirst({ where: eq(viagens.id, id) });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | number | boolean | null> = {};
  const stringKeys = [
    "title",
    "destinationCity",
    "destinationCountry",
    "startDate",
    "endDate",
    "estimatedCost",
    "flightInfo",
    "coverImageUrl",
    "notes",
  ];
  for (const key of stringKeys) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "title" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (formData.has("status")) {
    const v = (formData.get("status") as string) || "planned";
    if (["planned", "in_progress", "past"].includes(v)) patch.status = v;
  }

  // Recalcular nights se start/end mudou
  const newStart = (patch.startDate as string | null | undefined) ?? existing.startDate;
  const newEnd = (patch.endDate as string | null | undefined) ?? existing.endDate;
  if (newStart && newEnd) {
    const s = new Date(newStart);
    const e = new Date(newEnd);
    patch.nights = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  }

  if (Object.keys(patch).length === 0) return;
  await db.update(viagens).set(patch).where(eq(viagens.id, id));
  revalidatePath("/viagens");
  revalidatePath(`/viagens/${id}`);
}

export async function deleteViagem(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.viagens.findFirst({ where: eq(viagens.id, id) });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Viagem não encontrada");
  }
  await db.delete(viagens).where(eq(viagens.id, id));
  revalidatePath("/viagens");
}

export async function addRoteiroDay(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const viagemId = formData.get("viagemId") as string;
  if (!viagemId) throw new Error("Viagem obrigatória");

  const viagem = await db.query.viagens.findFirst({ where: eq(viagens.id, viagemId) });
  if (!viagem || viagem.householdId !== householdId) {
    throw new Error("Viagem não encontrada");
  }

  const existingRoteiros = await db.query.roteiros.findMany({
    where: eq(roteiros.viagemId, viagemId),
    orderBy: (r, { desc }) => [desc(r.dayNumber)],
    limit: 1,
  });
  const nextDay = (existingRoteiros[0]?.dayNumber ?? 0) + 1;

  await db.insert(roteiros).values({
    viagemId,
    dayNumber: parseInt((formData.get("dayNumber") as string) || String(nextDay), 10),
    date: ((formData.get("date") as string) || "").trim() || null,
    dayOfWeek: ((formData.get("dayOfWeek") as string) || "").trim() || null,
    city: ((formData.get("city") as string) || "").trim() || null,
    distanceKm: formData.get("distanceKm")
      ? parseInt(formData.get("distanceKm") as string, 10) || null
      : null,
    programManha: ((formData.get("programManha") as string) || "").trim() || null,
    programTarde: ((formData.get("programTarde") as string) || "").trim() || null,
    programNoite: ((formData.get("programNoite") as string) || "").trim() || null,
    estimatedCost: ((formData.get("estimatedCost") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath(`/viagens/${viagemId}`);
}

export async function deleteRoteiroDay(roteiroId: string) {
  const { householdId } = await requireUserAndHousehold();
  const r = await db.query.roteiros.findFirst({
    where: eq(roteiros.id, roteiroId),
    with: { viagem: true },
  });
  if (!r || r.viagem.householdId !== householdId) {
    throw new Error("Dia não encontrado");
  }
  await db.delete(roteiros).where(eq(roteiros.id, roteiroId));
  revalidatePath(`/viagens/${r.viagemId}`);
}
