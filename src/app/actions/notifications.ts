"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  notificationRecipients,
  notificationRuleRecipients,
  notificationRules,
  users,
} from "@/db/schema";
import { auth } from "@/auth";
import { sendEmail } from "@/lib/email/send";
import { TestEmail } from "@/lib/email/templates/test";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId, email: dbUser.email };
}

// ────────────────────────────────────────────────────────────
// Recipients
// ────────────────────────────────────────────────────────────

export async function createRecipient(input: { email: string; name?: string | null }) {
  const { householdId } = await requireUser();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("E-mail inválido");
  }
  await db
    .insert(notificationRecipients)
    .values({
      householdId,
      email,
      name: input.name?.trim() || null,
    })
    .onConflictDoNothing({
      target: [notificationRecipients.householdId, notificationRecipients.email],
    });
  revalidatePath("/configuracoes/notificacoes");
}

export async function deleteRecipient(recipientId: string) {
  const { householdId } = await requireUser();
  await db
    .delete(notificationRecipients)
    .where(
      and(
        eq(notificationRecipients.id, recipientId),
        eq(notificationRecipients.householdId, householdId)
      )
    );
  revalidatePath("/configuracoes/notificacoes");
}

// ────────────────────────────────────────────────────────────
// Rules
// ────────────────────────────────────────────────────────────

export type RuleType =
  | "missing_statement"
  | "missing_invoice"
  | "pending_classifications"
  | "weekly_digest";

export type RuleFrequency =
  | "daily"
  | "weekly_monday"
  | "weekly_friday"
  | "weekly_sunday"
  | "monthly_first";

export async function createRule(input: {
  type: RuleType;
  frequency: RuleFrequency;
  recipientIds: string[];
  config?: Record<string, unknown>;
}) {
  const { householdId } = await requireUser();
  const [created] = await db
    .insert(notificationRules)
    .values({
      householdId,
      type: input.type,
      frequency: input.frequency,
      isActive: true,
      config: input.config ?? null,
    })
    .returning();

  if (input.recipientIds.length > 0) {
    await db.insert(notificationRuleRecipients).values(
      input.recipientIds.map((rid) => ({
        ruleId: created.id,
        recipientId: rid,
      }))
    );
  }
  revalidatePath("/configuracoes/notificacoes");
  return created.id;
}

export async function updateRuleActive(ruleId: string, isActive: boolean) {
  const { householdId } = await requireUser();
  const rule = await db.query.notificationRules.findFirst({
    where: eq(notificationRules.id, ruleId),
  });
  if (!rule || rule.householdId !== householdId) throw new Error("Regra não encontrada");
  await db
    .update(notificationRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(notificationRules.id, ruleId));
  revalidatePath("/configuracoes/notificacoes");
}

export async function updateRuleFrequency(ruleId: string, frequency: RuleFrequency) {
  const { householdId } = await requireUser();
  const rule = await db.query.notificationRules.findFirst({
    where: eq(notificationRules.id, ruleId),
  });
  if (!rule || rule.householdId !== householdId) throw new Error("Regra não encontrada");
  await db
    .update(notificationRules)
    .set({ frequency, updatedAt: new Date() })
    .where(eq(notificationRules.id, ruleId));
  revalidatePath("/configuracoes/notificacoes");
}

export async function deleteRule(ruleId: string) {
  const { householdId } = await requireUser();
  await db
    .delete(notificationRules)
    .where(
      and(eq(notificationRules.id, ruleId), eq(notificationRules.householdId, householdId))
    );
  revalidatePath("/configuracoes/notificacoes");
}

/**
 * Atalho pra validar que Resend está funcionando — envia um email simples
 * pra um destinatário específico (default: o user logado). Útil pra
 * confirmar config sem precisar esperar cron + bater condições.
 */
export async function sendTestEmail(toEmail?: string) {
  const { email: myEmail } = await requireUser();
  const target = toEmail?.trim() || myEmail;
  if (!target) throw new Error("Sem email destino");

  const res = await sendEmail({
    to: target,
    subject: "Teste de configuração — Família AP",
    react: TestEmail(),
    tag: "test",
  });

  if (!res.ok) {
    if (res.skippedNoConfig) {
      throw new Error("RESEND_API_KEY não configurada");
    }
    throw new Error(res.error ?? "Falha desconhecida ao enviar");
  }

  return { ok: true, to: target, providerId: res.providerId };
}

export async function setRuleRecipients(ruleId: string, recipientIds: string[]) {
  const { householdId } = await requireUser();
  const rule = await db.query.notificationRules.findFirst({
    where: eq(notificationRules.id, ruleId),
  });
  if (!rule || rule.householdId !== householdId) throw new Error("Regra não encontrada");

  await db.transaction(async (tx) => {
    await tx
      .delete(notificationRuleRecipients)
      .where(eq(notificationRuleRecipients.ruleId, ruleId));
    if (recipientIds.length > 0) {
      await tx.insert(notificationRuleRecipients).values(
        recipientIds.map((rid) => ({ ruleId, recipientId: rid }))
      );
    }
  });
  revalidatePath("/configuracoes/notificacoes");
}
