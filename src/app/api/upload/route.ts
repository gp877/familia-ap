import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, invoices, transactions, uploads, users } from "@/db/schema";
import { extractFromPdf } from "@/lib/extraction";
import { applyAutoCategorization } from "@/lib/categorization";

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

  // ── Hash do PDF pra dedupe ─────────────────────────────────
  const fileHash = createHash("sha256").update(buf).digest("hex");

  const existingUpload = await db.query.uploads.findFirst({
    where: and(
      eq(uploads.householdId, dbUser.householdId),
      eq(uploads.fileHash, fileHash)
    ),
  });
  if (existingUpload) {
    return NextResponse.json(
      {
        error: `Esse PDF já foi enviado em ${new Date(existingUpload.createdAt).toLocaleDateString("pt-BR")} (arquivo "${existingUpload.filename}"). Se quiser reprocessar, exclua o upload anterior primeiro.`,
        duplicateUploadId: existingUpload.id,
      },
      { status: 409 }
    );
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

      for (const t of extracted.transactions) {
        const key = makeKey(bankAccountId, t.occurredOn, t.amount, t.rawDescription);
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key); // pra não duplicar dentro do mesmo upload

        const categoryId = await applyAutoCategorization(
          dbUser.householdId!,
          t.description
        );

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
        });
      }

      if (toInsert.length > 0) {
        await db.insert(transactions).values(toInsert);
      }

      // Update invoice totalAmount with sum of debits (incluindo as que já estavam)
      if (invoiceId) {
        const allInvoiceTxs = await db.query.transactions.findMany({
          where: eq(transactions.invoiceId, invoiceId),
        });
        const total = allInvoiceTxs
          .filter((t) => t.kind === "debit")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        await db
          .update(invoices)
          .set({ totalAmount: String(total), updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));
      }

      await db
        .update(uploads)
        .set({
          status: "completed",
          bankSlug: extracted.bankSlug,
          sourceType:
            extracted.documentType === "unknown" ? "other" : extracted.documentType,
          processedAt: new Date(),
        })
        .where(eq(uploads.id, upload.id));

      return NextResponse.json({
        ok: true,
        uploadId: upload.id,
        extractedCount: extracted.transactions.length,
        savedCount: toInsert.length,
        skippedCount: skipped,
        bankSlug: extracted.bankSlug,
        documentType: extracted.documentType,
        invoiceId,
      });
    }

    await db
      .update(uploads)
      .set({
        status: "completed",
        bankSlug: extracted.bankSlug,
        sourceType:
          extracted.documentType === "unknown" ? "other" : extracted.documentType,
        processedAt: new Date(),
      })
      .where(eq(uploads.id, upload.id));

    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      extractedCount: 0,
      savedCount: 0,
      skippedCount: 0,
      bankSlug: extracted.bankSlug,
      documentType: extracted.documentType,
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
