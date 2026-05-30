"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { roteiros, viagemPassagens, viagens } from "@/db/schema";
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

/**
 * Patch parcial de um dia do roteiro. Aceita campos de programa, cidade,
 * notas, distanceKm, e os 4 custos discriminados (costAlimentacao,
 * costHospedagem, costPasseios, costTraslados) + estimatedCost legado.
 */
export async function patchRoteiroDay(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const r = await db.query.roteiros.findFirst({
    where: eq(roteiros.id, id),
    with: { viagem: true },
  });
  if (!r || r.viagem.householdId !== householdId) return;

  const patch: Record<string, string | number | null> = {};
  const stringKeys = [
    "city",
    "dayOfWeek",
    "programManha",
    "programTarde",
    "programNoite",
    "notes",
  ];
  for (const key of stringKeys) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      patch[key] = v || null;
    }
  }
  // Custos: aceitam formato BR "1.234,56" e int
  const moneyKeys = [
    "estimatedCost",
    "costAlimentacao",
    "costHospedagem",
    "costPasseios",
    "costTraslados",
  ];
  for (const key of moneyKeys) {
    if (formData.has(key)) {
      const raw = ((formData.get(key) as string) || "")
        .trim()
        .replace(/[R$\s]/g, "")
        .replace(",", ".");
      if (!raw) {
        patch[key] = null;
      } else {
        const n = parseFloat(raw);
        patch[key] = Number.isFinite(n) ? n.toFixed(2) : null;
      }
    }
  }
  if (formData.has("distanceKm")) {
    const raw = ((formData.get("distanceKm") as string) || "").trim();
    patch.distanceKm = raw ? parseInt(raw, 10) || null : null;
  }
  if (formData.has("date")) {
    const v = ((formData.get("date") as string) || "").trim();
    patch.date = v || null;
  }

  if (Object.keys(patch).length === 0) return;
  await db.update(roteiros).set(patch).where(eq(roteiros.id, id));
  revalidatePath(`/viagens/${r.viagemId}`);
}

// ────────────────────────────────────────────────────────────
// Passagens aéreas (flight segments)
// ────────────────────────────────────────────────────────────

export async function addPassagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const viagemId = formData.get("viagemId") as string;
  if (!viagemId) throw new Error("Viagem obrigatória");

  const viagem = await db.query.viagens.findFirst({
    where: eq(viagens.id, viagemId),
  });
  if (!viagem || viagem.householdId !== householdId) {
    throw new Error("Viagem não encontrada");
  }

  // Próxima ordem
  const existing = await db.query.viagemPassagens.findMany({
    where: eq(viagemPassagens.viagemId, viagemId),
    orderBy: (p, { desc }) => [desc(p.segmentOrder)],
    limit: 1,
  });
  const nextOrder = (existing[0]?.segmentOrder ?? -1) + 1;

  const departureAt = ((formData.get("departureAt") as string) || "").trim();
  const arrivalAt = ((formData.get("arrivalAt") as string) || "").trim();
  const costRaw = ((formData.get("cost") as string) || "")
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(",", ".");
  const cost = costRaw ? parseFloat(costRaw) : null;

  await db.insert(viagemPassagens).values({
    viagemId,
    segmentOrder: nextOrder,
    airline: ((formData.get("airline") as string) || "").trim() || null,
    flightNumber: ((formData.get("flightNumber") as string) || "").trim() || null,
    departureAirport:
      ((formData.get("departureAirport") as string) || "").trim().toUpperCase() || null,
    departureAt: departureAt ? new Date(departureAt) : null,
    arrivalAirport:
      ((formData.get("arrivalAirport") as string) || "").trim().toUpperCase() || null,
    arrivalAt: arrivalAt ? new Date(arrivalAt) : null,
    cost: cost && Number.isFinite(cost) ? cost.toFixed(2) : null,
    passengers: formData.get("passengers")
      ? parseInt(formData.get("passengers") as string, 10) || null
      : null,
    bookingReference:
      ((formData.get("bookingReference") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  // Marca passagens como compradas se algum custo foi adicionado
  if (cost && Number.isFinite(cost)) {
    await db
      .update(viagens)
      .set({ ticketsBought: true })
      .where(eq(viagens.id, viagemId));
  }

  revalidatePath(`/viagens/${viagemId}`);
}

export async function patchPassagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const p = await db.query.viagemPassagens.findFirst({
    where: eq(viagemPassagens.id, id),
    with: { viagem: true },
  });
  if (!p || p.viagem.householdId !== householdId) return;

  const patch: Record<string, string | number | Date | null> = {};
  const stringKeys = [
    "airline",
    "flightNumber",
    "departureAirport",
    "arrivalAirport",
    "bookingReference",
    "notes",
  ];
  for (const key of stringKeys) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      patch[key] =
        (key === "departureAirport" || key === "arrivalAirport"
          ? v.toUpperCase()
          : v) || null;
    }
  }
  for (const key of ["departureAt", "arrivalAt"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      patch[key] = v ? new Date(v) : null;
    }
  }
  if (formData.has("cost")) {
    const raw = ((formData.get("cost") as string) || "")
      .trim()
      .replace(/[R$\s]/g, "")
      .replace(",", ".");
    if (!raw) {
      patch.cost = null;
    } else {
      const n = parseFloat(raw);
      patch.cost = Number.isFinite(n) ? n.toFixed(2) : null;
    }
  }
  if (formData.has("passengers")) {
    const v = ((formData.get("passengers") as string) || "").trim();
    patch.passengers = v ? parseInt(v, 10) || null : null;
  }

  if (Object.keys(patch).length === 0) return;
  await db.update(viagemPassagens).set(patch).where(eq(viagemPassagens.id, id));
  revalidatePath(`/viagens/${p.viagemId}`);
}

export async function deletePassagem(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const p = await db.query.viagemPassagens.findFirst({
    where: eq(viagemPassagens.id, id),
    with: { viagem: true },
  });
  if (!p || p.viagem.householdId !== householdId) {
    throw new Error("Passagem não encontrada");
  }
  await db.delete(viagemPassagens).where(eq(viagemPassagens.id, id));
  revalidatePath(`/viagens/${p.viagemId}`);
}
