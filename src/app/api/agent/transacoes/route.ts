/**
 * GET  /api/agent/transacoes — lançamentos de um período.
 * POST /api/agent/transacoes — cria um lançamento manual (mesma regra da
 *      tela "Nova transação"). Ver o comentário do POST abaixo.
 *
 * Parâmetros do GET (todos opcionais):
 *   de, ate             AAAA-MM-DD (padrão: mês atual; máx. 366 dias)
 *   tipo                receita | despesa
 *   conta, categoria    id (uuid) da conta/cartão ou da categoria
 *   status              pendente | confirmada | ignorada
 *   incluir_internas=1  inclui transferências internas (padrão: não)
 *   incluir_ignoradas=1 inclui lançamentos ignorados (padrão: não)
 *   limite              1–2000 (padrão 500) · offset (paginação)
 */
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { bankAccounts, categories, transactions } from "@/db/schema";
import {
  ACCOUNT_TYPE_LABEL,
  AgentInputError,
  agentJson,
  agentRoute,
  coreCall,
  isoDate,
  moneyValue,
  num,
  parseDateParam,
  parseMonthParam,
  readJson,
  UUID_RE,
  uuidValue,
} from "@/lib/agent-api";
import { createManualTransactionCore } from "@/lib/transactions-core";

export const runtime = "nodejs";

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
  if (p.get("incluir_ignoradas") !== "1" && p.get("status") !== "ignorada") filters.push(ne(transactions.status, "ignored"));
  if (tipo) filters.push(eq(transactions.kind, tipo === "receita" ? "credit" : "debit"));
  if (conta) filters.push(eq(transactions.bankAccountId, conta));
  if (categoria) filters.push(eq(transactions.categoryId, categoria));
  const status = p.get("status");
  if (status) {
    const map = { pendente: "pending", confirmada: "confirmed", ignorada: "ignored" } as const;
    const st = map[status as keyof typeof map];
    if (!st) throw new AgentInputError('Parâmetro "status" deve ser pendente, confirmada ou ignorada');
    filters.push(eq(transactions.status, st));
  }
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
        createdVia: transactions.createdVia,
        agentUpdatedAt: transactions.agentUpdatedAt,
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
        feito_pela_ia: t.createdVia === "agent",
        revisado_pela_ia_em: t.agentUpdatedAt ? t.agentUpdatedAt.toISOString() : null,
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

/**
 * Corpo JSON:
 *   conta_id (obrigatório), data AAAA-MM-DD, descricao, valor (positivo),
 *   tipo receita|despesa, categoria_id (opcional — sem ela, aplica as regras
 *   de categorização), observacao (opcional).
 *   permitir_duplicado: true — grava mesmo se já existir lançamento igual
 *   (mesma conta, data, valor, tipo e descrição). Sem isso responde 409.
 */
export const POST = agentRoute(
  async ({ householdId, userId, req }) => {
    const body = await readJson(req);
    const contaId = uuidValue(body.conta_id, "conta_id");
    const data = parseDateParam(typeof body.data === "string" ? body.data : "", "data");
    if (!data) throw new AgentInputError('"data" é obrigatória (AAAA-MM-DD)');
    const descricao = typeof body.descricao === "string" ? body.descricao.trim() : "";
    if (!descricao) throw new AgentInputError('"descricao" é obrigatória');
    if (descricao.length > 200) throw new AgentInputError('"descricao" aceita até 200 caracteres');
    const valor = moneyValue(body.valor, "valor");
    if (body.tipo !== "receita" && body.tipo !== "despesa") {
      throw new AgentInputError('"tipo" deve ser receita ou despesa');
    }
    const kind = body.tipo === "receita" ? "credit" : "debit";
    const categoriaId = body.categoria_id == null ? null : uuidValue(body.categoria_id, "categoria_id");
    const observacao = typeof body.observacao === "string" ? body.observacao.slice(0, 500) : undefined;

    if (body.permitir_duplicado !== true) {
      const dup = await db.query.transactions.findFirst({
        columns: { id: true },
        where: and(
          eq(transactions.householdId, householdId),
          eq(transactions.bankAccountId, contaId),
          eq(transactions.kind, kind),
          sql`${transactions.occurredOn}::date = ${data}::date`,
          sql`${transactions.amount} = ${valor}::numeric`,
          sql`lower(${transactions.description}) = lower(${descricao})`
        ),
      });
      if (dup) {
        return agentJson(
          {
            erro: "Já existe um lançamento igual (conta, data, valor, tipo e descrição). Envie permitir_duplicado: true se for outro mesmo.",
            id_existente: dup.id,
          },
          409
        );
      }
    }

    const created = await coreCall(
      createManualTransactionCore(
        { userId, householdId, via: "agent" },
        {
          bankAccountId: contaId,
          occurredOn: data,
          description: descricao,
          amount: valor,
          kind,
          categoryId: categoriaId,
          notes: observacao,
        }
      )
    );
    revalidatePath("/financeiro/transacoes");
    revalidatePath("/financeiro");

    return agentJson(
      {
        ok: true,
        id: created.id,
        data: isoDate(created.occurredOn),
        descricao: created.description,
        valor: num(created.amount),
        tipo: created.kind === "credit" ? "receita" : "despesa",
        categoria_id: created.categoryId,
        status: "confirmada",
        feito_pela_ia: true,
      },
      201
    );
  },
  { rateLimit: 30 }
);
