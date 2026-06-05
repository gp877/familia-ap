/**
 * Cron de notificações — roda 1x/dia (09h BRT = 12h UTC) configurado em
 * vercel.json. Avalia cada regra ativa, dispara email se condição bater,
 * registra no log.
 *
 * Segurança: Vercel Cron envia header `Authorization: Bearer <CRON_SECRET>`.
 * Validamos isso pra impedir invocação manual externa.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  notificationLog,
  notificationRecipients,
  notificationRuleRecipients,
  notificationRules,
} from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { MissingInvoiceEmail } from "@/lib/email/templates/missing-invoice";
import { MissingStatementEmail } from "@/lib/email/templates/missing-statement";
import { PendingClassificationsEmail } from "@/lib/email/templates/pending-classifications";
import { PendingRecurringPaymentsEmail } from "@/lib/email/templates/pending-recurring";
import { WeeklyDigestEmail } from "@/lib/email/templates/weekly-digest";
import {
  evaluateMissingInvoice,
  evaluateMissingStatement,
  evaluatePendingClassifications,
  evaluatePendingRecurringPayments,
  evaluateWeeklyDigest,
} from "@/lib/notifications/triggers";

export const runtime = "nodejs";
export const maxDuration = 60;

const FREQUENCY_TO_DOW: Record<string, number | "any"> = {
  daily: "any",
  weekly_monday: 1,
  weekly_friday: 5,
  weekly_sunday: 0,
  monthly_first: -1, // tratado separado
};

/**
 * Decide se a regra DEVE rodar hoje, baseado em:
 * - frequência (dia da semana)
 * - lastSentAt (não enviar 2x no mesmo dia)
 */
function shouldRunToday(rule: { frequency: string; lastSentAt: Date | null }, now: Date): boolean {
  const dow = FREQUENCY_TO_DOW[rule.frequency];
  if (dow === undefined) return false;

  if (dow === -1) {
    // monthly_first — só roda no dia 1
    if (now.getDate() !== 1) return false;
  } else if (dow !== "any" && now.getDay() !== dow) {
    return false;
  }

  // Não envia 2x no mesmo dia
  if (rule.lastSentAt) {
    const last = new Date(rule.lastSentAt);
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return false;
  }

  return true;
}

export async function GET(req: Request) {
  // Auth — Vercel Cron manda Bearer com CRON_SECRET
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: Array<{
    ruleId: string;
    type: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
    recipients?: number;
  }> = [];

  // Pega todas as regras ativas com destinatários populados
  const rules = await db.query.notificationRules.findMany({
    where: eq(notificationRules.isActive, true),
  });

  for (const rule of rules) {
    if (!shouldRunToday(rule, now)) {
      results.push({ ruleId: rule.id, type: rule.type, status: "skipped", reason: "off-schedule" });
      continue;
    }

    // Atualiza lastEvaluatedAt
    await db
      .update(notificationRules)
      .set({ lastEvaluatedAt: now })
      .where(eq(notificationRules.id, rule.id));

    // Pega destinatários
    const recips = await db
      .select({
        email: notificationRecipients.email,
        name: notificationRecipients.name,
      })
      .from(notificationRuleRecipients)
      .innerJoin(
        notificationRecipients,
        eq(notificationRuleRecipients.recipientId, notificationRecipients.id)
      )
      .where(eq(notificationRuleRecipients.ruleId, rule.id));

    if (recips.length === 0) {
      results.push({ ruleId: rule.id, type: rule.type, status: "skipped", reason: "no-recipients" });
      continue;
    }

    try {
      const ruleSent = await evaluateAndSend(rule, recips, now);
      results.push({
        ruleId: rule.id,
        type: rule.type,
        status: ruleSent.sent ? "sent" : "skipped",
        reason: ruleSent.reason,
        recipients: recips.length,
      });

      if (ruleSent.sent) {
        await db
          .update(notificationRules)
          .set({ lastSentAt: now })
          .where(eq(notificationRules.id, rule.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.insert(notificationLog).values({
        ruleId: rule.id,
        status: "failed",
        errorMessage: msg,
      });
      results.push({ ruleId: rule.id, type: rule.type, status: "failed", reason: msg });
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), count: results.length, results });
}

/**
 * Avalia o trigger da regra e, se bater, envia pra todos os destinatários.
 * Retorna se algum email foi enviado.
 */
async function evaluateAndSend(
  rule: typeof notificationRules.$inferSelect,
  recipients: { email: string; name: string | null }[],
  now: Date
): Promise<{ sent: boolean; reason: string }> {
  switch (rule.type) {
    case "missing_statement": {
      const triggers = await evaluateMissingStatement(rule.householdId, now);
      if (triggers.length === 0) {
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: "skipped",
          triggerSummary: "Todos os extratos do mês foram enviados",
        });
        return { sent: false, reason: "no-missing-statement" };
      }
      // Envia 1 email por conta faltando, pra cada destinatário
      let anySent = false;
      for (const t of triggers) {
        for (const r of recipients) {
          const res = await sendEmail({
            to: r.email,
            subject: `Falta o extrato de ${t.monthLabel} — ${t.accountName}`,
            react: MissingStatementEmail({
              recipientName: r.name,
              accountName: t.accountName,
              monthLabel: t.monthLabel,
              daysIntoMonth: t.daysIntoMonth,
              ruleId: rule.id,
            }),
            tag: "missing_statement",
          });
          await db.insert(notificationLog).values({
            ruleId: rule.id,
            status: res.ok ? "sent" : "failed",
            recipientEmail: r.email,
            providerId: res.providerId,
            triggerSummary: `Extrato faltando: ${t.accountName} (${t.monthLabel})`,
            errorMessage: res.error,
          });
          if (res.ok) anySent = true;
        }
      }
      return { sent: anySent, reason: `${triggers.length} conta(s) sem extrato` };
    }

    case "missing_invoice": {
      const triggers = await evaluateMissingInvoice(rule.householdId, now);
      if (triggers.length === 0) {
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: "skipped",
          triggerSummary: "Todas as faturas do mês foram enviadas",
        });
        return { sent: false, reason: "no-missing-invoice" };
      }
      let anySent = false;
      for (const t of triggers) {
        for (const r of recipients) {
          const res = await sendEmail({
            to: r.email,
            subject: `Falta a fatura de ${t.monthLabel} — ${t.cardName}`,
            react: MissingInvoiceEmail({
              recipientName: r.name,
              cardName: t.cardName,
              monthLabel: t.monthLabel,
              daysIntoMonth: t.daysIntoMonth,
              ruleId: rule.id,
            }),
            tag: "missing_invoice",
          });
          await db.insert(notificationLog).values({
            ruleId: rule.id,
            status: res.ok ? "sent" : "failed",
            recipientEmail: r.email,
            providerId: res.providerId,
            triggerSummary: `Fatura faltando: ${t.cardName} (${t.monthLabel})`,
            errorMessage: res.error,
          });
          if (res.ok) anySent = true;
        }
      }
      return { sent: anySent, reason: `${triggers.length} cartão(ões) sem fatura` };
    }

    case "pending_classifications": {
      const config = (rule.config as { minCount?: number; minDaysOld?: number } | null) ?? {};
      const trigger = await evaluatePendingClassifications(rule.householdId, config, now);
      if (!trigger) {
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: "skipped",
          triggerSummary: "Pendentes abaixo do threshold",
        });
        return { sent: false, reason: "no-pending" };
      }
      let anySent = false;
      for (const r of recipients) {
        const res = await sendEmail({
          to: r.email,
          subject: `${trigger.pendingCount} lançamentos esperando classificação`,
          react: PendingClassificationsEmail({
            recipientName: r.name,
            pendingCount: trigger.pendingCount,
            oldestDays: trigger.oldestDays,
            ruleId: rule.id,
          }),
          tag: "pending_classifications",
        });
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: res.ok ? "sent" : "failed",
          recipientEmail: r.email,
          providerId: res.providerId,
          triggerSummary: `${trigger.pendingCount} pendentes, mais antiga há ${trigger.oldestDays}d`,
          errorMessage: res.error,
        });
        if (res.ok) anySent = true;
      }
      return { sent: anySent, reason: `${trigger.pendingCount} pendentes` };
    }

    case "pending_recurring_payments": {
      const trigger = await evaluatePendingRecurringPayments(rule.householdId, now);
      if (!trigger) {
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: "skipped",
          triggerSummary: "Nenhum pagamento recorrente pendente",
        });
        return { sent: false, reason: "no-pending-recurring" };
      }
      let anySent = false;
      for (const r of recipients) {
        const res = await sendEmail({
          to: r.email,
          subject:
            trigger.overdueCount > 0
              ? `${trigger.overdueCount} pagamento(s) recorrente(s) atrasado(s)`
              : `${trigger.items.length} pagamento(s) recorrente(s) pendente(s)`,
          react: PendingRecurringPaymentsEmail({
            recipientName: r.name,
            items: trigger.items,
            overdueCount: trigger.overdueCount,
            dueSoonCount: trigger.dueSoonCount,
            ruleId: rule.id,
          }),
          tag: "pending_recurring_payments",
        });
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: res.ok ? "sent" : "failed",
          recipientEmail: r.email,
          providerId: res.providerId,
          triggerSummary: `${trigger.items.length} pendentes, ${trigger.overdueCount} atrasados`,
          errorMessage: res.error,
        });
        if (res.ok) anySent = true;
      }
      return {
        sent: anySent,
        reason: `${trigger.items.length} pendentes (${trigger.overdueCount} atrasados)`,
      };
    }

    case "weekly_digest": {
      const trigger = await evaluateWeeklyDigest(rule.householdId, now);
      if (!trigger) {
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: "skipped",
          triggerSummary: "Semana sem movimentação",
        });
        return { sent: false, reason: "no-activity" };
      }
      let anySent = false;
      for (const r of recipients) {
        const res = await sendEmail({
          to: r.email,
          subject: `Resumo da semana ${trigger.weekRange}`,
          react: WeeklyDigestEmail({
            recipientName: r.name,
            weekRange: trigger.weekRange,
            txCount: trigger.txCount,
            totalDebit: trigger.totalDebit,
            totalCredit: trigger.totalCredit,
            topCategories: trigger.topCategories,
            pendingCount: trigger.pendingCount,
            ruleId: rule.id,
          }),
          tag: "weekly_digest",
        });
        await db.insert(notificationLog).values({
          ruleId: rule.id,
          status: res.ok ? "sent" : "failed",
          recipientEmail: r.email,
          providerId: res.providerId,
          triggerSummary: `${trigger.txCount} tx, R$ ${trigger.totalDebit} saídas`,
          errorMessage: res.error,
        });
        if (res.ok) anySent = true;
      }
      return { sent: anySent, reason: "weekly digest" };
    }

    default:
      return { sent: false, reason: `unknown type: ${rule.type}` };
  }
}
