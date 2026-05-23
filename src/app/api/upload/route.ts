import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, uploads, users } from "@/db/schema";
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

  const sourceType = formData.get("sourceType");
  const inferredSourceType =
    sourceType === "credit_card_invoice"
      ? "credit_card_invoice"
      : sourceType === "bank_statement"
        ? "bank_statement"
        : "other";

  const buf = Buffer.from(await file.arrayBuffer());

  // Registra upload como processing
  const [upload] = await db
    .insert(uploads)
    .values({
      householdId: dbUser.householdId,
      uploadedById: dbUser.id,
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

    // Auto-categorize cada transação contra regras existentes
    const toInsert = await Promise.all(
      extracted.transactions.map(async (t) => {
        const categoryId = await applyAutoCategorization(
          dbUser.householdId!,
          t.description
        );
        return {
          householdId: dbUser.householdId!,
          uploadId: upload.id,
          categoryId,
          createdById: dbUser.id,
          occurredOn: new Date(t.occurredOn),
          amount: t.amount,
          kind: t.kind,
          description: t.description,
          rawDescription: t.rawDescription,
          status: "pending" as const,
        };
      })
    );

    if (toInsert.length > 0) {
      await db.insert(transactions).values(toInsert);
    }

    await db
      .update(uploads)
      .set({
        status: "completed",
        bankSlug: extracted.bankSlug,
        sourceType: extracted.documentType === "unknown" ? "other" : extracted.documentType,
        processedAt: new Date(),
      })
      .where(eq(uploads.id, upload.id));

    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      extractedCount: extracted.transactions.length,
      bankSlug: extracted.bankSlug,
      documentType: extracted.documentType,
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
