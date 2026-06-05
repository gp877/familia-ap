import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";

import { AccountPicker } from "@/components/ap/account-picker";
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

function formatDueDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

type SearchParams = Promise<{ account?: string }>;

export default async function FaturasPage({
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

  // 1ª rodada paralela: accounts + agregado de contagem por invoice
  // (não dependem do filtro). 2ª rodada: invoices com filtro resolvido.
  const [allAccounts, itemCounts] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
    db
      .select({
        invoiceId: transactions.invoiceId,
        count: sql<number>`count(*)::int`,
        total: sql<string>`sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit')::text`,
      })
      .from(transactions)
      .where(eq(transactions.householdId, dbUser.householdId))
      .groupBy(transactions.invoiceId),
  ]);

  // Resolve filtro: faturas pertencem a credit_cards. Selecionar:
  //   • um cartão → só esse
  //   • uma conta raiz (CC/savings/etc) → faturas dos cartões filhos
  //   • nada → todas
  const filterCardIds: string[] | null = (() => {
    if (!sp.account) return null;
    const sel = allAccounts.find((a) => a.id === sp.account);
    if (!sel) return null;
    if (sel.type === "credit_card") return [sel.id];
    return allAccounts
      .filter((a) => a.parentAccountId === sel.id && a.type === "credit_card")
      .map((a) => a.id);
  })();

  const invoiceWhere = filterCardIds
    ? filterCardIds.length === 0
      ? // conta selecionada sem cartões filhos → lista vazia
        and(eq(invoices.householdId, dbUser.householdId), eq(invoices.id, "00000000-0000-0000-0000-000000000000"))
      : and(
          eq(invoices.householdId, dbUser.householdId),
          inArray(invoices.bankAccountId, filterCardIds)
        )
    : eq(invoices.householdId, dbUser.householdId);

  const all = await db.query.invoices.findMany({
    where: invoiceWhere,
    with: { bankAccount: true },
    orderBy: [desc(invoices.referenceMonth)],
  });

  const itemCountById = new Map<string, { count: number; total: number }>();
  for (const r of itemCounts) {
    if (r.invoiceId) {
      itemCountById.set(r.invoiceId, {
        count: r.count,
        total: r.total ? parseFloat(r.total) : 0,
      });
    }
  }

  const creditCards = allAccounts.filter((a) => a.type === "credit_card");
  const allAccountsById = new Map(allAccounts.map((a) => [a.id, a]));

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

      <AccountPicker
        basePath="/financeiro/faturas"
        accounts={allAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          institution: a.institution,
          lastFour: a.lastFour,
          parentAccountId: a.parentAccountId,
        }))}
        activeAccountId={sp.account ?? null}
      />

      <BigNumber
        value={`R$ ${formatBRL(totalOpen)}`}
        sub={`em aberto · ${open.length} fatura${open.length === 1 ? "" : "s"}`}
        accent={open.length > 0}
      />

      {/* Atalho de upload — fluxo dedicado a fatura. Subir extrato é em /financeiro/upload. */}
      <div style={{ padding: "14px 20px 0" }}>
        <Link
          href="/financeiro/faturas/upload"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "var(--accent-on)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>Subir PDF de fatura</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>↗</span>
        </Link>
      </div>

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
              const parent = inv.bankAccount?.parentAccountId
                ? allAccountsById.get(inv.bankAccount.parentAccountId) ?? null
                : null;
              return (
                <FaturaCard
                  key={inv.id}
                  inv={inv}
                  stats={stats}
                  parentName={parent?.name ?? null}
                />
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
              const parent = inv.bankAccount?.parentAccountId
                ? allAccountsById.get(inv.bankAccount.parentAccountId) ?? null
                : null;
              return (
                <FaturaCard
                  key={inv.id}
                  inv={inv}
                  stats={stats}
                  parentName={parent?.name ?? null}
                  paid
                />
              );
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
  parentName,
  paid,
}: {
  inv: InvoiceWithBank;
  stats?: { count: number; total: number };
  parentName?: string | null;
  paid?: boolean;
}) {
  const totalAmount = inv.totalAmount
    ? parseFloat(inv.totalAmount)
    : stats?.total ?? 0;
  const monthChipColor = paid ? "var(--ok)" : "var(--accent)";
  return (
    <Link
      href={`/financeiro/faturas/${inv.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card pad={12} raised={!paid}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Chip de mês de competência — bem visível à esquerda */}
          <div
            style={{
              flexShrink: 0,
              width: 64,
              padding: "8px 6px",
              borderRadius: 12,
              background: `color-mix(in oklab, ${monthChipColor} 18%, var(--card))`,
              border: `0.5px solid ${monthChipColor}`,
              textAlign: "center",
            }}
          >
            <div
              className="ap-num"
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: monthChipColor,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {formatMonthDay(inv.referenceMonth)}
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: monthChipColor,
                marginTop: 3,
              }}
            >
              {formatMonthYear(inv.referenceMonth)}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                {inv.bankAccount?.name ?? "Cartão"}
              </span>
              {inv.bankAccount?.lastFour && (
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  ····{inv.bankAccount.lastFour}
                </span>
              )}
            </div>
            {parentName && (
              <div
                style={{
                  fontSize: 9.5,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                paga via {parentName}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {stats?.count ?? 0} lançamentos
              {inv.dueDate ? ` · vence ${formatDueDate(inv.dueDate)}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
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

/** "mai" "jun" — abreviação do mês da referenceMonth YYYY-MM. */
function formatMonthDay(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map(Number);
  return new Date(2000, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

/** "2026" — ano da referenceMonth YYYY-MM. */
function formatMonthYear(yyyymm: string): string {
  const [y] = yyyymm.split("-").map(Number);
  return String(y);
}
