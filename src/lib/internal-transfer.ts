import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { invoices, transactions } from "@/db/schema";

export type InternalTransferType =
  | "card_payment"
  | "card_payment_received"
  | "pix_refund"
  | "annuity_bonus"
  | "manual";

/**
 * Detecta — de forma DETERMINÍSTICA, sem chamar IA — se uma linha extraída é
 * uma "transferência interna". Internas existem pra fechar saldo da conta/cartão
 * mas não representam despesa/receita real, então não entram em DRE/balanço.
 *
 * Casos cobertos:
 * 1. Extrato: "DEBITO FATURA-CARTAO VISA"        → card_payment
 * 2. Fatura:  "Pagamento Recebido"               → card_payment_received
 * 3. Extrato: "ESTORNO PIX"                      → pix_refund
 * 4. Fatura:  "Anuidade - bonificação"           → annuity_bonus
 *
 * Roda DEPOIS da extração da IA — atua como reforço (a IA pode marcar errado,
 * a regex prevalece). Match case-insensitive.
 */
export function detectInternalTransfer(
  rawDescription: string,
  kind: "debit" | "credit",
  source: "bank_statement" | "credit_card_invoice" | "other"
): { isInternal: boolean; type: InternalTransferType | null } {
  const raw = rawDescription.toLowerCase();

  // 1. Pagamento de fatura no extrato (saída de dinheiro pagando o cartão)
  // Padrão Unicred: "DEBITO FATURA- CARTAO VISA ( Doc.: VISA / Fatura Cartão Visa )"
  // Genéricos: "PAGAMENTO FATURA", "DEB FATURA", "DEBITO FATURA"
  if (
    source === "bank_statement" &&
    kind === "debit" &&
    /\b(debito|deb|pagamento|pgto)\s*fatura\b/i.test(raw) &&
    /\bcartao|cartão\b/i.test(raw)
  ) {
    return { isInternal: true, type: "card_payment" };
  }

  // 2. Pagamento da fatura ANTERIOR dentro da fatura atual
  // Padrão Unicred: "Pagamento Recebido" (kind=credit, valor grande)
  if (
    source === "credit_card_invoice" &&
    kind === "credit" &&
    /\bpagamento\s+recebido\b/i.test(raw)
  ) {
    return { isInternal: true, type: "card_payment_received" };
  }

  // 3. Estorno PIX (no extrato): devolução do mesmo PIX que saiu antes
  // Padrão Unicred: "ESTORNO PIX PAGO ( ... )"
  if (
    source === "bank_statement" &&
    kind === "credit" &&
    /\bestorno\s+pix\b/i.test(raw)
  ) {
    return { isInternal: true, type: "pix_refund" };
  }

  // 4. Bonificação de anuidade (na fatura): desconto que zera a anuidade cobrada
  if (
    source === "credit_card_invoice" &&
    kind === "credit" &&
    /\banuidade\b.*\bbonifica/i.test(raw)
  ) {
    return { isInternal: true, type: "annuity_bonus" };
  }

  return { isInternal: false, type: null };
}

/**
 * Tenta vincular pagamentos de fatura (no extrato) com a fatura correspondente
 * (já cadastrada). Usa o campo existente `invoices.paidByTransactionId` — NÃO
 * mexe em `transactions.invoiceId` (que é semanticamente "item desta fatura").
 *
 * Funciona nos dois sentidos:
 *
 * A. Acabei de subir EXTRATO — pra cada transação `card_payment` recém-criada
 *    que ainda não está vinculada a invoice nenhuma, busca uma invoice do mesmo
 *    household com mesmo valor + vencimento próximo, ainda sem pagamento.
 *
 * B. Acabei de subir FATURA — busca pagamentos `card_payment` órfãos que batam
 *    com o total desta nova fatura.
 *
 * Tolerâncias:
 * - Valor exato (até 1 centavo)
 * - Data do pagamento ±10 dias do vencimento da fatura
 *
 * Como efeito colateral, marca a invoice como `paid` quando vincula.
 *
 * Retorna o número de vínculos criados.
 */
export async function linkCardPaymentsToInvoices(
  householdId: string
): Promise<number> {
  // Transações internas tipo card_payment do household inteiro
  const allCardPayments = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, householdId),
      eq(transactions.isInternalTransfer, true),
      eq(transactions.internalTransferType, "card_payment")
    ),
  });

  if (allCardPayments.length === 0) return 0;

  // Invoices sem pagamento vinculado
  const openInvoices = await db.query.invoices.findMany({
    where: and(
      eq(invoices.householdId, householdId),
      isNull(invoices.paidByTransactionId)
    ),
  });

  if (openInvoices.length === 0) return 0;

  // Set de IDs de transações JÁ usadas em alguma invoice (mesmo de outro
  // household? não — escopo do household já filtra). Evita usar a mesma
  // transação pra 2 faturas diferentes.
  const usedTxIds = new Set<string>();
  const allInvoicesWithPayment = await db.query.invoices.findMany({
    where: eq(invoices.householdId, householdId),
  });
  for (const inv of allInvoicesWithPayment) {
    if (inv.paidByTransactionId) usedTxIds.add(inv.paidByTransactionId);
  }

  let linked = 0;
  for (const inv of openInvoices) {
    if (!inv.totalAmount) continue;
    const invAmount = parseFloat(inv.totalAmount);

    // Acha um pagamento que bate
    const match = allCardPayments.find((tx) => {
      if (usedTxIds.has(tx.id)) return false;
      const txAmount = parseFloat(tx.amount);
      if (Math.abs(invAmount - txAmount) > 0.01) return false;
      const txDate = new Date(tx.occurredOn);
      if (!inv.dueDate) {
        const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}`;
        return inv.referenceMonth === txMonth;
      }
      const invDue = new Date(inv.dueDate);
      const diffDays = Math.abs(
        (invDue.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays <= 10;
    });

    if (match) {
      await db
        .update(invoices)
        .set({
          paidByTransactionId: match.id,
          status: "paid",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id));
      usedTxIds.add(match.id);
      linked++;
    }
  }

  return linked;
}

/**
 * Filtro SQL pra excluir internas de relatórios (DRE/balanço/footer).
 */
export const notInternalFilter = sql`is_internal_transfer = false`;
