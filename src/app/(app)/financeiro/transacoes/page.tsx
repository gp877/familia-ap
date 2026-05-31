import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { AccountPicker, expandAccountFilter } from "@/components/ap/account-picker";
import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { TransactionsMultiSelect } from "@/components/ap/transactions-multi-select";
import { auth } from "@/auth";
import type { CategoryOption } from "@/components/category-select";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  transactions,
  users,
} from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthBounds(yyyymm: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

type SearchParams = Promise<{
  month?: string;
  status?: string;
  uncategorized?: string;
  account?: string;
}>;

export default async function TransacoesPage({
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

  // Mês: default = mês atual; "all" pra mostrar todos
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = sp.month ?? currentMonth;
  const showAll = selectedMonth === "all";

  // 1ª rodada paralela: dados independentes do filtro
  const [allAccounts, allCategories, totalAll] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      with: { parent: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.householdId, dbUser.householdId))
      .then((r) => r[0]?.c ?? 0),
  ]);

  const conds = [eq(transactions.householdId, dbUser.householdId)];
  if (!showAll) {
    const bounds = monthBounds(selectedMonth);
    if (bounds) {
      conds.push(gte(transactions.occurredOn, bounds.start));
      conds.push(lte(transactions.occurredOn, bounds.end));
    }
  }
  if (sp.status === "pending" || sp.status === "confirmed" || sp.status === "ignored") {
    conds.push(eq(transactions.status, sp.status));
  }
  if (sp.uncategorized === "1") {
    conds.push(isNull(transactions.categoryId));
  }
  // Expande filtro de conta: se selecionou raiz, inclui cartões filhos.
  const expandedAccountIds = expandAccountFilter(allAccounts, sp.account ?? null);
  if (expandedAccountIds) {
    conds.push(inArray(transactions.bankAccountId, expandedAccountIds));
  }

  // 2ª rodada: transações com filtro resolvido
  const txs = await db.query.transactions.findMany({
    where: and(...conds),
    orderBy: [desc(transactions.occurredOn), desc(transactions.createdAt)],
    limit: 500,
  });

  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
    name: c.name,
    parentId: c.parentId,
    color: c.color ?? c.parent?.color ?? null,
    kind: c.kind,
  }));

  // Totais excluem transferências internas (pagamento de fatura, "Pagamento
  // Recebido", estornos, bonificações) — elas só fecham saldo, não são
  // despesa/receita real.
  const totalDebit = txs
    .filter((t) => t.kind === "debit" && t.status !== "ignored" && !t.isInternalTransfer)
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalCredit = txs
    .filter((t) => t.kind === "credit" && t.status !== "ignored" && !t.isInternalTransfer)
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  const activeAccount = sp.account
    ? allAccounts.find((a) => a.id === sp.account)
    : null;

  if (totalAll === 0) {
    return (
      <ScreenShell
        userQ="Vamos ver as transações?"
        insight={<>Sem nada por aqui. Suba um PDF de extrato ou fatura — a IA extrai tudo em ~30s.</>}
      >
        <SectionRow icon="bag" label="Transações" />
        <BigNumber value="—" sub="nenhuma transação registrada" />
        <div style={{ padding: "20px" }}>
          <Link
            href="/financeiro/upload"
            style={{
              display: "block",
              padding: "14px",
              borderRadius: 16,
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Subir primeiro PDF
          </Link>
        </div>
      </ScreenShell>
    );
  }

  // Prepare data for client component
  const txsForClient = txs.map((tx) => ({
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
  }));

  // Preserva params na navegação
  const preservedParams: Record<string, string | undefined> = {
    status: sp.status,
    uncategorized: sp.uncategorized,
    account: sp.account,
  };

  function statusLink(status: string | null) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, status })) {
      if (v) next.set(k, v as string);
    }
    if (!status) next.delete("status");
    return `/financeiro/transacoes?${next.toString()}`;
  }

  return (
    <ScreenShell
      userQ={
        activeAccount ? `Quero ver os lançamentos de ${activeAccount.name}` : "Me mostra todas as transações"
      }
      insight={
        <>
          Selecione transações pra ver a soma. Clique na categoria pra editar — vira regra automática.
        </>
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow
        icon="bag"
        label={activeAccount ? activeAccount.name : "Transações"}
        action={`${txs.length} de ${totalAll}`}
      />

      {/* Conta = PRIMEIRA ação. Cartões são nível 2, dentro da conta-mãe. */}
      <AccountPicker
        basePath="/financeiro/transacoes"
        accounts={allAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          institution: a.institution,
          lastFour: a.lastFour,
          parentAccountId: a.parentAccountId,
        }))}
        activeAccountId={sp.account ?? null}
        extraParams={{
          month: showAll ? "all" : sp.month,
          status: sp.status,
          uncategorized: sp.uncategorized,
        }}
      />

      <MonthChips
        basePath="/financeiro/transacoes"
        currentMonth={showAll ? currentMonth : selectedMonth}
        extraParams={preservedParams}
      />

      {/* Botão "ano todo" */}
      <div style={{ padding: "0 20px 8px", display: "flex", gap: 6 }}>
        <Link
          href={`/financeiro/transacoes?${new URLSearchParams({ ...preservedParams, month: "all" } as Record<string, string>).toString()}`}
          style={{
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: showAll ? "var(--accent)" : "var(--card)",
            color: showAll ? "var(--accent-on)" : "var(--muted-d)",
            textDecoration: "none",
            border: showAll ? "none" : "1px solid var(--line-d)",
          }}
        >
          Ano todo
        </Link>
      </div>

      <div style={{ padding: "12px 20px 4px" }}>
        <div className="ap-num" style={{ fontSize: 28, color: "var(--ink)" }}>
          − R$ {formatBRL(totalDebit)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          em despesas · receitas: R$ {formatBRL(totalCredit)}
          {activeAccount ? ` · ${activeAccount.name}` : ""}
        </div>
      </div>

      {/* Pills de status */}
      <div style={{ padding: "14px 20px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: null, label: "Todas" },
          { key: "pending", label: "Pendentes" },
          { key: "confirmed", label: "Confirmadas" },
          { key: "ignored", label: "Ignoradas" },
        ].map((s) => {
          const isActive = (sp.status ?? null) === s.key;
          return (
            <Link
              key={s.label}
              href={statusLink(s.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: isActive ? "var(--card)" : "transparent",
                color: isActive ? "var(--ink)" : "var(--muted-d)",
                textDecoration: "none",
                border: "1px solid var(--line-d)",
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 8 }}>
        <TransactionsMultiSelect
          transactions={txsForClient}
          categoryOptions={categoryOptions}
        />
      </div>
    </ScreenShell>
  );
}
