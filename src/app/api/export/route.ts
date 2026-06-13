import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  bankAccounts,
  budgets,
  categories,
  categoryRules,
  invoices,
  recurringPayments,
  transactions,
  uploads,
  users,
} from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backup completo dos dados financeiros do household.
 *
 * GET /api/export           → JSON com tudo (contas, categorias, regras,
 *                             faturas, transações, orçamentos, recorrentes)
 * GET /api/export?format=csv → CSV só das transações (pra abrir no Excel)
 *
 * Deletes no app são permanentes (cascata, sem lixeira) — este endpoint é a
 * rede de segurança: baixe periodicamente e guarde o arquivo.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) {
    return NextResponse.json({ error: "Sem household" }, { status: 400 });
  }
  const hh = dbUser.householdId;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  const [accounts, cats, rules, invs, txs, buds, recs, ups] = await Promise.all([
    db.query.bankAccounts.findMany({ where: eq(bankAccounts.householdId, hh) }),
    db.query.categories.findMany({ where: eq(categories.householdId, hh) }),
    db.query.categoryRules.findMany({ where: eq(categoryRules.householdId, hh) }),
    db.query.invoices.findMany({ where: eq(invoices.householdId, hh) }),
    db.query.transactions.findMany({
      where: eq(transactions.householdId, hh),
      orderBy: (t, { asc }) => [asc(t.occurredOn), asc(t.createdAt)],
    }),
    db.query.budgets.findMany({ where: eq(budgets.householdId, hh) }),
    db.query.recurringPayments.findMany({ where: eq(recurringPayments.householdId, hh) }),
    db.query.uploads.findMany({ where: eq(uploads.householdId, hh) }),
  ]);

  if (format === "csv") {
    const accById = new Map(accounts.map((a) => [a.id, a.name]));
    const catById = new Map(cats.map((c) => [c.id, c.name]));
    const esc = (v: string | null | undefined) =>
      v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const header =
      "data;tipo;valor;descricao;descricao_bruta;conta;categoria;status;interna;parcela";
    const lines = txs.map((t) =>
      [
        new Date(t.occurredOn).toISOString().slice(0, 10),
        t.kind === "debit" ? "despesa" : "receita",
        // vírgula decimal — Excel pt-BR entende direto
        String(t.amount).replace(".", ","),
        esc(t.description),
        esc(t.rawDescription),
        esc(t.bankAccountId ? accById.get(t.bankAccountId) : ""),
        esc(t.categoryId ? catById.get(t.categoryId) : ""),
        t.status,
        t.isInternalTransfer ? "sim" : "não",
        t.installmentCurrent && t.installmentTotal
          ? `${t.installmentCurrent}/${t.installmentTotal}`
          : "",
      ].join(";")
    );
    // BOM pra Excel reconhecer UTF-8 (acentos)
    const csv = "﻿" + [header, ...lines].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="familia-ap-transacoes-${stamp}.csv"`,
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    app: "familia-ap",
    version: 1,
    counts: {
      bankAccounts: accounts.length,
      categories: cats.length,
      categoryRules: rules.length,
      invoices: invs.length,
      transactions: txs.length,
      budgets: buds.length,
      recurringPayments: recs.length,
      uploads: ups.length,
    },
    bankAccounts: accounts,
    categories: cats,
    categoryRules: rules,
    invoices: invs,
    transactions: txs,
    budgets: buds,
    recurringPayments: recs,
    // uploads sem o conteúdo do PDF — só metadados + URL do blob
    uploads: ups.map((u) => ({
      id: u.id,
      filename: u.filename,
      blobUrl: u.blobUrl,
      sourceType: u.sourceType,
      status: u.status,
      createdAt: u.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="familia-ap-backup-${stamp}.json"`,
    },
  });
}
