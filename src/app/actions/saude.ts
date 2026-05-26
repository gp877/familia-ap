"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { exames, pesagens } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

// ── Exames ────────────────────────────────────────────────
export async function createExame(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const who = (formData.get("who") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const examDate = formData.get("examDate") as string;
  if (!who || !name || !examDate) throw new Error("Quem, exame e data obrigatórios");

  const statusRaw = (formData.get("status") as string) || "ok";
  const status = (
    ["ok", "atencao", "anormal", "pendente"].includes(statusRaw) ? statusRaw : "ok"
  ) as "ok" | "atencao" | "anormal" | "pendente";

  await db.insert(exames).values({
    householdId,
    createdById: userId,
    who,
    name,
    examDate,
    status,
    doctor: ((formData.get("doctor") as string) || "").trim() || null,
    result: ((formData.get("result") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
    attachmentUrl: ((formData.get("attachmentUrl") as string) || "").trim() || null,
  });

  revalidatePath("/saude-exames");
}

export async function deleteExame(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.exames.findFirst({ where: eq(exames.id, id) });
  if (!existing || existing.householdId !== householdId) throw new Error("Exame não encontrado");
  await db.delete(exames).where(eq(exames.id, id));
  revalidatePath("/saude-exames");
}

// ── Pesagens ──────────────────────────────────────────────
export async function createPesagem(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const who = (formData.get("who") as string)?.trim();
  const weighedOn = formData.get("weighedOn") as string;
  const weight = (formData.get("weightKg") as string)?.trim();
  if (!who || !weighedOn || !weight) throw new Error("Quem, data e peso obrigatórios");

  await db.insert(pesagens).values({
    householdId,
    createdById: userId,
    who,
    weighedOn,
    weightKg: weight,
    bodyFatPct: ((formData.get("bodyFatPct") as string) || "").trim() || null,
    heightCm: ((formData.get("heightCm") as string) || "").trim() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
  });

  revalidatePath("/saude-peso");
}

/** Patch parcial de pesagem (weightKg, bodyFatPct, weighedOn, notes). */
export async function patchPesagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.pesagens.findFirst({
    where: eq(pesagens.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  for (const key of ["weightKg", "bodyFatPct", "heightCm", "weighedOn", "notes"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "weightKg" && !v) continue;
      if (key === "weighedOn" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(pesagens).set(patch).where(eq(pesagens.id, id));
  revalidatePath("/saude-peso");
}

export async function deletePesagem(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.pesagens.findFirst({ where: eq(pesagens.id, id) });
  if (!existing || existing.householdId !== householdId) throw new Error("Pesagem não encontrada");
  await db.delete(pesagens).where(eq(pesagens.id, id));
  revalidatePath("/saude-peso");
}
