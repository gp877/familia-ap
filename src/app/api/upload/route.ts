import { createHash } from "node:crypto";

import { NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, categoryRules, invoices, transactions, uploads, users } from "@/db/schema";
import { extractFromPdf } from "@/lib/extraction";
import { loadActiveRules, matchRules } from "@/lib/categorization";
import { computeContentHash, computeDedupeKey } from "@/lib/dedupe";
import {
  detectInternalTransfer,
  linkCardPaymentsToInvoices,
  pairInternalCandidates,
} from "@/lib/internal-transfer";

export const runtime = "nodejs";
// Vercel Hobby suporta até 60s; Pro até 300s. Mantemos 60 mas usamos
// budget interno bem mais apertado (40s) pra deixar margem pra resposta.
export const maxDuration = 60;

export async function POST(req: Request) {
  // Envelope geral: TODO erro retorna JSON com { error, code, canRetry }.
  // Mesmo um catch fatal no fim — sem isso o client recebe HTML do Next
  // e parser de JSON explode com "Unexpected token".
  try {
    return await handlePost(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] catch fatal:", err);
    return NextResponse.json(
      {
        error: `Erro inesperado: ${message}. Tente reenviar — se persistir, recarregue a página.`,
        code: "UNCAUGHT",
        canRetry: true,
      },
      { status: 500 }
    );
  }
}

async function handlePost(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "Sua sessão expirou. Recarregue a página e entre de novo.",
        code: "UNAUTHENTICATED",
        canRetry: false,
      },
      { status: 401 }
    );
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) {
    return NextResponse.json(
      {
        error: "Sua conta não está vinculada a um household. Contate o suporte.",
        code: "NO_HOUSEHOLD",
        canRetry: false,
      },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      {
        error: "Arquivo não enviado. Escolha um PDF e tente de novo.",
        code: "NO_FILE",
        canRetry: false,
      },
      { status: 400 }
    );
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      {
        error: "Apenas PDF é aceito. O arquivo enviado é " + (file.type || "desconhecido"),
        code: "WRONG_FILE_TYPE",
        canRetry: false,
      },
      { status: 400 }
    );
  }
  // Limite razoável de tamanho — PDFs > 10MB tendem a estourar Gemini
  // mesmo com 2.5-flash, e a Vercel pode rejeitar antes de chegar aqui.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      {
        error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite é 10 MB. Tente reduzir as páginas ou re-exportar do banco.`,
        code: "FILE_TOO_LARGE",
        canRetry: false,
      },
      { status: 413 }
    );
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
    // Caso especial: upload preso em "processing" há mais de 5 min →
    // considera abandonado (Vercel timeout, browser fechou, etc).
    // Reaproveita o ID e deixa o pipeline rodar de novo.
    const ageMs = Date.now() - new Date(byFileHash.createdAt).getTime();
    const isStaleProcessing =
      byFileHash.status === "processing" && ageMs > 5 * 60 * 1000;

    if (isStaleProcessing) {
      // Apaga transações órfãs do upload abandonado antes de seguir
      await db
        .delete(transactions)
        .where(eq(transactions.uploadId, byFileHash.id));
      await db.delete(uploads).where(eq(uploads.id, byFileHash.id));
    } else if (byFileHash.status === "processing") {
      // Upload em processamento ATIVO em outra aba/request
      return NextResponse.json(
        {
          error: `Esse arquivo já está sendo processado (iniciado há ${Math.round(ageMs / 1000)}s, em outra aba ou dispositivo). Aguarde até 1 min — se travar, recarregue a página e tente de novo.`,
          code: "PROCESSING_IN_PROGRESS",
          duplicateUploadId: byFileHash.id,
          canRetry: false,
        },
        { status: 409 }
      );
    } else {
      // Upload concluído ou falho — bloqueia mesmo
      return NextResponse.json(
        {
          error: `Esse PDF já foi enviado em ${new Date(byFileHash.createdAt).toLocaleDateString("pt-BR")} (arquivo "${byFileHash.filename}"). Se quiser reprocessar, exclua o upload anterior primeiro.`,
          code: "DUPLICATE_FILE",
          duplicateUploadId: byFileHash.id,
          duplicateMatchedOn: "file_hash",
          canRetry: false,
        },
        { status: 409 }
      );
    }
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

  // Persiste o PDF ORIGINAL no Vercel Blob antes de qualquer processamento.
  // É o documento-fonte do histórico financeiro — se a extração falhar ou
  // precisar de conferência futura, o arquivo existe. Falha de Blob não
  // bloqueia o upload (blobUrl fica "" e o pipeline segue), mas avisa no log.
  let blobUrl = "";
  try {
    const blob = await put(
      `documentos/${dbUser.householdId}/${fileHash.slice(0, 12)}-${file.name}`,
      buf,
      { access: "public", contentType: "application/pdf" }
    );
    blobUrl = blob.url;
  } catch (err) {
    console.error("[upload] put no Vercel Blob falhou (segue sem arquivo):", err);
  }

  // Registra upload como processing
  const [upload] = await db
    .insert(uploads)
    .values({
      householdId: dbUser.householdId,
      uploadedById: dbUser.id,
      bankAccountId,
      blobUrl,
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
    const tExtractStart = Date.now();
    const extracted = await extractFromPdf(buf);
    console.log(
      `[upload] extractFromPdf retornou em ${Date.now() - tExtractStart}ms (${extracted.transactions.length} txs)`
    );

    // Persiste IMEDIATAMENTE o raw da IA + warnings + totals reportados.
    // Mesmo que o resto da pipeline falhe depois, temos o output da IA gravado
    // pra debug. Sem isso a resposta original era caixa preta.
    const warnings: string[] = Array.isArray(extracted.warnings)
      ? [...extracted.warnings]
      : [];

    let invoiceId: string | null = null;
    if (
      extracted.documentType === "credit_card_invoice" &&
      bankAccountId
    ) {
      // referenceMonth = mês de COMPETÊNCIA (quando a maioria das compras
      // aconteceu), não mês do vencimento. Bancos como UNICRED chamam de
      // "REF: mai/2026" o mês do vencimento, o que confunde — preferimos
      // a convenção do usuário ("fatura de maio" = compras feitas em maio).
      //
      // Calculamos pela MODA (mês com MAIS tx). Mediana falhava em fatura
      // com muitas parcelas antigas: 79 tx no total, sendo 50 em maio e
      // 29 dispersas entre set/2025 e abr/2026 → mediana caía em fevereiro.
      // Moda → maio (que é o que o usuário espera ver).
      let computedRef: string | null = null;
      const monthCounts = new Map<string, number>();
      for (const t of extracted.transactions) {
        const d = new Date(t.occurredOn);
        if (isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      }
      if (monthCounts.size > 0) {
        let best = "";
        let bestN = -1;
        for (const [m, n] of monthCounts) {
          // Empate: prefere o mês MAIS RECENTE (compras costumam concentrar
          // perto do fechamento do cartão).
          if (n > bestN || (n === bestN && m > best)) {
            best = m;
            bestN = n;
          }
        }
        computedRef = best;
      }
      const effectiveRef = computedRef || extracted.referenceMonth;

      if (effectiveRef) {
        const existing = await db.query.invoices.findFirst({
          where: and(
            eq(invoices.bankAccountId, bankAccountId),
            eq(invoices.referenceMonth, effectiveRef)
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
              referenceMonth: effectiveRef,
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

      // Otimização: filtra existingTxs pelo INTERVALO de datas do PDF.
      // Antes lia 5000 tx do household inteiro — agora só busca tx do mesmo
      // bankAccount entre min(extracted) - 7d e max(extracted) + 7d.
      // Pra extrato típico (1 mês), reduz de 5000 pra <100 linhas.
      const dateTimestamps = datesInExtraction.map((d) => new Date(d).getTime());
      const minDate = new Date(Math.min(...dateTimestamps) - 7 * 24 * 60 * 60 * 1000);
      const maxDate = new Date(Math.max(...dateTimestamps) + 7 * 24 * 60 * 60 * 1000);

      const tStartExisting = Date.now();
      const existingTxs = await db.query.transactions.findMany({
        where: bankAccountId
          ? and(
              eq(transactions.householdId, dbUser.householdId),
              eq(transactions.bankAccountId, bankAccountId),
              gte(transactions.occurredOn, minDate),
              lte(transactions.occurredOn, maxDate)
            )
          : and(
              eq(transactions.householdId, dbUser.householdId),
              gte(transactions.occurredOn, minDate),
              lte(transactions.occurredOn, maxDate)
            ),
        limit: 5000,
      });
      console.log(
        `[upload] existingTxs query: ${Date.now() - tStartExisting}ms (${existingTxs.length} linhas)`
      );
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
      let saldoFiltered = 0;

      // Regras carregadas UMA vez — antes era 1 query (+1 update) POR
      // transação, ~200 round-trips no Neon pra um PDF de 100 linhas.
      // Agora: 1 query antes do loop, match em memória, 1 update em batch.
      const activeRules = await loadActiveRules(dbUser.householdId!);
      const usedRuleIds = new Set<string>();

      // Filtro defensivo: o prompt do Gemini pede pra ignorar linhas de SALDO
      // e totais, mas se uma escapar (saldo anterior, saldo do dia, saldo
      // parcial, total parcial, etc.) ela vira uma "tx" e inflama os totais.
      // Esse regex bloqueia no servidor mesmo se a IA falhar.
      const SALDO_RE = /\b(saldo\s+(anterior|inicial|final|atual|do\s+dia|parcial|disponivel|dispon[íi]vel)|s\.\s*anterior|total\s+(parcial|geral|do\s+dia|do\s+m[eê]s)|movimenta[cç][aã]o\s+do\s+dia|limite\s+de\s+cr[eé]dito|limite\s+de\s+cheque|valor\s+m[íi]nimo|pr[oó]ximas\s+faturas)\b/i;

      let pdfIdx = -1;
      for (const t of extracted.transactions) {
        pdfIdx++;
        if (
          SALDO_RE.test(t.rawDescription || "") ||
          SALDO_RE.test(t.description || "")
        ) {
          saldoFiltered++;
          console.warn(
            `[upload] linha bloqueada (saldo/total): "${(t.rawDescription || "").slice(0, 80)}"`
          );
          continue;
        }
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
        let categoryId: string | null = null;
        if (det.kind === "none") {
          const hit = matchRules(activeRules, t.description, t.rawDescription);
          if (hit) {
            categoryId = hit.categoryId;
            usedRuleIds.add(hit.id);
          }
        }

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
          sourceOrder: pdfIdx,
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
        //
        // IMPORTANTE: o índice é PARCIAL (WHERE dedupe_key IS NOT NULL) —
        // Postgres exige que o `WHERE` seja repetido no ON CONFLICT senão
        // rejeita com "ON CONFLICT cannot target partial unique index".
        // Insere em batches pra não estourar limite do Neon (~32k params).
        const BATCH = 50;
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const slice = toInsert.slice(i, i + BATCH);
          await db
            .insert(transactions)
            .values(slice)
            .onConflictDoNothing({
              target: [transactions.householdId, transactions.dedupeKey],
              where: sql`dedupe_key IS NOT NULL`,
            });
        }
      }

      // lastAppliedAt das regras usadas — 1 update em batch (era 1 por tx)
      if (usedRuleIds.size > 0) {
        await db
          .update(categoryRules)
          .set({ lastAppliedAt: new Date() })
          .where(inArray(categoryRules.id, Array.from(usedRuleIds)));
      }

      // Pair-matcher e linker foram movidos pra after() — eles podem
      // demorar 2-10s cada e não bloqueiam o que o user precisa ver na
      // resposta (transações já estão salvas). Rodam após response enviada.
      // pairedCount e linkedCount viram 0 nessa resposta; recálculo do
      // invoice totalAmount também roda no after().

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

      // Linker movido pra after() — não bloqueia resposta. Roda após.
      const linkedCount = 0;

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

      // Pós-processamento assíncrono: pair-matcher + linker + recálculo
      // do invoice total. Rodam DEPOIS da resposta ser enviada, então não
      // contam pro maxDuration de 60s do Vercel.
      const householdIdForAfter = dbUser.householdId;
      const invoiceIdForAfter = invoiceId;
      after(async () => {
        try {
          const tAfter = Date.now();
          const pairedAfter = await pairInternalCandidates(householdIdForAfter);
          console.log(`[upload:after] pair-matcher: ${Date.now() - tAfter}ms (${pairedAfter} pares)`);

          const tLinker = Date.now();
          const linkedAfter = await linkCardPaymentsToInvoices(householdIdForAfter);
          console.log(`[upload:after] linker: ${Date.now() - tLinker}ms (${linkedAfter} vínculos)`);

          // Recálculo do invoice totalAmount agora que pair-matcher rodou.
          if (invoiceIdForAfter) {
            const allInvoiceTxs = await db.query.transactions.findMany({
              where: eq(transactions.invoiceId, invoiceIdForAfter),
            });
            const total = allInvoiceTxs
              .filter((t) => t.kind === "debit" && !t.isInternalTransfer)
              .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            const credits = allInvoiceTxs
              .filter((t) => t.kind === "credit" && !t.isInternalTransfer)
              .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            await db
              .update(invoices)
              .set({ totalAmount: String(total - credits), updatedAt: new Date() })
              .where(eq(invoices.id, invoiceIdForAfter));
            console.log(`[upload:after] invoice total recalculado: R$ ${(total - credits).toFixed(2)}`);
          }
        } catch (err) {
          console.error("[upload:after] falhou:", err);
        }
      });

      return NextResponse.json({
        ok: true,
        uploadId: upload.id,
        status: finalStatus,
        extractedCount: extracted.transactions.length,
        savedCount: toInsert.length,
        skippedCount: skipped,
        saldoFilteredCount: saldoFiltered,
        soloInternalCount,
        candidateCount,
        pairedCount: 0, // calculado em after()
        linkedCount: 0, // calculado em after()
        bankSlug: extracted.bankSlug,
        documentType: extracted.documentType,
        documentTotal: docTotalNum,
        computedTotal: computedTotalFromExtracted,
        warnings,
        invoiceId,
        postProcessing: true, // sinaliza pro client que algumas coisas ainda estão sendo calculadas
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

    // Se ainda não há transações vinculadas a esse upload, apaga a row
    // inteira — assim o user pode subir o MESMO arquivo de novo sem
    // bloqueio do dedupe (file_hash já estava gravado). Caso típico:
    // Gemini 503 falhou ANTES de criar qualquer transação.
    const txsForUpload = await db.query.transactions.findFirst({
      where: eq(transactions.uploadId, upload.id),
    });

    if (!txsForUpload) {
      await db.delete(uploads).where(eq(uploads.id, upload.id));
    } else {
      // Já criou alguma transação — preserva pra investigação manual
      await db
        .update(uploads)
        .set({ status: "failed", errorMessage: message })
        .where(eq(uploads.id, upload.id));
    }

    // Mensagens específicas por tipo de erro pra dar uma ação clara ao user
    let friendly: string;
    let code: string;
    if (/503|UNAVAILABLE|overload/i.test(message)) {
      code = "GEMINI_OVERLOADED";
      friendly =
        "A IA do Google (Gemini) está sobrecarregada agora. Aguarde 1-2 min e tente reenviar — seu arquivo NÃO foi salvo.";
    } else if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
      code = "GEMINI_QUOTA";
      friendly =
        "Cota diária da IA esgotada. Aguarde algumas horas ou contate o admin pra renovar a chave do Gemini.";
    } else if (/timeout|ETIMEDOUT|socket hang up/i.test(message)) {
      code = "TIMEOUT";
      friendly =
        "Tempo esgotado processando o PDF (Vercel limita em 60s). Tente um arquivo menor ou reenvie em horário de menor demanda.";
    } else if (/JSON|parse/i.test(message)) {
      code = "GEMINI_BAD_JSON";
      friendly =
        "A IA retornou um formato inesperado. Tente reenviar — geralmente passa na 2ª tentativa.";
    } else if (/Failed query|database/i.test(message)) {
      code = "DB_ERROR";
      friendly =
        "Erro ao salvar as transações no banco. Tente reenviar — se persistir, avise.";
    } else {
      code = "EXTRACTION_FAILED";
      friendly = `Falha ao processar o PDF: ${message}. Tente reenviar.`;
    }

    return NextResponse.json(
      {
        error: friendly,
        rawError: message,
        code,
        canRetry: !txsForUpload,
      },
      { status: 500 }
    );
  }
}
