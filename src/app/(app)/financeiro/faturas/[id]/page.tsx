import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { ConfirmSubmitButton } from "@/components/ap/confirm-submit";
import { BackButton, FormField, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  deleteInvoiceForm,
  linkInvoicePayment,
  unlinkInvoicePaymentForm,
} from "@/app/actions/invoices";
import { auth } from "@/auth";
import type { CategoryOption } from "@/components/category-select";
import { TransactionsMultiSelect } from "@/components/ap/transactions-multi-select";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  invoices,
  transactions,
  users,
} from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export default async function FaturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const inv = await db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: { bankAccount: true },
  });
  if (!inv || inv.householdId !== dbUser.householdId) notFound();

  // Transações da fatura
  const items = await db.query.transactions.findMany({
    where: eq(transactions.invoiceId, inv.id),
    orderBy: [desc(transactions.occurredOn)],
  });

  // Categorias pra select
  const allCategories = await db.query.categories.findMany({
    where: eq(categories.householdId, dbUser.householdId),
    with: { parent: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });
  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
    name: c.name,
    parentId: c.parentId,
    color: c.color ?? c.parent?.color ?? null,
    kind: c.kind,
  }));

  // Candidatos a pagamento: transações do extrato (não desta fatura)
  // dentro do range [closingDate, dueDate+15d] aproximadamente
  const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
  const refMonth = inv.referenceMonth;
  const [refY, refM] = refMonth.split("-").map(Number);
  const monthStart = new Date(refY, refM - 1, 1);
  const monthEnd = new Date(refY, refM, 15);

  const paymentCandidates = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, dbUser.householdId),
      eq(transactions.kind, "debit"),
      isNull(transactions.invoiceId),
      gte(transactions.occurredOn, monthStart),
      lte(transactions.occurredOn, monthEnd)
    ),
    orderBy: [desc(transactions.occurredOn)],
    limit: 40,
  });

  // Filtra candidatos cujo valor é próximo do total da fatura (±2%)
  const total = inv.totalAmount ? parseFloat(inv.totalAmount) : 0;
  const closeCandidates = paymentCandidates
    .filter((tx) => {
      const amt = parseFloat(tx.amount);
      if (total === 0) return false;
      const diff = Math.abs(amt - total) / total;
      return diff < 0.02; // 2% de tolerância
    })
    .slice(0, 5);

  // Transação atual de pagamento (se vinculada)
  let paymentTx: typeof transactions.$inferSelect | null = null;
  if (inv.paidByTransactionId) {
    paymentTx =
      (await db.query.transactions.findFirst({
        where: eq(transactions.id, inv.paidByTransactionId),
      })) ?? null;
  }

  const itemsForClient = items.map((tx) => ({
    id: tx.id,
    occurredOn: new Date(tx.occurredOn).toISOString(),
    description: tx.description,
    rawDescription: tx.rawDescription,
    amount: tx.amount,
    kind: tx.kind,
    categoryId: tx.categoryId,
    status: tx.status,
    bankAccountId: tx.bankAccountId,
  }));

  return (
    <ScreenShell
      userQ={`Quanto deu a fatura de ${formatMonth(inv.referenceMonth)}?`}
      insight={
        inv.status === "paid" ? (
          <>
            Fatura quitada
            {paymentTx
              ? ` em ${formatDate(paymentTx.occurredOn)} (R$ ${formatBRL(parseFloat(paymentTx.amount))})`
              : ""}
            .
          </>
        ) : closeCandidates.length > 0 ? (
          <>
            Encontrei {closeCandidates.length} {closeCandidates.length === 1 ? "transação" : "transações"} no extrato com valor parecido. Vincula abaixo.
          </>
        ) : (
          <>
            <b>{items.length}</b> lançamentos · R$ {formatBRL(total)}. Quando pagar pelo extrato, vincula aqui pra marcar como quitada.
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro/faturas" label="Faturas" />
      </div>

      <SectionRow
        icon="bank"
        label={`${inv.bankAccount?.name ?? "Cartão"} · ${formatMonth(inv.referenceMonth)}`}
        action={
          <Pill
            tone={inv.status === "paid" ? "ok" : inv.status === "scheduled" ? "accent" : "alert"}
          >
            {inv.status === "paid" ? "paga" : inv.status === "scheduled" ? "agendada" : "em aberto"}
          </Pill>
        }
      />

      <BigNumber
        value={`R$ ${formatBRL(total)}`}
        sub={`${items.length} lançamentos${inv.dueDate ? ` · vence ${formatDate(inv.dueDate)}` : ""}`}
        accent={inv.status !== "paid"}
      />

      {/* Seção de pagamento */}
      <SectionRow icon="bag" label="Pagamento desta fatura" />
      <div style={{ padding: "0 20px" }}>
        {paymentTx ? (
          <Card pad={14} raised>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{paymentTx.description}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {formatDate(paymentTx.occurredOn)} ·{" "}
                  <span className="ap-num">R$ {formatBRL(parseFloat(paymentTx.amount))}</span>
                </div>
              </div>
              <form action={unlinkInvoicePaymentForm}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <button
                  type="submit"
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "transparent",
                    color: "var(--alert)",
                    border: "1px solid var(--alert)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  desvincular
                </button>
              </form>
            </div>
          </Card>
        ) : (
          <>
            {closeCandidates.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Sugestões (valor próximo no extrato):
                </div>
                {closeCandidates.map((tx) => (
                  <form key={tx.id} action={linkInvoicePayment}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <input type="hidden" name="transactionId" value={tx.id} />
                    <button
                      type="submit"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "var(--card)",
                        color: "var(--ink)",
                        border: "1px solid var(--line-d)",
                        fontSize: 12.5,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{tx.description}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          {formatDate(tx.occurredOn)} ·{" "}
                          <span className="ap-num">
                            R$ {formatBRL(parseFloat(tx.amount))}
                          </span>
                        </div>
                      </span>
                      <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>
                        vincular
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "10px 12px",
                  background: "var(--card)",
                  borderRadius: 12,
                }}
              >
                Sem candidato automático. Vincule manualmente abaixo.
              </div>
            )}

            <form action={linkInvoicePayment} style={{ marginTop: 10 }}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <FormField label="ID da transação manual" hint="cole o UUID se souber qual lançamento é">
                <input name="transactionId" placeholder="uuid..." style={fieldStyle} />
              </FormField>
              <button
                type="submit"
                style={{
                  marginTop: 6,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: "var(--accent)",
                  color: "var(--accent-on)",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Vincular manualmente
              </button>
            </form>
          </>
        )}
      </div>

      <SectionRow icon="bag" label="Lançamentos da fatura" action={`${items.length}`} />
      <TransactionsMultiSelect
        transactions={itemsForClient}
        categoryOptions={categoryOptions}
      />

      <div style={{ padding: "20px" }}>
        <form action={deleteInvoiceForm}>
          <input type="hidden" name="id" value={inv.id} />
          <ConfirmSubmitButton
            confirmMsg="Excluir fatura inteira? Lançamentos ficam mas perdem o vínculo."
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 12,
              background: "transparent",
              color: "var(--alert)",
              border: "1px solid var(--alert)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Excluir fatura
          </ConfirmSubmitButton>
        </form>
      </div>
    </ScreenShell>
  );
}
