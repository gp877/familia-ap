import { asc, eq } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  notificationRecipients,
  notificationRuleRecipients,
  notificationRules,
  users,
} from "@/db/schema";

import { NotificationsClient } from "./notifications-client";

export default async function NotificacoesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Garante destinatário padrão pra o user logado — assim ele já entra
  // recebendo as notificações sem precisar configurar
  if (dbUser.email) {
    await db
      .insert(notificationRecipients)
      .values({
        householdId: dbUser.householdId,
        email: dbUser.email,
        name: dbUser.name?.split(" ")[0] ?? null,
        userId: dbUser.id,
      })
      .onConflictDoNothing({
        target: [notificationRecipients.householdId, notificationRecipients.email],
      });
  }

  const [rules, recipients, ruleRecipients] = await Promise.all([
    db.query.notificationRules.findMany({
      where: eq(notificationRules.householdId, dbUser.householdId),
      orderBy: [asc(notificationRules.type)],
    }),
    db.query.notificationRecipients.findMany({
      where: eq(notificationRecipients.householdId, dbUser.householdId),
      orderBy: [asc(notificationRecipients.email)],
    }),
    db
      .select({
        ruleId: notificationRuleRecipients.ruleId,
        recipientId: notificationRuleRecipients.recipientId,
      })
      .from(notificationRuleRecipients)
      .innerJoin(
        notificationRules,
        eq(notificationRuleRecipients.ruleId, notificationRules.id)
      )
      .where(eq(notificationRules.householdId, dbUser.householdId)),
  ]);

  // Mapa ruleId → recipientIds
  const recipsByRule = new Map<string, string[]>();
  for (const rr of ruleRecipients) {
    const arr = recipsByRule.get(rr.ruleId) ?? [];
    arr.push(rr.recipientId);
    recipsByRule.set(rr.ruleId, arr);
  }

  const rulesWithRecipients = rules.map((r) => ({
    id: r.id,
    type: r.type,
    frequency: r.frequency,
    isActive: r.isActive,
    lastSentAt: r.lastSentAt?.toISOString() ?? null,
    recipientIds: recipsByRule.get(r.id) ?? [],
  }));

  const recipientsList = recipients.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
  }));

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <ScreenShell
      insight={
        rules.length === 0 ? (
          <>
            Ainda sem regras de notificação. Crie uma regra abaixo escolhendo
            o tipo de lembrete e quem deve receber.
          </>
        ) : (
          <>
            <b>{activeCount}</b>{" "}
            {activeCount === 1 ? "regra ativa" : "regras ativas"} de{" "}
            {rules.length}. Cron roda diariamente 09h (BRT) e dispara
            só as que estão no dia certo.
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/configuracoes" label="Configurações" />
      </div>

      <SectionRow icon="spark" label="Notificações" action={`${activeCount}/${rules.length}`} />
      <BigNumber
        value={String(activeCount)}
        sub={rules.length === 0 ? "sem regras" : `${activeCount} ativas · ${rules.length - activeCount} pausadas`}
      />

      {!process.env.RESEND_API_KEY && (
        <div style={{ padding: "12px 20px 0" }}>
          <Card pad={14}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--alert)",
                marginBottom: 4,
              }}
            >
              ⚠ Resend não configurado
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted-d)", lineHeight: 1.5 }}>
              A variável <code>RESEND_API_KEY</code> não está setada no
              ambiente. As regras existem mas o cron não consegue enviar
              email enquanto isso. Configure em{" "}
              <a href="https://vercel.com/dashboard" style={{ color: "var(--accent)" }}>
                vercel.com → settings → env vars
              </a>
              .
            </div>
          </Card>
        </div>
      )}

      <NotificationsClient
        rules={rulesWithRecipients}
        recipients={recipientsList}
      />
    </ScreenShell>
  );
}
