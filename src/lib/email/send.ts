import { Resend } from "resend";

/**
 * Wrapper sobre o SDK do Resend. Se RESEND_API_KEY não estiver setado,
 * `send` vira no-op silencioso — útil pra rodar dev/build sem conta.
 */

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Remetente padrão. `onboarding@resend.dev` é o "FROM" gratuito do Resend
 * pra testes — funciona sem configurar DNS mas só envia pra emails
 * verificados no painel da conta Resend.
 *
 * Quando tivermos domínio próprio, troca aqui pra `notificacoes@<dominio>`.
 */
const FROM = process.env.RESEND_FROM || "Família AP <onboarding@resend.dev>";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** React Email JSX */
  react: React.ReactElement;
  /** Tag opcional pra agrupar no dashboard do Resend */
  tag?: string;
};

export type SendEmailResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** True quando Resend não está configurado — chamada virou no-op */
  skippedNoConfig?: boolean;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY não configurada — email skipado");
    return { ok: false, skippedNoConfig: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      react: input.react,
      tags: input.tag ? [{ name: "category", value: input.tag }] : undefined,
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    return { ok: true, providerId: result.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
