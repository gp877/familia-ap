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

  // Conta bancária / cartão escolhido pelo usuário
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

  // Registra upload como processing
  const [upload] = await db
    .insert(uploads)
    .values({
      householdId: dbUser.householdId,
      uploadedById: dbUser.id,
      bankAccountId,
      blobUrl: "",
      filename: file.name,
      sourceType: inferredSourceType as
        | "bank_statement"
        | "credit_card_invoice"
        | "other",
      status: "processing",
    })
    .returning();

  try {
    const extracted = await extractFromPdf(buf);

    // Se for fatura de cartão e tivermos bankAccountId + referenceMonth,
    // encontra ou cria a invoice correspondente
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
      // Atualiza upload com invoiceId
      await db
        .update(uploads)
        .set({ invoiceId })
        .where(eq(uploads.id, upload.id));
    }

    // Auto-categorize
    const toInsert = await Promise.all(
      extracted.transactions.map(async (t) => {
        const categoryId = await applyAutoCategorization(
          dbUser.householdId!,
          t.description
        );
        return {
          householdId: dbUser.householdId!,
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
        };
      })
    );

    if (toInsert.length > 0) {
      await db.insert(transactions).values(toInsert);
    }

    // Se for fatura, atualiza totalAmount com a soma de débitos
    if (invoiceId) {
      const total = extracted.transactions
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
