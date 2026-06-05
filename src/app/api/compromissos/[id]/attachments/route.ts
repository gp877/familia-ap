/**
 * Upload e delete de anexos de compromisso.
 *
 * POST /api/compromissos/<id>/attachments
 *   body: multipart/form-data com `file`
 *   resposta: { id, filename, blobUrl, fileSize, mimeType }
 *
 * DELETE /api/compromissos/<id>/attachments?attachmentId=<id>
 *   resposta: { ok: true }
 *
 * Armazenamento: Vercel Blob (público, URL não-listada). Cada arquivo recebe
 * um nome único pra evitar colisão e pra esconder o filename original na URL.
 */
import { put, del } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  compromissoAttachments,
  compromissos,
  users,
} from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// 4MB é o teto seguro do Serverless body do Vercel (~4.5MB real).
// Pra arquivos maiores precisaremos de upload direto pro Blob via signed URL.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id: compromissoId } = await ctx.params;
    const c = await db.query.compromissos.findFirst({
      where: eq(compromissos.id, compromissoId),
    });
    if (!c || c.householdId !== dbUser.householdId) {
      return NextResponse.json(
        { error: "Compromisso não encontrado" },
        { status: 404 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Storage não configurado (BLOB_READ_WRITE_TOKEN ausente)" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo não enviado" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo maior que 4MB não é suportado ainda" },
        { status: 413 }
      );
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 100);
    const pathname = `compromissos/${dbUser.householdId}/${compromissoId}/${crypto.randomUUID()}-${safeName}`;

    let blobResult;
    try {
      blobResult = await put(pathname, file, {
        access: "public",
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: false,
      });
    } catch (err) {
      console.error("[attachments] put pro Blob falhou:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Falha ao salvar no storage: ${msg}` },
        { status: 500 }
      );
    }

    const [row] = await db
      .insert(compromissoAttachments)
      .values({
        compromissoId,
        householdId: dbUser.householdId,
        uploadedById: dbUser.id,
        blobUrl: blobResult.url,
        filename: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
      })
      .returning();

    return NextResponse.json({
      id: row.id,
      filename: row.filename,
      blobUrl: row.blobUrl,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
    });
  } catch (err) {
    // Catch-all: garante que SEMPRE retornamos JSON, nunca um body vazio
    // que faria o cliente quebrar com "Unexpected end of JSON input".
    console.error("[attachments POST] erro inesperado:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro inesperado no upload: ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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

  const { id: compromissoId } = await ctx.params;
  const url = new URL(req.url);
  const attachmentId = url.searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId obrigatório" }, { status: 400 });
  }

  const att = await db.query.compromissoAttachments.findFirst({
    where: and(
      eq(compromissoAttachments.id, attachmentId),
      eq(compromissoAttachments.compromissoId, compromissoId),
      eq(compromissoAttachments.householdId, dbUser.householdId)
    ),
  });
  if (!att) {
    return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  }

  // Remove do Blob (não-fatal se já não existe)
  try {
    await del(att.blobUrl);
  } catch (err) {
    console.warn("[attachments] del do blob falhou:", err);
  }

  await db
    .delete(compromissoAttachments)
    .where(eq(compromissoAttachments.id, attachmentId));

  return NextResponse.json({ ok: true });
}
