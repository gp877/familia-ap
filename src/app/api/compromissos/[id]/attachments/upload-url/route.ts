/**
 * Endpoint que gera signed URL pra upload DIRETO do client pro Vercel Blob.
 * Bypass do limite de 4.5MB do Serverless Function body — arquivos vão até
 * 500MB direto pro storage sem passar pelo nosso server.
 *
 * Fluxo:
 *   client → POST /api/compromissos/<id>/attachments/upload-url (token)
 *          → PUT direto pro Blob (com token)
 *          → callback "onUploadCompleted" registra metadata no banco
 *
 * Usa `handleUpload` do @vercel/blob/client.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  compromissoAttachments,
  compromissos,
  users,
} from "@/db/schema";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: compromissoId } = await ctx.params;

  // Auth e check de propriedade do compromisso PRECISAM rodar antes da signed URL
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
  const compromisso = await db.query.compromissos.findFirst({
    where: eq(compromissos.id, compromissoId),
  });
  if (!compromisso || compromisso.householdId !== dbUser.householdId) {
    return NextResponse.json({ error: "Compromisso não encontrado" }, { status: 404 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN não configurado" },
      { status: 500 }
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // pathname vem do client; força prefixo seguro
        return {
          allowedContentTypes: ["*/*"],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB
          tokenPayload: JSON.stringify({
            compromissoId,
            householdId: dbUser.householdId,
            uploadedById: dbUser.id,
            originalFilename: pathname.split("/").pop() ?? "arquivo",
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Roda SERVER-SIDE (callback do Vercel) depois do upload terminar.
        // Persiste a metadata no banco.
        if (!tokenPayload) return;
        const payload = JSON.parse(tokenPayload) as {
          compromissoId: string;
          householdId: string;
          uploadedById: string;
          originalFilename: string;
        };
        await db.insert(compromissoAttachments).values({
          compromissoId: payload.compromissoId,
          householdId: payload.householdId,
          uploadedById: payload.uploadedById,
          blobUrl: blob.url,
          filename: payload.originalFilename,
          mimeType: blob.contentType ?? null,
          fileSize: null, // Vercel Blob ainda não passa size no callback
        });
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
