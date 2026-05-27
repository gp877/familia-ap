import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { processChatTurnWithTools } from "@/app/actions/chat-bar";
import {
  extractIncomingMessage,
  normalizeE164,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";

/**
 * Webhook do WhatsApp Cloud API (Meta).
 *
 *   GET   /api/whatsapp  — verificação inicial pela Meta (hub.challenge)
 *   POST  /api/whatsapp  — recebe mensagens
 *
 * Fluxo do POST:
 *   1. Extrai mensagem e telefone do payload
 *   2. Localiza users.phone correspondente (E.164)
 *   3. Se mapeado, chama processChatTurnWithTools (mesmo núcleo do chat web)
 *   4. Envia resposta da AP de volta via Cloud API
 *
 * Telefones não mapeados recebem uma resposta padrão. Bloqueia ataques porque
 * só responde quem está cadastrado em users.phone.
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const incoming = extractIncomingMessage(payload);
  if (!incoming) {
    // Não é mensagem de texto (pode ser status update, delivery, etc) — apenas confirma
    return NextResponse.json({ ok: true });
  }

  const senderE164 = normalizeE164(incoming.from);

  // Localiza o usuário pelo telefone
  const user = await db.query.users.findFirst({
    where: eq(users.phone, senderE164),
  });

  if (!user || !user.householdId) {
    console.warn("[whatsapp] número não autorizado:", senderE164);
    try {
      await sendWhatsAppMessage(
        incoming.from,
        "Este número não está cadastrado na Família AP. Peça pra um membro adicionar seu telefone nas configurações."
      );
    } catch (err) {
      console.error("[whatsapp] falha ao avisar não-autorizado:", err);
    }
    return NextResponse.json({ ok: true });
  }

  // Processa a mensagem via mesmo núcleo do chat web
  try {
    const { assistantMsg } = await processChatTurnWithTools(
      incoming.text,
      user.householdId,
      user.id
    );
    await sendWhatsAppMessage(incoming.from, assistantMsg.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp] erro processando mensagem:", err);
    try {
      await sendWhatsAppMessage(incoming.from, `(erro processando: ${msg.slice(0, 200)})`);
    } catch {
      // ignora — já logamos
    }
  }

  return NextResponse.json({ ok: true });
}
