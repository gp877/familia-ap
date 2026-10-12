/**
 * GET /api/agent/transacoes — lançamentos de um período. Somente leitura.
 *
 * Parâmetros (todos opcionais):
 *   de, ate             AAAA-MM-DD (padrão: mês atual; máx. 366 dias)
 *   tipo                receita | despesa
 *   conta, categoria    id (uuid) da conta/cartão ou da categoria
 *   incluir_internas=1  inclui transferências internas (padrão: não)
 *   incluir_ignoradas=1 inclui lançamentos ignorados (padrão: não)
 *   limite              1–2000 (padrão 500) · offset (paginação)
 */
import { and, eq, ne, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, categories, transactions } from "@/db/schema";
import {
  ACCOUNT_TYPE_LABEL,
  AgentInputError,
  agentRoute,
  isoDate,
  num,
  parseDateParam,
  parseMonthParam,
} from "@/lib/agent-api";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_DAYS = 366;

function uuidParam(value: string | null, name: string): string | null {
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new AgentInputError(`Parâmetro "${name}" deve ser um id (uuid)`);
  return value;
}

function intParam(value: string | null, name: string, def: number, min: number, max: number) {
  if (value == null || value === "") return def;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AgentInputError(`Parâmetro "${name}" deve ser inteiro entre ${min} e ${max}`);
  }
  return n;
}

export const GET = agentRoute(async ({ householdId, url }) => {
  const p = url.searchParams;
  const month = parseMonthParam(null);
  const de = parseDateParam(p.get("de"), "de") ?? month.de;
  const ate = parseDateParam(p.get("ate"), "ate") ?? month.ate;
  const days = (Date.parse(ate) - Date.parse(de)) / 86_400_000;
  if (days < 0) throw new AgentInputError('"de" deve ser anterior ou igual a "ate"');
  if (days > MAX_RANGE_DAYS) throw new AgentInputError(`Período máximo: ${MAX_RANGE_DAYS} dias`);

  const tipo = p.get("tipo");
  if (tipo && tipo !== "receita" && tipo !== "despesa") {
    throw new AgentInputError('Parâmetro "tipo" deve ser receita ou despesa');
  }
  const conta = uuidParam(p.get("conta"), "conta");
  const categoria = uuidParam(p.get("categoria"), "categoria");
  const limite = intParam(p.get("limite"), "limite", 500, 1, 2000);
  const offset = intParam(p.get("offset"), "offset", 0, 0, 1_000_000);

  const filters: (SQL | undefined)[] = [
    eq(transactions.householdId, householdId),
    sql`${transactions.occurredOn} >= ${de}::date`,
    sql`${transactions.occurredOn} < (${ate}::date + 1)`,
  ];
  if (p.get("incluir_internas") !== "1") filters.push(eq(transactions.isInternalTransfer, false));
  if (p.get("incluir_ignoradas") !== "1") filters.push(ne(transactions.status, "ignored"));
  if (tipo) filters.push(eq(transactions.kind, tipo === "receita" ? "credit" : "debit"));
  if (conta) filters.push(eq(transactions.bankAccountId, conta));
  if (categoria) filters.push(eq(transactions.categoryId, categoria));
  const where = and(...filters);

  const [rows, [{ total }], accs, cats] = await Promise.all([
    db
      .select({
        id: transactions.id,
        occurredOn: transactions.occurredOn,
        description: transactions.description,
        amount: transactions.amount,
        currency: transactions.currency,
        kind: transactions.kind,
        status: transactions.status,
        categoryId: transactions.categoryId,
        bankAccountId: transactions.bankAccountId,
        invoiceId: transactions.invoiceId,
        installmentCurrent: transactions.installmentCurrent,
        installmentTotal: transactions.installmentTotal,
        isInternalTransfer: transactions.isInternalTransfer,
        splits: transactions.splits,
      })
      .from(transactions)
      .where(where)
      .orderBy(sql`${transactions.occurredOn} desc`, sql`${transactions.createdAt} desc`)
      .limit(limite)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(transactions).where(where),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, householdId),
      columns: { id: true, name: true, type: true },
    }),
    db.query.categories.findMany({
      where: eq(categories.householdId, householdId),
      columns: { id: true, name: true },
    }),
  ]);

  const accById = new Map(accs.map((a) => [a.id, a]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return {
    periodo: { de, ate },
    total,
    limite,
    offset,
    proximo_offset: offset + rows.length < total ? offset + rows.length : null,
    transacoes: rows.map((t) => {
      const acc = t.bankAccountId ? accById.get(t.bankAccountId) : undefined;
      const splits = Array.isArray(t.splits)
        ? (t.splits as Array<{ categoryId?: string; amount?: string | number; note?: string }>)
        : [];
      return {
        id: t.id,
        data: isoDate(t.occurredOn),
        descricao: t.description,
        valor: num(t.amount),
        moeda: t.currency,
        tipo: t.kind === "credit" ? "receita" : "despesa",
        categoria: t.categoryId
          ? { id: t.categoryId, nome: catName.get(t.categoryId) ?? null }
          : null,
        conta: acc ? { id: acc.id, nome: acc.name, tipo: ACCOUNT_TYPE_LABEL[acc.type] ?? acc.type } : null,
        status: t.status === "pending" ? "pendente" : t.status === "ignored" ? "ignorada" : "confirmada",
        parcela:
          t.installmentCurrent && t.installmentTotal
            ? `${t.installmentCurrent}/${t.installmentTotal}`
            : null,
        fatura_id: t.invoiceId,
        transferencia_interna: t.isInternalTransfer,
        divisoes: splits.length
          ? splits.map((s) => ({
              categoria: s.categoryId ? (catName.get(s.categoryId) ?? null) : null,
              valor: num(s.amount ?? null),
              nota: s.note ?? null,
            }))
          : undefined,
      };
    }),
  };
});
