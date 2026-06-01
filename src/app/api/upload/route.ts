import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, invoices, transactions, uploads, users } from "@/db/schema";
import { extractFromPdf } from "@/lib/extraction";
import { applyAutoCategorization } from "@/lib/categorization";
import { computeContentHash, computeDedupeKey } from "@/lib/dedupe";
import {
  detectInternalTransfer,
  linkCardPaymentsToInvoices,
  pairInternalCandidates,
} from "@/lib/internal-transfer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
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

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Apenas PDF é aceito" }, { status: 400 });
  }

  const bankAccountIdRaw = formData.get("bankAccountId") as string | null;
  let bankAccountId: string | null = null;
  if (bankAccountIdRaw) {
    const acc = await db.query.bankAccounts.findFirst({
      where: and(
        eq(bankAccounts.id, bankAccountIdRaw),
        eq(bankAccounts.householdId, dbUser.householdId)
      ),
    });
    if (acc) bankAccountId = acc.id;
  }

  const sourceTypeRaw = formData.get("sourceType");
  const inferredSourceType =
    sourceTypeRaw === "credit_card_invoice"
      ? "credit_card_invoice"
      : sourceTypeRaw === "bank_statement"
        ? "bank_statement"
        : "other";

  const buf = Buffer.from(await file.arrayBuffer());

  // ── Dedupe camada 1: hash do BINÁRIO ───────────────────────
  // Bloqueia re-upload do arquivo EXATO (byte por byte).
  const fileHash = createHash("sha256").update(buf).digest("hex");

  const byFileHash = await db.query.uploads.findFirst({
    where: and(
      eq(uploads.householdId, dbUser.householdId),
      eq(uploads.fileHash, fileHash)
    ),
  });
  if (byFileHash) {
    return NextResponse.json(
      {
        error: `Esse PDF já foi enviado em ${new Date(byFileHash.createdAt).toLocaleDateString("pt-BR")} (arquivo "${byFileHash.filename}"). Se quiser reprocessar, exclua o upload anterior primeiro.`,
        duplicateUploadId: byFileHash.id,
        duplicateMatchedOn: "file_hash",
      },
      { status: 409 }
    );
  }

  // ── Dedupe camada 2: hash do TEXTO normalizado ─────────────
  // Bloqueia caso o banco gere arquivos diferentes (timestamps internos,
  // IDs de sessão) mas com mesmo conteúdo. Roda ~50ms — só pra dedupe.
  // Se pdf-parse falhar (PDF imagem, corrompido), contentHash = null e
  // confiamos no fileHash + dedupeKey por tx.
  const contentHash = await computeContentHash(buf);
  if (contentHash) {
    const byContentHash = await db.query.uploads.findFirst({
      where: and(
        eq(uploads.householdId, dbUser.householdId),
        eq(uploads.contentHash, contentHash)
      ),
    });
    if (byContentHash) {
      return NextResponse.json(
        {
          error: `O conteúdo desse PDF é idêntico ao enviado em ${new Date(byContentHash.createdAt).toLocaleDateString("pt-BR")} (arquivo "${byContentHash.filename}"). O arquivo pode ter sido baixado de novo do banco, mas o conteúdo é o mesmo. Se quiser reprocessar, exclua o upload anterior primeiro.`,
          duplicateUploadId: byContentHash.id,
          duplicateMatchedOn: "content_hash",
        },
        { status: 409 }
      );
    }
  }

  // Registra upload como processing
  const [upload] = await db
    .insert(uploads)
    .values({
      householdId: dbUser.householdId,
      uploadedById: dbUser.id,
      bankAccountId,
      blobUrl: "",
      filename: file.name,
      fileHash,
      contentHash,
      fileSize: buf.length,
      sourceType: inferredSourceType as
        | "bank_statement"
        | "credit_card_invoice"
        | "other",
      status: "processing",
    })
    .returning();

  try {
    const extracted = await extractFromPdf(buf);

    // Persiste IMEDIATAMENTE o raw da IA + warnings + totals reportados.
    // Mesmo que o resto da pipeline falhe depois, temos o output da IA gravado
    // pra debug. Sem isso a resposta original era caixa preta.
    const warnings: string[] = Array.isArray(extracted.warnings)
      ? [...extracted.warnings]
      : [];

    let invoiceId: string | null = null;
    if (
      extracted.documentType === "credit_card_invoice" &&
      bankAccountId &&
      extracted.referenceMonth
    ) {
      const existing = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.bankAccountId, bankAccountId),
          eq(invoices.referenceMonth, extracted.referenceMonth)
        ),
      });
      if (existing) {
        invoiceId = existing.id;
      } else {
        const [created] = await db
          .insert(invoices)
          .values({
            householdId: dbUser.householdId,
            bankAccountId,
            referenceMonth: extracted.referenceMonth,
            status: "open",
          })
          .returning();
        invoiceId = created.id;
      }
      await db
        .update(uploads)
        .set({ invoiceId })
        .where(eq(uploads.id, upload.id));
    }

    // ── Dedupe de transações ────────────────────────────────
    // Busca existing pelo (bankAccountId + occurredOn + amount + description)
    // Como podem ser muitas, faz uma busca por intervalo de datas e filtra em memória
    const datesInExtraction = extracted.transactions.map((t) => t.occurredOn);
    if (datesInExtraction.length > 0) {
      // Cria uma chave única por transação
      const makeKey = (
        accountId: string | null,
        date: Date | string,
        amount: string,
        rawDesc: string
      ) =>
        `${accountId ?? "_"}|${new Date(date).toISOString().slice(0, 10)}|${parseFloat(amount).toFixed(2)}|${rawDesc.trim().toLowerCase().slice(0, 80)}`;

      // Pega transações existentes do mesmo household + mesmo bankAccount no intervalo
      const existingTxs = await db.query.transactions.findMany({
        where: bankAccountId
          ? and(
              eq(transactions.householdId, dbUser.householdId),
              eq(transactions.bankAccountId, bankAccountId)
            )
          : eq(transactions.householdId, dbUser.householdId),
        limit: 5000,
      });
      const existingKeys = new Set(
        existingTxs.map((t) =>
          makeKey(t.bankAccountId, t.occurredOn, t.amount, t.rawDescription)
        )
      );

      const toInsert: Array<typeof transactions.$inferInsert> = [];
      let skipped = 0;

      const docSourceForDetector =
        extracted.documentType === "credit_card_invoice"
          ? "credit_card_invoice"
          : extracted.documentType === "bank_statement"
            ? "bank_statement"
            : "other";

      let soloInternalCount = 0;
      let candidateCount = 0;

      for (const t of extracted.transactions) {
        const key = makeKey(bankAccountId, t.occurredOn, t.amount, t.rawDescription);
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);

        // Detector: `solo` marca como interno na hora (pagamento de fatura).
        // `pair_candidate` deixa NÃO-interno mas com type setado — o
        // pair-matcher depois decide se vira interno achando o par.
        const det = detectInternalTransfer(
          t.rawDescription,
          t.kind,
          docSourceForDetector
        );

        const isSoloInternal = det.kind === "solo";
        const detectedType = det.kind === "none" ? null : det.type;

        // Sem categoria pra solo interno OU pra candidate (a categorização
        // espera o pair-matcher decidir; se virar interno, fica sem cat; se
        // sobrar como real, o usuário categoriza manualmente).
        const categoryId =
          det.kind === "none"
            ? await applyAutoCategorization(dbUser.householdId!, t.description)
            : null;

        if (isSoloInternal) soloInternalCount++;
        if (det.kind === "pair_candidate") candidateCount++;

        toInsert.push({
          householdId: dbUser.householdId,
          bankAccountId,
          invoiceId,
          uploadId: upload.id,
          categoryId,
          createdById: dbUser.id,
          occurredOn: new Date(t.occurredOn),
          amount: t.amount,
          kind: t.kind,
          description: t.description,
          rawDescription: t.rawDescription,
          installmentCurrent: t.installmentCurrent ?? null,
          installmentTotal: t.installmentTotal ?? null,
          status: "pending" as const,
          isInternalTransfer: isSoloInternal,
          internalTransferType: detectedType,
          // Camada 3 de dedupe — UNIQUE constraint no banco vai bloquear
          // duplicata mesmo se as camadas 1/2 falharem.
          dedupeKey: computeDedupeKey({
            bankAccountId,
            occurredOn: t.occurredOn,
            amount: t.amount,
            rawDescription: t.rawDescription,
          }),
        });
      }

      if (toInsert.length > 0) {
        // onConflictDoNothing trata a UNIQUE violation graciosamente — se a
        // mesma chave já existir (race condition entre 2 uploads simultâneos),
        // a linha é silenciosamente ignorada em vez de explodir o request.
        await db
          .insert(transactions)
          .values(toInsert)
          .onConflictDoNothing({
            target: [transactions.householdId, transactions.dedupeKey],
          });
      }

      // Pair-matcher: roda DEPOIS de inserir, pra que candidates do upload
      // atual possam parear com débitos já no DB (e vice-versa).
      const pairedCount = await pairInternalCandidates(dbUser.householdId);

      // Total local pra cross-check: sum de débitos NÃO-internos extraídos
      // do PDF. Não tem como saber agora quais candidates vão parear (já
      // pareados pelo matcher), então usa estimativa: candidate count vira
      // interno se par achado dentro do mesmo lote — pra cross-check
      // conservador, exclui só os solo internos da soma.
      const computedTotalFromExtracted = extracted.transactions.reduce(
        (sum, t) => {
          const d = detectInternalTransfer(
            t.rawDescription,
            t.kind,
            docSourceForDetector
          );
          if (d.kind === "solo") return sum;
          // pair_candidate de crédito: provavelmente vira interno; exclui
          if (d.kind === "pair_candidate" && t.kind === "credit") return sum;
          if (t.kind === "debit") return sum + parseFloat(t.amount);
          return sum;
        },
        0
      );

      // Update invoice totalAmount com sum dos débitos NÃO-internos. Pagamento
      // recebido (interno) é excluído → bate com "TOTAL DESTA FATURA" do PDF.
      if (invoiceId) {
        const allInvoiceTxs = await db.query.transactions.findMany({
          where: eq(transactions.invoiceId, invoiceId),
        });
        const total = allInvoiceTxs
          .filter((t) => t.kind === "debit" && !t.isInternalTransfer)
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        // Créditos NÃO-internos (ex: bonificação real, se houver) abatem do total
        const credits = allInvoiceTxs
          .filter((t) => t.kind === "credit" && !t.isInternalTransfer)
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        await db
          .update(invoices)
          .set({ totalAmount: String(total - credits), updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));
      }

      // Tenta vincular pagamentos no extrato à fatura correspondente — funciona
      // nos dois sentidos: subiu extrato (acha invoice antiga) OU subiu fatura
      // (acha pagamento órfão no extrato).
      const linkedCount = await linkCardPaymentsToInvoices(dbUser.householdId);

      // Cross-check: documentTotal (IA leu do PDF) vs computedTotalFromExtracted
      // (sum local dos débitos extraídos). Divergência > 1% ou > R$ 1 → revisar.
      const docTotalNum = extracted.documentTotal
        ? parseFloat(extracted.documentTotal)
        : null;
      let totalsMatch = true;
      if (docTotalNum !== null && extracted.documentType === "credit_card_invoice") {
        const diff = Math.abs(docTotalNum - computedTotalFromExtracted);
        const pct = docTotalNum > 0 ? diff / docTotalNum : 0;
        if (diff > 1 && pct > 0.01) {
          totalsMatch = false;
          warnings.push(
            `Total do PDF (R$ ${docTotalNum.toFixed(2)}) diverge do somatório das transações (R$ ${computedTotalFromExtracted.toFixed(2)}). Diferença: R$ ${diff.toFixed(2)}.`
          );
        }
      }

      const finalStatus =
        warnings.length > 0 || !totalsMatch ? "needs_review" : "completed";

      await db
        .update(uploads)
        .set({
          status: finalStatus,
          bankSlug: extracted.bankSlug,
          sourceType:
            extracted.documentType === "unknown" ? "other" : extracted.documentType,
          extractedJson: extracted as unknown as Record<string, unknown>,
          documentTotal: docTotalNum !== null ? docTotalNum.toFixed(2) : null,
          computedTotal: computedTotalFromExtracted.toFixed(2),
          extractionWarnings: warnings,
          pagesReported: extracted.pagesReported ?? null,
          processedAt: new Date(),
        })
        .where(eq(uploads.id, upload.id));

      return NextResponse.json({
        ok: true,
        uploadId: upload.id,
        status: finalStatus,
        extractedCount: extracted.transactions.length,
        savedCount: toInsert.length,
        skippedCount: skipped,
        soloInternalCount,
        candidateCount,
        pairedCount,
        linkedCount,
        bankSlug: extracted.bankSlug,
        documentType: extracted.documentType,
        documentTotal: docTotalNum,
        computedTotal: computedTotalFromExtracted,
        warnings,
        invoiceId,
      });
    }

    // Caminho sem transações (PDF não tinha nada extraível)
    const noTxStatus = warnings.length > 0 ? "needs_review" : "completed";
    await db
      .update(uploads)
      .set({
        status: noTxStatus,
        bankSlug: extracted.bankSlug,
        sourceType:
          extracted.documentType === "unknown" ? "other" : extracted.documentType,
        extractedJson: extracted as unknown as Record<string, unknown>,
        extractionWarnings: warnings,
        pagesReported: extracted.pagesReported ?? null,
        processedAt: new Date(),
      })
      .where(eq(uploads.id, upload.id));

    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      status: noTxStatus,
      extractedCount: 0,
      savedCount: 0,
      skippedCount: 0,
      bankSlug: extracted.bankSlug,
      documentType: extracted.documentType,
      warnings,
      invoiceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(uploads)
      .set({ status: "failed", errorMessage: message })
      .where(eq(uploads.id, upload.id));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
