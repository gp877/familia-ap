import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { processPdfUpload } from "@/lib/upload-pipeline";

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

  return processPdfUpload(req, { userId: dbUser.id, householdId: dbUser.householdId });
}
