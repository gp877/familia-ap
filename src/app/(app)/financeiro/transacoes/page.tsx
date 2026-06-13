import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { AccountPicker, expandAccountFilter } from "@/components/ap/account-picker";
import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { TransactionsMultiSelect } from "@/components/ap/transactions-multi-select";

import { InlineNewTransaction } from "./inline-new-transaction";
import { resolveCategoryColor } from "@/lib/category-colors";
import { auth } from "@/auth";
import type { CategoryOption } from "@/components/category-select";
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
  // Filtro de conta — preserva o vínculo conta→cartão: selecionar a conta
  // raiz traz o extrato dela + as faturas dos cartões filhos (que vão pros
  // 2 blocos separados abaixo). Selecionar um cartão específico traz só ele.
  const expandedAccountIds = expandAccountFilter(allAccounts, sp.account ?? null);
  if (expandedAccountIds) {
    conds.push(inArray(transactions.bankAccountId, expandedAccountIds));
  }

  // 2ª rodada: transações com filtro resolvido. ORDEM ASC pra ler de
  // cima pra baixo na sequência cronológica (dia 1 → dia 31).
  const txs = await db.query.transactions.findMany({
    where: and(...conds),
    // Cronológico ASC (dia 1 no topo, dia 31 embaixo) com sourceOrder do
    // PDF como tiebreaker pro MESMO dia. Não usar uploadId no ordering —
    // UUIDs são aleatórios e se houver 2 uploads no mês, separa as tx
    // numa ordem sem sentido (29/05 antes de 04/05).
    orderBy: [
      asc(transactions.occurredOn),
      asc(transactions.sourceOrder),
      asc(transactions.createdAt),
    ],
    limit: 500,
  });

  // ── Faturas do mês ─────────────────────────────────────────────
  // CONCEITO: uma fatura tem MÊS DE COMPETÊNCIA (mês das compras).
  // Quando o user filtra por maio, queremos ver as faturas de competência
  // MAIO — independentemente de quando algumas tx individuais (parcelas
  // antigas, ajustes) caem no calendário.
  //
  // Antes esse bloco filtrava por "faturas que têm AO MENOS uma tx no mês"
  // e somava só essas tx — resultado: uma fatura de R$ 8 mil aparecia como
  // "R$ 30,99 / 2 lançamentos" se só 2 das suas tx caíam no mês visualizado.
  // Conceitualmente errado: fatura é um documento ÚNICO, não fragmento.
  //
  // Filtro por conta: se o user filtrou por uma conta, mostramos as faturas
  // dos CARTÕES dessa conta (filhos com type='credit_card'), ou da própria
  // conta se ela já é um cartão.
  let invoiceAccountIds: string[] | null = null;
  if (sp.account) {
    const sel = allAccounts.find((a) => a.id === sp.account);
    if (sel?.type === "credit_card") {
      invoiceAccountIds = [sel.id];
    } else {
      invoiceAccountIds = allAccounts
        .filter((a) => a.parentAccountId === sp.account && a.type === "credit_card")
        .map((a) => a.id);
    }
  }
  const invoiceConds = [
    eq(invoices.householdId, dbUser.householdId),
    showAll ? sql`true` : eq(invoices.referenceMonth, selectedMonth),
  ];
  if (invoiceAccountIds !== null) {
    if (invoiceAccountIds.length === 0) {
      invoiceConds.push(sql`false`);
    } else {
      invoiceConds.push(inArray(invoices.bankAccountId, invoiceAccountIds));
    }
  }
  const invoicesForMonth = await db.query.invoices.findMany({
    where: and(...invoiceConds),
  });

  // Total + contagem REAL por invoice (todas as tx, não só as do mês
  // visualizado). Soma só débito não-interno — pagamento recebido e
  // estornos não inflam o valor da fatura.
  const invoiceTotalsRows = invoicesForMonth.length > 0
    ? await db
        .select({
          invoiceId: transactions.invoiceId,
          totalDebit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' and ${transactions.isInternalTransfer} = false then ${transactions.amount} else 0 end), 0)`,
          countAll: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .where(
          inArray(
            transactions.invoiceId,
            invoicesForMonth.map((i) => i.id)
          )
        )
        .groupBy(transactions.invoiceId)
    : [];
  const invoiceTotalsById = new Map(
    invoiceTotalsRows.map((r) => [
      r.invoiceId ?? "",
      { total: parseFloat(r.totalDebit), count: r.countAll },
    ])
  );

  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
    name: c.name,
    parentId: c.parentId,
    color: resolveCategoryColor(c, c.parent),
    kind: c.kind,
    notes: c.notes,
  }));

  // Totais do header. Calculados DEPOIS de separar statement vs invoice
  // (logo abaixo em "Prepare data for client component") porque o header
  // representa só o EXTRATO da conta filtrada — não pode somar as tx das
  // FATURAS dos cartões filhos (que aparecem em bloco separado abaixo).
  //
  // Antes esse cálculo usava `txs` direto, que incluía os cartões filhos
  // quando o user filtrava pela conta-raiz (UNICRED CC puxava também os
  // cartões UNICRED VISA, MASTER etc via expandAccountFilter). Isso fazia
  // o header e o footer da lista discordarem (~5k de diferença).
  //
  // Internas (pagamento de fatura, estornos, bonificações) e ignored não
  // entram em despesa/receita real.
  // (Movido pra baixo — depende de allStatementTxs)
  let totalDebit = 0;
  let totalCredit = 0;

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
    invoiceId: tx.invoiceId,
    isInternalTransfer: tx.isInternalTransfer,
    internalTransferType: tx.internalTransferType,
    splits: (tx.splits as Array<{ categoryId: string; amount: string; note?: string }> | null) ?? null,
  }));

  // Separa transações em dois fluxos: EXTRATO (CC, poupança, investimento)
  // e FATURA (cartão). Cada uma tem sua sequência de dias e fluxo próprio.
  const accountTypeById = new Map(allAccounts.map((a) => [a.id, a.type]));
  const statementTxs = txsForClient.filter(
    (t) => t.bankAccountId && accountTypeById.get(t.bankAccountId) !== "credit_card"
  );
  const invoiceTxs = txsForClient.filter(
    (t) => t.bankAccountId && accountTypeById.get(t.bankAccountId) === "credit_card"
  );
  // Transações órfãs (sem conta) caem no extrato por default
  const orphanTxs = txsForClient.filter((t) => !t.bankAccountId);
  const allStatementTxs = [...statementTxs, ...orphanTxs];

  // Agora SIM os totais do header — só do extrato, ignorando ignored e
  // internas (pagamento de fatura etc).
  for (const t of allStatementTxs) {
    if (t.status === "ignored") continue;
    if (t.isInternalTransfer) continue;
    const amt = parseFloat(t.amount);
    if (t.kind === "debit") totalDebit += amt;
    else totalCredit += amt;
  }

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
      <SectionRow
        icon="bag"
        label={activeAccount ? activeAccount.name : "Transações"}
        action={
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              href="/financeiro/categorias/regras"
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "color-mix(in oklab, var(--accent) 14%, transparent)",
                color: "var(--accent)",
                fontSize: 10.5,
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.01em",
              }}
              title="Gerenciar regras de categorização"
            >
              ⚙ regras
            </Link>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {txs.length} de {totalAll}
            </span>
          </span>
        }
      />

      {/* Conta = PRIMEIRA ação. Modo flat: tudo lado a lado, sem
          linha separada "cartões" — porque a tela já separa visualmente
          Extrato e Fatura em blocos distintos abaixo. */}
      <AccountPicker
        basePath="/financeiro/transacoes"
        flat
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

      {/* Saldo do período (receitas − despesas). Sinal indica direção:
          + verde quando sobrou, − padrão quando faltou. Detalhes de
          receitas e despesas vão no sub. */}
      {(() => {
        const saldo = totalCredit - totalDebit;
        const positive = saldo >= 0;
        return (
          <div style={{ padding: "12px 20px 4px" }}>
            <div
              className="ap-num"
              style={{
                fontSize: 28,
                color: positive ? "var(--ok)" : "var(--ink)",
              }}
            >
              {positive ? "+" : "−"} R$ {formatBRL(Math.abs(saldo))}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
              <span style={{ color: "var(--ok)" }}>+R$ {formatBRL(totalCredit)}</span>
              {" receitas · "}
              <span style={{ color: "var(--alert)" }}>−R$ {formatBRL(totalDebit)}</span>
              {" despesas"}
              {activeAccount ? ` · ${activeAccount.name}` : ""}
            </div>
          </div>
        );
      })()}

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

      {/* EXTRATO — conta corrente/poupança/investimento. Tem sua própria
          sequência de dias e fluxo, separado da fatura do cartão.
          Sempre renderiza (mesmo vazio) pra exibir o botão "+ lançar". */}
      {(() => {
        const statementAccounts = allAccounts
          .filter((a) => a.type !== "credit_card")
          .map((a) => ({ id: a.id, name: a.name, type: a.type }));
        const statementDefaultAcc = activeAccount && activeAccount.type !== "credit_card"
          ? activeAccount.id
          : null;
        const showStatementBlock = allStatementTxs.length > 0 || statementAccounts.length > 0;
        if (!showStatementBlock) return null;
        return (
          <div style={{ marginTop: 16 }}>
            <SectionRow
              icon="bank"
              label="Extrato"
              action={
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                  {allStatementTxs.length} lançamento{allStatementTxs.length === 1 ? "" : "s"}
                </span>
              }
            />
            <div style={{ padding: "0 20px 4px" }}>
              <InlineNewTransaction
                accounts={statementAccounts}
                categoryOptions={categoryOptions}
                defaultAccountId={statementDefaultAcc}
                blockLabel="Extrato"
              />
            </div>
            {allStatementTxs.length > 0 && (
              <TransactionsMultiSelect
                transactions={allStatementTxs}
                categoryOptions={categoryOptions}
              />
            )}
          </div>
        );
      })()}

      {/* FATURAS DO MÊS — cartão resumo POR FATURA INTEIRA (não fragmento).
          Filtra por COMPETÊNCIA = mês visualizado. Total e contagem vêm
          de query agregada sobre TODAS as tx da fatura, independente de
          quando cada tx caiu no calendário. */}
      {(() => {
        // Tx órfãs do cartão (sem invoiceId) — sinal de problema. Não inflam
        // total nem aparecem na lista, só mostram um alerta pra subir a fatura.
        const orphanCardTxs = invoiceTxs.filter((t) => !t.invoiceId);

        if (invoicesForMonth.length === 0 && orphanCardTxs.length === 0) return null;

        return (
          <div style={{ marginTop: 16 }}>
            <SectionRow
              icon="bank"
              label="Faturas do mês"
              action={
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                  {invoicesForMonth.length} fatura{invoicesForMonth.length === 1 ? "" : "s"}
                </span>
              }
            />
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {invoicesForMonth.map((inv) => {
                const acc = inv.bankAccountId
                  ? allAccounts.find((a) => a.id === inv.bankAccountId)
                  : null;
                const agg = invoiceTotalsById.get(inv.id) ?? { total: 0, count: 0 };
                return (
                  <Link
                    key={inv.id}
                    href={`/financeiro/faturas/${inv.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--card)",
                      border: "0.5px solid var(--line-d)",
                      borderRadius: 14,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
                        {acc?.name ?? "Cartão"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {agg.count} lançamento{agg.count === 1 ? "" : "s"}
                        {inv.referenceMonth ? ` · competência ${inv.referenceMonth.split("-").reverse().join("/")}` : ""}
                        {inv.status === "paid" ? " · paga" : inv.status === "open" ? " · em aberto" : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div className="ap-num" style={{ fontSize: 16, fontWeight: 700, color: "var(--alert)" }}>
                        −R$ {formatBRL(agg.total)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 2, fontWeight: 700 }}>
                        ver fatura →
                      </div>
                    </div>
                  </Link>
                );
              })}
              {orphanCardTxs.length > 0 && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "color-mix(in oklab, var(--alert) 12%, var(--card))",
                    border: "1px dashed var(--alert)",
                    borderRadius: 14,
                    fontSize: 11.5,
                    color: "var(--alert)",
                  }}
                >
                  {orphanCardTxs.length} lançamento{orphanCardTxs.length === 1 ? "" : "s"} de cartão sem fatura vinculada — suba a fatura em <code>/financeiro/faturas/upload</code>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </ScreenShell>
  );
}
