"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export async function createBankAccount(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  const typeRaw = (formData.get("type") as string) || "checking";
  const type = (
    ["checking", "savings", "credit_card", "investment", "other"].includes(typeRaw)
      ? typeRaw
      : "checking"
  ) as "checking" | "savings" | "credit_card" | "investment" | "other";

  await db.insert(bankAccounts).values({
    householdId,
    name,
    type,
    institution: ((formData.get("institution") as string) || "").trim() || null,
    lastFour: ((formData.get("lastFour") as string) || "").trim() || null,
    color: ((formData.get("color") as string) || "").trim() || null,
  });

  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

export async function updateBankAccount(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID obrigatório");

  const existing = await db.query.bankAccounts.findFirst({
    where: eq(bankAccounts.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Conta não encontrada");
  }

  await db
    .update(bankAccounts)
    .set({
      name: (formData.get("name") as string)?.trim() || existing.name,
      institution: ((formData.get("institution") as string) || "").trim() || null,
      lastFour: ((formData.get("lastFour") as string) || "").trim() || null,
      color: ((formData.get("color") as string) || "").trim() || null,
      isActive: formData.get("isActive") !== "false",
    })
    .where(eq(bankAccounts.id, id));

  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

/** Patch parcial de bankAccount (name, institution, lastFour, color, type). */
export async function patchBankAccount(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.bankAccounts.findFirst({
    where: eq(bankAccounts.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  for (const key of ["name", "institution", "lastFour", "color"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "name" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (formData.has("type")) {
    const v = (formData.get("type") as string) || "";
    if (["checking", "savings", "credit_card", "investment", "other"].includes(v)) {
      patch.type = v;
    }
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(bankAccounts).set(patch).where(eq(bankAccounts.id, id));
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

export async function deleteBankAccount(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.bankAccounts.findFirst({
    where: eq(bankAccounts.id, id),
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("Conta não encontrada");
  }
  await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}
