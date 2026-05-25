import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { BackButton, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createInvoice } from "@/app/actions/invoices";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, invoices, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
}

function formatDueDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export default async function FaturasPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.invoices.findMany({
    where: eq(invoices.householdId, dbUser.householdId),
    with: { bankAccount: true },
    orderBy: [desc(invoices.referenceMonth)],
  });

  const itemCounts = await db
    .select({
      invoiceId: transactions.invoiceId,
      count: sql<number>`count(*)::int`,
      total: sql<string>`sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit')::text`,
    })
    .from(transactions)
    .where(eq(transactions.householdId, dbUser.householdId))
    .groupBy(transactions.invoiceId);

  const itemCountById = new Map<string, { count: number; total: number }>();
  for (const r of itemCounts) {
    if (r.invoiceId) {
      itemCountById.set(r.invoiceId, {
        count: r.count,
        total: r.total ? parseFloat(r.total) : 0,
      });
    }
  }

  const creditCards = await db.query.bankAccounts.findMany({
    where: (a, { and: aa }) =>
      aa(eq(a.householdId, dbUser.householdId!), eq(a.type, "credit_card")),
  });

  const open = all.filter((i) => i.status !== "paid");
  const paid = all.filter((i) => i.status === "paid");
  const totalOpen = open.reduce(
    (sum, i) => sum + (i.totalAmount ? parseFloat(i.totalAmount) : 0),
    0
  );

  return (
    <ScreenShell
      userQ="Quais faturas a gente tem em aberto?"
      insight={
        all.length === 0 ? (
          <>Sem faturas ainda. Quando você sobe uma fatura de cartão pelo upload, ela aparece aqui automaticamente.</>
        ) : open.length > 0 ? (
          <>
            <b>R$ {formatBRL(totalOpen)}</b> em {open.length} {open.length === 1 ? "fatura" : "faturas"} em aberto.
          </>
        ) : (
          <>Todas as faturas estão pagas. 🎉</>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow icon="bank" label="Faturas de cartão" action={`${all.length} no total`} />

      <BigNumber
        value={`R$ ${formatBRL(totalOpen)}`}
        sub={`em aberto · ${open.length} fatura${open.length === 1 ? "" : "s"}`}
        accent={open.length > 0}
      />

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar fatura manualmente">
          <form action={createInvoice}>
              <FormField label="Cartão *">
                <select name="bankAccountId" required style={fieldStyle}>
                  <option value="">Selecione...</option>
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Mês de referência *">
                <input
                  type="month"
                  name="referenceMonth"
                  required
                  defaultValue={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
                  style={fieldStyle}
                />
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Vencimento">
                  <input type="date" name="dueDate" style={fieldStyle} />
                </FormField>
                <FormField label="Fechamento">
                  <input type="date" name="closingDate" style={fieldStyle} />
                </FormField>
              </div>
              <FormField label="Valor total (R$)">
                <input type="number" step="0.01" name="totalAmount" style={fieldStyle} />
              </FormField>
            <SubmitButton>Salvar fatura</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {open.length > 0 && (
        <>
          <SectionRow icon="bank" label="Em aberto" action={`${open.length}`} />
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {open.map((inv) => {
              const stats = itemCountById.get(inv.id);
              return (
                <FaturaCard key={inv.id} inv={inv} stats={stats} />
              );
            })}
          </div>
        </>
      )}

      {paid.length > 0 && (
        <>
          <SectionRow icon="bank" label="Pagas" action={`${paid.length}`} />
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {paid.map((inv) => {
              const stats = itemCountById.get(inv.id);
              return <FaturaCard key={inv.id} inv={inv} stats={stats} paid />;
            })}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

type InvoiceWithBank = typeof invoices.$inferSelect & {
  bankAccount: typeof bankAccounts.$inferSelect | null;
};

function FaturaCard({
  inv,
  stats,
  paid,
}: {
  inv: InvoiceWithBank;
  stats?: { count: number; total: number };
  paid?: boolean;
}) {
  const totalAmount = inv.totalAmount
    ? parseFloat(inv.totalAmount)
    : stats?.total ?? 0;
  return (
    <Link
      href={`/financeiro/faturas/${inv.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card pad={12} raised={!paid}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                {inv.bankAccount?.name ?? "Cartão"}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {formatMonth(inv.referenceMonth)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {stats?.count ?? 0} lançamentos
              {inv.dueDate ? ` · vence ${formatDueDate(inv.dueDate)}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="ap-num" style={{ fontSize: 16 }}>
              R$ {formatBRL(totalAmount)}
            </div>
            <div style={{ marginTop: 4 }}>
              <Pill
                tone={
                  inv.status === "paid"
                    ? "ok"
                    : inv.status === "scheduled"
                      ? "accent"
                      : "alert"
                }
              >
                {inv.status === "paid"
                  ? "paga"
                  : inv.status === "scheduled"
                    ? "agendada"
                    : "em aberto"}
              </Pill>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
