import { asc, eq, inArray } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  recurringPaymentRecords,
  recurringPayments,
  users,
} from "@/db/schema";
import { computeStatus } from "@/lib/recurring-payments";

import { RecurringClient } from "./recurring-client";

export default async function RecorrentesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [payments, accounts, allCategories] = await Promise.all([
    db.query.recurringPayments.findMany({
      where: eq(recurringPayments.householdId, dbUser.householdId),
      orderBy: [
        asc(recurringPayments.isActive),
        asc(recurringPayments.frequency),
        asc(recurringPayments.name),
      ],
    }),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: [asc(bankAccounts.name)],
    }),
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      orderBy: [asc(categories.kind), asc(categories.name)],
    }),
  ]);

  // Records: pega todos pra cada payment, monta Set de periods pagos +
  // últimos 12 records pra histórico
  const paymentIds = payments.map((p) => p.id);
  const records = paymentIds.length
    ? await db.query.recurringPaymentRecords.findMany({
        where: inArray(recurringPaymentRecords.paymentId, paymentIds),
        orderBy: (r, { desc }) => [desc(r.period)],
      })
    : [];

  const recordsByPayment = new Map<
    string,
    {
      id: string;
      period: string;
      paidOn: string | null;
      paidAmount: string | null;
      notes: string | null;
    }[]
  >();
  for (const r of records) {
    const arr = recordsByPayment.get(r.paymentId) ?? [];
    arr.push({
      id: r.id,
      period: r.period,
      paidOn: r.paidOn ? new Date(r.paidOn).toISOString().slice(0, 10) : null,
      paidAmount: r.paidAmount,
      notes: r.notes,
    });
    recordsByPayment.set(r.paymentId, arr);
  }

  // Calcula status pra cada payment
  const enriched = payments.map((p) => {
    const recArr = recordsByPayment.get(p.id) ?? [];
    const paidPeriods = new Set(recArr.map((r) => r.period));
    const status = computeStatus({
      frequency: p.frequency,
      dueDay: p.dueDay,
      dueMonth: p.dueMonth,
      recordedPeriods: paidPeriods,
    });
    return {
      id: p.id,
      name: p.name,
      frequency: p.frequency,
      dueDay: p.dueDay,
      dueMonth: p.dueMonth,
      expectedAmount: p.expectedAmount,
      bankAccountId: p.bankAccountId,
      categoryId: p.categoryId,
      notes: p.notes,
      isActive: p.isActive,
      currentPeriod: status.period,
      currentStatus: status.status,
      currentDueDate: status.dueDate.toISOString().slice(0, 10),
      currentDaysUntilDue: status.daysUntilDue,
      records: recArr.slice(0, 12),
    };
  });

  const active = enriched.filter((p) => p.isActive);
  const overdue = active.filter((p) => p.currentStatus === "overdue").length;
  const due = active.filter((p) => p.currentStatus === "due").length;
  const paid = active.filter((p) => p.currentStatus === "paid").length;

  return (
    <ScreenShell
      insight={
        active.length === 0 ? (
          <>
            Cadastra teus pagamentos recorrentes (IPVA, gás, internet,
            mensalidade…) — o sistema te lembra todo mês/ano por e-mail.
          </>
        ) : overdue > 0 ? (
          <>
            ⚠️ <b>{overdue}</b>{" "}
            {overdue === 1 ? "pagamento atrasado" : "pagamentos atrasados"}. {due > 0 ? `${due} chegando.` : ""}
          </>
        ) : (
          <>
            <b>{paid}/{active.length}</b>{" "}
            pagos no período. {due > 0 ? `${due} chegando.` : "Tudo em dia."}
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow
        icon="bag"
        label="Pagamentos recorrentes"
        action={
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: overdue > 0 ? "var(--alert)" : "var(--muted)",
            }}
          >
            {paid}/{active.length}
          </span>
        }
      />
      <BigNumber
        value={String(active.length)}
        sub={`${overdue} atrasado${overdue === 1 ? "" : "s"} · ${due} chegando · ${paid} ok`}
        accent={overdue === 0 && active.length > 0}
      />

      <RecurringClient
        payments={enriched}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categoryOptions={allCategories.map((c) => {
          const parent = c.parentId
            ? allCategories.find((p) => p.id === c.parentId)
            : null;
          return {
            id: c.id,
            label: parent ? `${parent.name} › ${c.name}` : c.name,
            name: c.name,
            parentId: c.parentId,
            color: c.color ?? null,
            kind: c.kind,
          };
        })}
      />
    </ScreenShell>
  );
}
