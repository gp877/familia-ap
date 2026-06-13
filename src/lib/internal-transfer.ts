import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, invoices, transactions } from "@/db/schema";

export type InternalTransferType =
  | "card_payment"
  | "card_payment_received"
  | "pix_refund"
  | "annuity_bonus"
  | "manual";

/**
 * Resultado da detecção da linha:
 * - `solo`: marca como interno SEM exigir par (pagamento de fatura — o "par"
 *   é a fatura inteira, tratada pelo linker `linkCardPaymentsToInvoices`).
 * - `pair_candidate`: marca como candidato. SÓ vira interno se o pair-matcher
 *   achar o débito correspondente. Sem par = lançamento real (não interno).
 * - `none`: lançamento normal.
 */
export type DetectionResult =
  | { kind: "solo"; type: InternalTransferType }
  | { kind: "pair_candidate"; type: InternalTransferType }
  | { kind: "none" };

/**
 * Detecta — determinístico — o tipo de tratamento de uma linha. Note que
 * estornos e bonificações vêm como `pair_candidate` (NÃO marca como interno
 * automaticamente). O pair-matcher decide depois se vira interno.
 */
export function detectInternalTransfer(
  rawDescription: string,
  kind: "debit" | "credit",
  source: "bank_statement" | "credit_card_invoice" | "other"
): DetectionResult {
  const raw = rawDescription.toLowerCase();

  // 1. Pagamento de fatura no extrato → SOLO (par é a invoice inteira)
  if (
    source === "bank_statement" &&
    kind === "debit" &&
    /\b(debito|deb|pagamento|pgto)\s*fatura\b/i.test(raw) &&
    /\bcartao|cartão\b/i.test(raw)
  ) {
    return { kind: "solo", type: "card_payment" };
  }

  // 2. "Pagamento Recebido" na fatura → SOLO (par é a invoice inteira)
  if (
    source === "credit_card_invoice" &&
    kind === "credit" &&
    /\bpagamento\s+recebido\b/i.test(raw)
  ) {
    return { kind: "solo", type: "card_payment_received" };
  }

  // 3. Estorno PIX → CANDIDATO (precisa achar débito PIX par)
  if (
    source === "bank_statement" &&
    kind === "credit" &&
    /\bestorno\s+pix\b/i.test(raw)
  ) {
    return { kind: "pair_candidate", type: "pix_refund" };
  }

  // 4. Anuidade bonificação na fatura → CANDIDATO (precisa achar parcela par)
  if (
    source === "credit_card_invoice" &&
    kind === "credit" &&
    /\banuidade\b.*\bbonifica/i.test(raw)
  ) {
    return { kind: "pair_candidate", type: "annuity_bonus" };
  }

  return { kind: "none" };
}

/**
 * Extrai o "nome do par" do rawDescription pra matching de estornos PIX.
 * Padrão Unicred: "ESTORNO PIX PAGO ( Doc.: DEB PIX / CARLOS EDUARDO ALVES )"
 *                "DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX / CARLOS EDUARDO ALVES )"
 * Ambas mencionam o mesmo nome. Captura o que vem depois de "/ ".
 */
function extractCounterparty(rawDescription: string): string | null {
  const m = /\/\s*([^)/]+?)\s*\)/.exec(rawDescription);
  if (!m) return null;
  return m[1].trim().toLowerCase();
}

/**
 * Pair-matcher: pra cada transação `pair_candidate` que ainda não está pareada,
 * busca o débito par no mesmo household. Se achar par, marca AMBOS como
 * `isInternalTransfer=true` + `internalPairId` cruzado.
 *
 * Critério do par (decidido pelo usuário):
 * - Valor exato (até 1 centavo)
 * - Data ±10 dias da candidate
 * - Mesmo "counterparty" (nome após "/" no rawDescription) quando aplicável
 * - kind oposto (candidate é credit → par é debit)
 *
 * IGNORA transações `markedManuallyAt` — usuário no controle vence o auto.
 *
 * Retorna número de pares formados.
 */
export async function pairInternalCandidates(
  householdId: string
): Promise<number> {
  // Candidatos: têm internalTransferType setado (de detect), mas isInternalTransfer
  // ainda false (não foi pareado ainda) e não foram tocados manualmente.
  const candidates = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, householdId),
      eq(transactions.isInternalTransfer, false),
      isNull(transactions.markedManuallyAt),
      sql`${transactions.internalTransferType} in ('pix_refund', 'annuity_bonus')`,
      isNull(transactions.internalPairId)
    ),
  });

  if (candidates.length === 0) return 0;

  let paired = 0;
  for (const cand of candidates) {
    const candAmount = parseFloat(cand.amount);
    const candDate = new Date(cand.occurredOn);
    const dayMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(candDate.getTime() - 10 * dayMs);
    const windowEnd = new Date(candDate.getTime() + 10 * dayMs);
    const candCounterparty = extractCounterparty(cand.rawDescription);

    // Busca débitos do household no período, mesmo valor exato, ainda não
    // pareados (livres pra serem par).
    const candidatePartners = await db.query.transactions.findMany({
      where: and(
        eq(transactions.householdId, householdId),
        eq(transactions.kind, "debit"),
        eq(transactions.amount, cand.amount),
        eq(transactions.isInternalTransfer, false),
        isNull(transactions.internalPairId),
        gte(transactions.occurredOn, windowStart),
        lte(transactions.occurredOn, windowEnd),
        ne(transactions.id, cand.id)
      ),
    });

    let partner: typeof candidatePartners[number] | null = null;

    if (cand.internalTransferType === "pix_refund") {
      // Estorno PIX: precisa do mesmo nome (counterparty) no rawDescription
      if (!candCounterparty) continue;
      partner =
        candidatePartners.find((p) => {
          const pc = extractCounterparty(p.rawDescription);
          return pc && pc === candCounterparty;
        }) ?? null;
    } else if (cand.internalTransferType === "annuity_bonus") {
      // Anuidade: o par é "Anuidade - parcela" do mesmo valor
      partner =
        candidatePartners.find((p) =>
          /\banuidade\b/i.test(p.rawDescription) &&
          !/\bbonifica/i.test(p.rawDescription)
        ) ?? null;
    }

    if (partner) {
      // Marca ambos como internos + pair cruzado em uma transação
      await db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({
            isInternalTransfer: true,
            internalPairId: partner!.id,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, cand.id));
        await tx
          .update(transactions)
          .set({
            isInternalTransfer: true,
            internalPairId: cand.id,
            // Se o par não tinha tipo, herda. Se já tinha (ex: foi candidate
            // também), preserva.
            internalTransferType: partner!.internalTransferType ?? cand.internalTransferType,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, partner!.id));
      });
      paired++;
    }
  }

  return paired;
}

/**
 * Override manual: marca uma transação como interna (sem auto-detecção).
 * Opcionalmente vincula a um par. Usado pelo botão "marcar como interna" na UI.
 */
export async function manuallyMarkInternal(
  transactionId: string,
  pairId: string | null
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        isInternalTransfer: true,
        internalTransferType: "manual",
        internalPairId: pairId,
        markedManuallyAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    // Se vinculou um par, atualiza o par também (recíproco)
    if (pairId) {
      await tx
        .update(transactions)
        .set({
          isInternalTransfer: true,
          internalTransferType: "manual",
          internalPairId: transactionId,
          markedManuallyAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, pairId));
    }
  });
}

/**
 * Override manual reverso: desfaz a marcação de interna. Se havia par,
 * desfaz o par também (libera ambas as transações). Marca como tocada
 * manualmente pro auto-detector não re-marcar.
 */
export async function manuallyUnmarkInternal(transactionId: string): Promise<void> {
  const target = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!target) return;

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        isInternalTransfer: false,
        internalTransferType: null,
        internalPairId: null,
        markedManuallyAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    if (target.internalPairId) {
      await tx
        .update(transactions)
        .set({
          isInternalTransfer: false,
          internalTransferType: null,
          internalPairId: null,
          markedManuallyAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, target.internalPairId));
    }
  });
}

/**
 * Tenta vincular pagamentos de fatura (no extrato) com a fatura correspondente
 * (já cadastrada). Usa `invoices.paidByTransactionId` — NÃO mexe em
 * `transactions.invoiceId` (que é semanticamente "item desta fatura").
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
  // Pool de candidatos a pagamento de fatura. Inclui:
  // 1. Tx com internalTransferType=card_payment (detectadas pelo regex no upload
  //    via "DEBITO FATURA" etc) — confiança alta, critério ±10 dias.
  // 2. Tx do extrato (kind=debit, sem invoiceId, conta NÃO-cartão) — pode ser
  //    pagamento que o detector de texto não pegou. Critério mais apertado
  //    aplicado no match abaixo (±5 dias do vencimento).
  const detectedPayments = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, householdId),
      eq(transactions.internalTransferType, "card_payment")
    ),
  });
  // Conta-corrente IDs (não-cartão) pra filtrar pool expandido
  const nonCardAccounts = await db.query.bankAccounts.findMany({
    where: and(
      eq(bankAccounts.householdId, householdId),
      ne(bankAccounts.type, "credit_card")
    ),
  });
  const nonCardAccountIds = nonCardAccounts.map((a) => a.id);
  const extractedDebits = nonCardAccountIds.length > 0
    ? await db.query.transactions.findMany({
        where: and(
          eq(transactions.householdId, householdId),
          eq(transactions.kind, "debit"),
          isNull(transactions.invoiceId),
          eq(transactions.isInternalTransfer, false),
          inArray(transactions.bankAccountId, nonCardAccountIds)
        ),
      })
    : [];
  const detectedIds = new Set(detectedPayments.map((t) => t.id));
  const expandedPool = extractedDebits.filter((t) => !detectedIds.has(t.id));
  const allCardPayments = [...detectedPayments, ...expandedPool];

  if (allCardPayments.length === 0) return 0;

  // Invoices sem pagamento vinculado
  const openInvoices = await db.query.invoices.findMany({
    where: and(
      eq(invoices.householdId, householdId),
      isNull(invoices.paidByTransactionId)
    ),
  });

  if (openInvoices.length === 0) return 0;

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

    const match = allCardPayments.find((tx) => {
      if (usedTxIds.has(tx.id)) return false;
      const txAmount = parseFloat(tx.amount);
      if (Math.abs(invAmount - txAmount) > 0.01) return false;
      const txDate = new Date(tx.occurredOn);
      // Critério MAIS APERTADO pro pool expandido (tx que NÃO foi detectada
      // como card_payment pelo regex). Diminui o risco de bater por acaso
      // com uma despesa que casualmente tenha o mesmo valor da fatura.
      const isFromExpandedPool = !detectedIds.has(tx.id);
      const dueWindowDays = isFromExpandedPool ? 5 : 10;
      if (!inv.dueDate) {
        // Sem dueDate: fatura é paga no MÊS SEGUINTE à competência.
        // Aceitamos pagamento no mesmo mês (raro) OU no mês seguinte
        // (caso comum — gastos em maio, pagamento em junho).
        const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}`;
        if (inv.referenceMonth === txMonth) return true;
        const [yStr, mStr] = inv.referenceMonth.split("-");
        const refDate = new Date(Number(yStr), Number(mStr) - 1, 1);
        refDate.setMonth(refDate.getMonth() + 1);
        const nextMonth = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
        return nextMonth === txMonth;
      }
      const invDue = new Date(inv.dueDate);
      const diffDays = Math.abs(
        (invDue.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays <= dueWindowDays;
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
      // Marca como interna + grava internalTransferType pra auditoria
      // (importante quando vem do pool expandido, que ainda não tinha tipo)
      if (!match.isInternalTransfer || !match.internalTransferType) {
        await db
          .update(transactions)
          .set({
            isInternalTransfer: true,
            internalTransferType: "card_payment",
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, match.id));
      }
      usedTxIds.add(match.id);
      linked++;
    }
  }

  return linked;
}

/**
 * Reconciliação de bonificações órfãs de uma fatura.
 *
 * Cenário real: o PDF tem a COBRANÇA da anuidade (+R$ 15) e a BONIFICAÇÃO
 * (−R$ 15) em linhas separadas que se cancelam. Se a extração perder a
 * cobrança, a bonificação fica "real" sem par e a soma das linhas diverge
 * do total oficial do PDF exatamente pelo valor dela.
 *
 * Quando (total oficial − soma das linhas) == soma das bonificações órfãs,
 * marcamos as bonificações como INTERNAS — elas cancelam cobranças que
 * existem no PDF (só não foram extraídas). A soma volta a bater sem o
 * usuário lançar nada manualmente.
 *
 * Conservador: só age com match EXATO (±1 centavo) e nunca toca em tx
 * com markedManuallyAt (override do usuário prevalece).
 */
export async function reconcileAnnuityOrphans(invoiceId: string): Promise<number> {
  const inv = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });
  if (!inv?.totalAmount) return 0;
  const official = parseFloat(inv.totalAmount);

  const txs = await db.query.transactions.findMany({
    where: eq(transactions.invoiceId, invoiceId),
  });
  const realDebit = txs
    .filter((t) => t.kind === "debit" && !t.isInternalTransfer && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const realCredit = txs
    .filter((t) => t.kind === "credit" && !t.isInternalTransfer && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const computed = realDebit - realCredit;
  const diff = official - computed;
  if (diff < 0.009) return 0; // soma já bate (ou está acima — outro problema)

  // Bonificações órfãs: créditos de anuidade/bonificação que o pair-matcher
  // NÃO conseguiu parear (sem cobrança extraída) e que o usuário não tocou
  // manualmente. Pega pelo tipo detectado OU pela descrição — o detector às
  // vezes perde uma variação ("Anuidade" seco, sem a palavra bonificação).
  const ANUIDADE_RE = /anuidade|bonifica/i;
  const orphans = txs.filter(
    (t) =>
      t.kind === "credit" &&
      !t.isInternalTransfer &&
      (t.internalTransferType === "annuity_bonus" ||
        ANUIDADE_RE.test(t.description) ||
        ANUIDADE_RE.test(t.rawDescription)) &&
      !t.markedManuallyAt &&
      t.status !== "ignored"
  );
  if (orphans.length === 0) return 0;
  const orphanSum = orphans.reduce((s, t) => s + parseFloat(t.amount), 0);
  if (Math.abs(orphanSum - diff) > 0.01) return 0; // não explica a diferença — não mexe

  for (const t of orphans) {
    await db
      .update(transactions)
      .set({ isInternalTransfer: true, updatedAt: new Date() })
      .where(eq(transactions.id, t.id));
  }
  return orphans.length;
}
