/**
 * Wrapper do WhatsApp Cloud API (Meta).
 *
 * Configuração necessária (env vars):
 *   WHATSAPP_VERIFY_TOKEN     — string qualquer que você define ao plugar o webhook na Meta
 *   WHATSAPP_TOKEN            — permanent access token (Meta Business → System User)
 *   WHATSAPP_PHONE_NUMBER_ID  — phone number ID do app WhatsApp Business (Meta dashboard)
 *
 * Setup resumido:
 *   1. Criar app no developers.facebook.com → Adicionar produto "WhatsApp"
 *   2. Pegar phone_number_id e gerar permanent token (System User)
 *   3. Settings → Webhooks → URL: https://familia-ap.vercel.app/api/whatsapp
 *      Verify token: o mesmo que você colocar em WHATSAPP_VERIFY_TOKEN
 *      Subscrever ao campo "messages"
 *   4. Cadastrar telefone E.164 (+5511…) no campo `phone` do usuário (configurações)
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

export type IncomingWhatsAppMessage = {
  from: string; // E.164 sem o "+", ex: "5511999999999"
  text: string;
  messageId: string;
};

/**
 * Envia mensagem de texto via WhatsApp Cloud API.
 * Retorna o ID da mensagem na Meta ou lança erro.
 */
export async function sendWhatsAppMessage(toE164: string, text: string): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error("WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID precisam estar configurados.");
  }

  const url = `${GRAPH_API_BASE}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace(/^\+/, ""),
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao enviar WhatsApp (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { messages?: { id: string }[] };
  return json.messages?.[0]?.id ?? "";
}

/**
 * Normaliza um número para E.164 com "+" no início.
 * Útil pra match com a coluna users.phone.
 */
export function normalizeE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

/**
 * Extrai a mensagem de texto de um webhook payload do WhatsApp Cloud API.
 * Retorna null se o payload não for uma mensagem de texto entrante.
 */
export function extractIncomingMessage(payload: unknown): IncomingWhatsAppMessage | null {
  try {
    const entry = (payload as { entry?: unknown[] }).entry?.[0];
    const change = (entry as { changes?: unknown[] })?.changes?.[0];
    const value = (change as { value?: unknown }).value as {
      messages?: { from: string; id: string; type: string; text?: { body: string } }[];
    };
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "text" || !msg.text?.body) return null;
    return {
      from: msg.from,
      text: msg.text.body,
      messageId: msg.id,
    };
  } catch {
    return null;
  }
}
