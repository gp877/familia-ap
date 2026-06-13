import { and, asc, eq, inArray } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { resolveCategoryColor } from "@/lib/category-colors";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  recurringPaymentRecords,
  recurringPayments,
  users,
} from "@/db/schema";
import { computeStatus, urgencyOf } from "@/lib/recurring-payments";

import { OwnerToggle } from "./owner-toggle";
import { RecurringClient } from "./recurring-client";

type SearchParams = Promise<{ month?: string; view?: string }>;

export default async function RecorrentesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Mês foco — default mês atual. Affecta APENAS pagamentos mensais.
  // Anuais aparecem sempre (são poucos, peso visual diferente).
  const now = new Date();
  const requestedMonth = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;
  const focusYear = requestedMonth
    ? parseInt(requestedMonth.slice(0, 4), 10)
    : now.getFullYear();
  const focusMonth1 = requestedMonth
    ? parseInt(requestedMonth.slice(5, 7), 10)
    : now.getMonth() + 1;
  const focusDate = new Date(focusYear, focusMonth1 - 1, 15); // ponto no meio do mês p/ cálculos
  const focusMonthStr = `${focusYear}-${String(focusMonth1).padStart(2, "0")}`;

  // view=mine (default) → só os do usuário logado.
  // view=all → todos do household (mostra inicial do dono).
  const view = sp.view === "all" ? "all" : "mine";

  const [payments, accounts, allCategories, householdMembers] = await Promise.all([
    db.query.recurringPayments.findMany({
      where:
        view === "all"
          ? eq(recurringPayments.householdId, dbUser.householdId)
          : and(
              eq(recurringPayments.householdId, dbUser.householdId),
              eq(recurringPayments.createdById, session.user.id)
            ),
      orderBy: [
        asc(recurringPayments.isActive),
        asc(recurringPayments.frequency),
        asc(recurringPayments.dueDay),
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
    db.query.users.findMany({
      where: eq(users.householdId, dbUser.householdId),
      columns: { id: true, name: true, email: true },
    }),
  ]);

  // Conta totais pra mostrar no toggle (independente do view atual)
  const totalMine = await db
    .select({ id: recurringPayments.id })
    .from(recurringPayments)
    .where(
      and(
        eq(recurringPayments.householdId, dbUser.householdId),
        eq(recurringPayments.createdById, session.user.id)
      )
    );
  const totalHousehold = await db
    .select({ id: recurringPayments.id })
    .from(recurringPayments)
    .where(eq(recurringPayments.householdId, dbUser.householdId));

  const ownerById = new Map(
    householdMembers.map((u) => [
      u.id,
      {
        name: u.name ?? u.email,
        initial: (u.name ?? u.email).charAt(0).toUpperCase(),
      },
    ])
  );

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

  // Calcula status PARA O MÊS FOCO (mensais) ou pro ano (anuais).
  const enriched = payments.map((p) => {
    const recArr = recordsByPayment.get(p.id) ?? [];
    const paidPeriods = new Set(recArr.map((r) => r.period));
    // Pra mensal, status no mês focado; pra anual, status no ano atual
    const referenceDate = p.frequency === "monthly" ? focusDate : now;
    const status = computeStatus({
      frequency: p.frequency,
      dueDay: p.dueDay,
      dueMonth: p.dueMonth,
      recordedPeriods: paidPeriods,
      now: referenceDate,
    });
    // Pra urgência só faz sentido pra mensal focando mês atual ou anuais.
    // Pra meses passados ou futuros distantes a urgência fica neutra.
    const isCurrentMonth = focusMonthStr === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const urgency = p.frequency === "monthly" && !isCurrentMonth
      ? "ok"
      : urgencyOf(status.status, status.daysUntilDue);
    const owner = p.createdById ? ownerById.get(p.createdById) : null;
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
      currentUrgency: urgency,
      currentDueDate: status.dueDate.toISOString().slice(0, 10),
      currentDaysUntilDue: status.daysUntilDue,
      records: recArr.slice(0, 12),
      ownerInitial: owner?.initial ?? null,
      ownerName: owner?.name ?? null,
      pixKey: p.pixKey,
      barcodeNumber: p.barcodeNumber,
    };
  });

  // Stats só do mês focado (mensais + anuais que caem no mês)
  const monthly = enriched.filter((p) => p.frequency === "monthly" && p.isActive);
  const yearly = enriched.filter((p) => p.frequency === "yearly" && p.isActive);
  const inactive = enriched.filter((p) => !p.isActive);

  const monthlyOverdue = monthly.filter((p) => p.currentStatus === "overdue").length;
  const monthlyDue = monthly.filter((p) => p.currentStatus === "due").length;
  const monthlyPaid = monthly.filter((p) => p.currentStatus === "paid").length;
  const monthlyTotalExpected = monthly
    .reduce((s, p) => s + (p.expectedAmount ? parseFloat(p.expectedAmount) : 0), 0);

  const today = new Date();
  const isCurrentMonth = focusMonthStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <ScreenShell
      insight={
        monthly.length === 0 && yearly.length === 0 ? (
          <>
            Sem pagamentos recorrentes ainda. Cadastra teus pagamentos
            mensais e anuais — o sistema te lembra por e-mail e via sino.
          </>
        ) : isCurrentMonth && monthlyOverdue > 0 ? (
          <>
            ⚠️ <b>{monthlyOverdue}</b> {monthlyOverdue === 1 ? "atrasado" : "atrasados"} este mês. {monthlyDue > 0 ? `${monthlyDue} chegando.` : ""}
          </>
        ) : (
          <>
            <b>{monthlyPaid}/{monthly.length}</b> mensais pagos · {yearly.length} anuais.
          </>
        )
      }
    >
      <SectionRow
        icon="bag"
        label="Pagamentos recorrentes"
        action={
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
            {monthly.length + yearly.length} ativos
          </span>
        }
      />

      <div style={{ padding: "0 20px" }}>
        <OwnerToggle
          view={view}
          countMine={totalMine.length}
          countAll={totalHousehold.length}
          focusMonth={focusMonthStr}
        />
      </div>

      <MonthChips
        basePath="/financeiro/recorrentes"
        currentMonth={focusMonthStr}
        extraParams={{ view: view === "all" ? "all" : undefined }}
      />

      <BigNumber
        value={`R$ ${monthlyTotalExpected.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        sub={`mensais em ${focusMonthStr.split("-").reverse().join("/")} · ${monthlyPaid} pagos · ${monthlyOverdue} atrasados`}
      />

      <RecurringClient
        monthly={monthly}
        yearly={yearly}
        inactive={inactive}
        focusMonth={focusMonthStr}
        focusYear={focusYear}
        showOwner={view === "all"}
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
            color: resolveCategoryColor(c, parent),
            kind: c.kind,
          };
        })}
      />
    </ScreenShell>
  );
}
