"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, categories, categoryRules, transactions, users } from "@/db/schema";
import {
  manuallyMarkInternal,
  manuallyUnmarkInternal,
} from "@/lib/internal-transfer";
import { extractMatchPattern } from "@/lib/categorization";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

export async function setTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  createRule: boolean
): Promise<{ ruleCreated: boolean; appliedToOthers: number }> {
  const { householdId } = await requireUser();

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }

  // Categorizar CONFIRMA a transação (revisão implícita: se o usuário deu
  // categoria, ele olhou pra ela). Descategorizar volta pra pendente.
  // Ignored é estado deliberado — não mexemos.
  const nextStatus =
    tx.status === "ignored" ? undefined : categoryId ? ("confirmed" as const) : ("pending" as const);
  await db
    .update(transactions)
    .set({
      categoryId,
      ...(nextStatus ? { status: nextStatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId));

  let ruleCreated = false;
  let appliedToOthers = 0;

  // Se categoryId informado E createRule:
  // 1. Cria regra "contains" pra futuros uploads (já existia)
  // 2. APLICA RETROATIVAMENTE em tx similares JÁ NO BANCO (extrato E faturas)
  //    que estão sem categoria. Match exato de descrição = decisão óbvia.
  //    Respeitamos: tx não-internas, status != ignored, sem categoria ainda.
  if (categoryId && createRule) {
    // Pattern inteligente: tira o prefixo variável dos bancos e fica só com
    // o trecho distintivo (nome do destinatário num PIX, etc). Pra faturas
    // de cartão a descrição já é estável → pattern = descrição inteira.
    const smartPattern = extractMatchPattern(tx.description);
    const patternLower = smartPattern.toLowerCase();

    const existing = await db.query.categoryRules.findFirst({
      where: and(
        eq(categoryRules.householdId, householdId),
        eq(categoryRules.pattern, smartPattern)
      ),
    });
    if (!existing) {
      await db.insert(categoryRules).values({
        householdId,
        categoryId,
        pattern: smartPattern,
        matchType: "contains",
        lastAppliedAt: new Date(),
      });
      ruleCreated = true;
    } else {
      // Regra já existia — marca como usada agora.
      await db
        .update(categoryRules)
        .set({ lastAppliedAt: new Date() })
        .where(eq(categoryRules.id, existing.id));
    }

    // Busca em description E rawDescription (extratos PIX colocam o nome em
    // raw com formato diferente do description). Aplica em tx do extrato E
    // de faturas — TransactionsMultiSelect é compartilhado entre as duas
    // telas, então essa action serve as duas.
    //
    // Guardas: padrão < 4 chars não propaga (curto demais casa coisa errada);
    // % e _ são escapados senão viram coringa no LIKE ("50%" casaria tudo).
    const likeSafe = patternLower.replace(/[\\%_]/g, (c) => "\\" + c);
    if (patternLower.length >= 4) {
      const others = await db.query.transactions.findMany({
        where: and(
          eq(transactions.householdId, householdId),
          sql`(LOWER(${transactions.description}) LIKE ${"%" + likeSafe + "%"} OR LOWER(${transactions.rawDescription}) LIKE ${"%" + likeSafe + "%"})`,
          isNull(transactions.categoryId),
          eq(transactions.isInternalTransfer, false),
          ne(transactions.status, "ignored"),
          ne(transactions.id, transactionId)
        ),
        columns: { id: true },
      });
      if (others.length > 0) {
        // Aplicação retroativa também confirma — categorizada = revisada.
        await db
          .update(transactions)
          .set({ categoryId, status: "confirmed", updatedAt: new Date() })
          .where(
            inArray(
              transactions.id,
              others.map((o) => o.id)
            )
          );
        appliedToOthers = others.length;
      }
    }
  }

  revalidatePath("/financeiro/transacoes");
  return { ruleCreated, appliedToOthers };
}

/**
 * Marca transação como interna manualmente (override do detector automático).
 * Se pairId informado, pareia ambas. Se não, marca solo (sem par).
 */
export async function markAsInternalManually(
  transactionId: string,
  pairId: string | null
) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  if (pairId) {
    const pair = await db.query.transactions.findFirst({
      where: eq(transactions.id, pairId),
    });
    if (!pair || pair.householdId !== householdId) {
      throw new Error("Par não encontrado");
    }
  }
  await manuallyMarkInternal(transactionId, pairId);
  revalidatePath("/financeiro/transacoes");
  revalidatePath(`/financeiro/faturas`);
}

/**
 * Desfaz a marcação de interna manualmente. Se havia par, desfaz ambas.
 * Marca como tocada manualmente pro auto-detector não re-marcar em re-runs.
 */
export async function unmarkAsInternalManually(transactionId: string) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await manuallyUnmarkInternal(transactionId);
  revalidatePath("/financeiro/transacoes");
  revalidatePath(`/financeiro/faturas`);
}

/**
 * Cria uma transação manualmente (sem upload de PDF). Usada quando o usuário
 * nota uma linha faltante. Aplica auto-categorização das regras se nenhuma cat
 * for informada.
 */
export async function createManualTransaction(input: {
  bankAccountId: string;
  occurredOn: string; // YYYY-MM-DD
  description: string;
  amount: string; // "1234.56"
  kind: "debit" | "credit";
  categoryId?: string | null;
  notes?: string;
}) {
  const { userId, householdId } = await requireUser();
  if (!input.bankAccountId) throw new Error("Conta obrigatória");
  if (!input.description.trim()) throw new Error("Descrição obrigatória");
  if (!input.amount || isNaN(parseFloat(input.amount))) {
    throw new Error("Valor inválido");
  }

  // Posse: conta e categoria precisam ser DESTE household. Sem isso, um id
  // forjado criaria tx em conta alheia ou com categoria de outro household.
  const acc = await db.query.bankAccounts.findFirst({
    where: and(
      eq(bankAccounts.id, input.bankAccountId),
      eq(bankAccounts.householdId, householdId)
    ),
  });
  if (!acc) throw new Error("Conta não encontrada");
  if (input.categoryId) {
    const cat = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, input.categoryId),
        eq(categories.householdId, householdId)
      ),
    });
    if (!cat) throw new Error("Categoria não encontrada");
  }

  let categoryId: string | null = input.categoryId ?? null;
  if (!categoryId) {
    const { applyAutoCategorization } = await import("@/lib/categorization");
    categoryId = await applyAutoCategorization(householdId, input.description);
  }

  const [created] = await db
    .insert(transactions)
    .values({
      householdId,
      bankAccountId: input.bankAccountId,
      uploadId: null,
      invoiceId: null,
      categoryId,
      createdById: userId,
      occurredOn: new Date(input.occurredOn),
      amount: input.amount,
      kind: input.kind,
      description: input.description.trim(),
      rawDescription: input.notes?.trim()
        ? `[manual] ${input.description.trim()} — ${input.notes.trim()}`
        : `[manual] ${input.description.trim()}`,
      status: "confirmed",
    })
    .returning();

  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro");
  return created;
}

/**
 * Define os splits de categoria de uma transação. Valida que a sum bate com
 * o valor (tolerância 1 centavo). Splits vazios → remove split (volta a
 * usar só a categoria principal). Mantém categoryId apontando pra primeira
 * categoria do split (pra retrocompatibilidade com listagens simples).
 */
export async function setTransactionSplits(
  transactionId: string,
  splits: Array<{ categoryId: string; amount: string; note?: string }>
) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }

  if (splits.length === 0) {
    await db
      .update(transactions)
      .set({ splits: null, updatedAt: new Date() })
      .where(eq(transactions.id, transactionId));
    revalidatePath("/financeiro/transacoes");
    return;
  }

  // Soma em CENTAVOS (inteiros) — somar floats acumula erro de arredondamento
  // (10 × R$ 1,11 = 11.099999... e falharia na tolerância).
  const toCents = (v: string) => Math.round(parseFloat(v) * 100);
  const expectedCents = toCents(tx.amount);
  const sumCents = splits.reduce((s, p) => s + toCents(p.amount), 0);
  if (Math.abs(sumCents - expectedCents) > 1) {
    throw new Error(
      `Soma dos splits (R$ ${(sumCents / 100).toFixed(2)}) não bate com o total (R$ ${(expectedCents / 100).toFixed(2)})`
    );
  }

  await db
    .update(transactions)
    .set({
      splits,
      categoryId: splits[0].categoryId, // categoria principal = primeiro split
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/financeiro/transacoes");
}

export async function setTransactionStatus(
  transactionId: string,
  status: "pending" | "confirmed" | "ignored"
) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await db
    .update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/financeiro/transacoes");
}

export async function deleteTransaction(transactionId: string) {
  const { householdId } = await requireUser();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx || tx.householdId !== householdId) {
    throw new Error("Transação não encontrada");
  }
  await db.delete(transactions).where(eq(transactions.id, transactionId));
  revalidatePath("/financeiro/transacoes");
}
