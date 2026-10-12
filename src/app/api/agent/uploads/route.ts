/**
 * GET  /api/agent/uploads — últimos PDFs enviados e o resultado de cada um.
 * POST /api/agent/uploads — envia um extrato/fatura em PDF. Roda o MESMO
 *      pipeline da tela de upload (IA, dedupe, regras, fatura). multipart:
 *        file           o PDF (até 10 MB; PDF com senha não é lido)
 *        bankAccountId  id da conta ou cartão (obrigatório aqui — sem ele a
 *                       fatura não é criada e os lançamentos ficam sem conta)
 *        sourceType     bank_statement | credit_card_invoice (opcional)
 *      Mesmo PDF duas vezes → 409 (o app bloqueia duplicado).
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, uploads } from "@/db/schema";
import {
  AgentInputError,
  AgentNotFoundError,
  agentRoute,
  isoDate,
  num,
  UUID_RE,
} from "@/lib/agent-api";
import { processPdfUpload } from "@/lib/upload-pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_LABEL: Record<string, string> = {
  pending: "pendente",
  processing: "processando",
  completed: "concluido",
  needs_review: "revisar",
  failed: "falhou",
};

export const GET = agentRoute(async ({ householdId, url }) => {
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 20, 1), 100);
  const rows = await db
    .select({
      id: uploads.id,
      filename: uploads.filename,
      sourceType: uploads.sourceType,
      status: uploads.status,
      bankAccountId: uploads.bankAccountId,
      accountName: bankAccounts.name,
      invoiceId: uploads.invoiceId,
      documentTotal: uploads.documentTotal,
      closingBalance: uploads.closingBalance,
      warnings: uploads.extractionWarnings,
      errorMessage: uploads.errorMessage,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .leftJoin(bankAccounts, eq(bankAccounts.id, uploads.bankAccountId))
    .where(eq(uploads.householdId, householdId))
    .orderBy(desc(uploads.createdAt))
    .limit(limite);

  return {
    uploads: rows.map((u) => ({
      id: u.id,
      arquivo: u.filename,
      tipo:
        u.sourceType === "bank_statement"
          ? "extrato"
          : u.sourceType === "credit_card_invoice"
            ? "fatura"
            : "outro",
      status: STATUS_LABEL[u.status] ?? u.status,
      conta: u.bankAccountId ? { id: u.bankAccountId, nome: u.accountName } : null,
      fatura_id: u.invoiceId,
      total_documento: num(u.documentTotal),
      saldo_final: num(u.closingBalance),
      avisos: Array.isArray(u.warnings) ? u.warnings : [],
      erro: u.errorMessage,
      enviado_em: isoDate(u.createdAt),
    })),
  };
});

export const POST = agentRoute(
  async ({ householdId, userId, req }) => {
    let form: FormData;
    try {
      form = await req.clone().formData();
    } catch {
      throw new AgentInputError("Envie multipart/form-data com os campos file e bankAccountId");
    }
    const accountId = form.get("bankAccountId");
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) {
      throw new AgentInputError('"bankAccountId" é obrigatório (id de /api/agent/contas)');
    }
    const acc = await db.query.bankAccounts.findFirst({
      columns: { id: true },
      where: and(eq(bankAccounts.id, accountId), eq(bankAccounts.householdId, householdId)),
    });
    if (!acc) throw new AgentNotFoundError("Conta não encontrada");

    return processPdfUpload(req, { userId, householdId });
  },
  { rateLimit: 10 }
);
