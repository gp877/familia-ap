import { and, asc, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { ConfirmSubmitButton } from "@/components/ap/confirm-submit";
import { BackButton } from "@/components/ap/inline-form";
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

  // Transações da fatura — ASC pra ler cronologicamente do dia 1 ao 31.
  const items = await db.query.transactions.findMany({
    where: eq(transactions.invoiceId, inv.id),
    orderBy: [asc(transactions.occurredOn)],
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
  // dentro de uma janela ampla — referenceMonth +/- 1 mês.
  //
  // Priorizamos as da CONTA-MÃE do cartão (a CC que paga a fatura). Se o
  // cartão não tiver conta-mãe vinculada, mostra todas as contas
  // correntes do household.
  const refMonth = inv.referenceMonth;
  const [refY, refM] = refMonth.split("-").map(Number);
  const candidateStart = new Date(refY, refM - 2, 1); // mês anterior
  const candidateEnd = new Date(refY, refM, 28); // até o dia 28 do mês ref

  const cardParentId = inv.bankAccount?.parentAccountId ?? null;
  // Se o cartão tem conta-mãe, lista também outras contas correntes pra
  // o fallback (caso o pagamento tenha saído de outra conta).
  const eligibleAccounts = await db.query.bankAccounts.findMany({
    where: and(
      eq(bankAccounts.householdId, dbUser.householdId),
      ne(bankAccounts.type, "credit_card")
    ),
  });
  const eligibleAccountIds = eligibleAccounts.map((a) => a.id);

  const paymentCandidates = eligibleAccountIds.length > 0
    ? await db.query.transactions.findMany({
        where: and(
          eq(transactions.householdId, dbUser.householdId),
          eq(transactions.kind, "debit"),
          isNull(transactions.invoiceId),
          gte(transactions.occurredOn, candidateStart),
          lte(transactions.occurredOn, candidateEnd),
          inArray(transactions.bankAccountId, eligibleAccountIds)
        ),
        orderBy: [desc(transactions.occurredOn)],
        limit: 50,
      })
    : [];

  // Categoriza candidatos:
  //   • highly-likely: valor ±2% do total da fatura
  //   • parent-account: vieram da conta-mãe do cartão (se houver)
  //   • outros: vieram de outras contas
  const total = inv.totalAmount ? parseFloat(inv.totalAmount) : 0;
  const closeCandidates = paymentCandidates.filter((tx) => {
    const amt = parseFloat(tx.amount);
    if (total === 0) return false;
    return Math.abs(amt - total) / total < 0.02;
  });
  const closeIds = new Set(closeCandidates.map((c) => c.id));
  const otherCandidates = paymentCandidates.filter((tx) => !closeIds.has(tx.id));
  // Põe primeiro os da conta-mãe (se definida)
  const sortedOthers = cardParentId
    ? [...otherCandidates].sort((a, b) => {
        const aFromParent = a.bankAccountId === cardParentId ? -1 : 0;
        const bFromParent = b.bankAccountId === cardParentId ? -1 : 0;
        return aFromParent - bFromParent;
      })
    : otherCandidates;

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
    isInternalTransfer: tx.isInternalTransfer,
    internalTransferType: tx.internalTransferType,
    splits: (tx.splits as Array<{ categoryId: string; amount: string; note?: string }> | null) ?? null,
  }));

  // Total REAL da fatura: débitos - créditos, ambos excluindo internas.
  // Bate com o "TOTAL DESTA FATURA" do PDF (que ignora "Pagamento Recebido"
  // e bonificações).
  const realDebit = items
    .filter((t) => t.kind === "debit" && !t.isInternalTransfer)
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const realCredit = items
    .filter((t) => t.kind === "credit" && !t.isInternalTransfer)
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const realTotal = realDebit - realCredit;

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
        value={`R$ ${formatBRL(realTotal)}`}
        sub={`${items.filter((t) => !t.isInternalTransfer).length} lançamentos reais${inv.dueDate ? ` · vence ${formatDate(inv.dueDate)}` : ""}`}
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
            {closeCandidates.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                  }}
                >
                  sugestões (valor próximo do total)
                </div>
                {closeCandidates.map((tx) => (
                  <PaymentCandidateRow
                    key={tx.id}
                    tx={tx}
                    invoiceId={inv.id}
                    accent
                    accountLabel={
                      eligibleAccounts.find((a) => a.id === tx.bankAccountId)?.name ?? null
                    }
                  />
                ))}
              </div>
            )}

            {sortedOthers.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: closeCandidates.length > 0 ? 18 : 0,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  outros lançamentos do extrato — clique pra vincular
                </div>
                {sortedOthers.slice(0, 20).map((tx) => (
                  <PaymentCandidateRow
                    key={tx.id}
                    tx={tx}
                    invoiceId={inv.id}
                    accountLabel={
                      eligibleAccounts.find((a) => a.id === tx.bankAccountId)?.name ?? null
                    }
                  />
                ))}
                {sortedOthers.length > 20 && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    +{sortedOthers.length - 20} lançamentos mais antigos. Filtre pela conta no /transacoes.
                  </div>
                )}
              </div>
            ) : (
              closeCandidates.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    padding: "14px",
                    background: "var(--card)",
                    borderRadius: 12,
                    textAlign: "center",
                  }}
                >
                  Sem lançamentos de débito não vinculados no extrato pra esse período. Suba um PDF do extrato em <code>/financeiro/upload</code>.
                </div>
              )
            )}
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

/**
 * Linha clicável que vincula uma transação do extrato à fatura como
 * pagamento. Antes era preciso colar o UUID — agora é só clicar.
 */
function PaymentCandidateRow({
  tx,
  invoiceId,
  accountLabel,
  accent = false,
}: {
  tx: typeof transactions.$inferSelect;
  invoiceId: string;
  accountLabel: string | null;
  accent?: boolean;
}) {
  return (
    <form action={linkInvoicePayment}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="transactionId" value={tx.id} />
      <button
        type="submit"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 12,
          background: accent
            ? "color-mix(in oklab, var(--accent) 12%, var(--card))"
            : "var(--card)",
          color: "var(--ink)",
          border: accent
            ? "1px solid var(--accent)"
            : "0.5px solid var(--line-d)",
          fontSize: 12.5,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tx.description}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {formatDate(tx.occurredOn)}
            {accountLabel ? ` · ${accountLabel}` : ""}
          </div>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span
            className="ap-num"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: accent ? "var(--accent)" : "var(--ink)",
            }}
          >
            R$ {formatBRL(parseFloat(tx.amount))}
          </span>
          <span
            style={{
              fontSize: 10,
              color: accent ? "var(--accent)" : "var(--muted)",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            vincular →
          </span>
        </span>
      </button>
    </form>
  );
}
