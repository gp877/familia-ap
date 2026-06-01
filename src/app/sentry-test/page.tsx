/**
 * Rota de teste pra verificar que Sentry está capturando erros.
 *
 * Acesse /sentry-test → dispara erro no server → aparece no Sentry em
 * ~30 segundos. Depois, remover esta rota.
 */
export const dynamic = "force-dynamic";

export default function SentryTestPage() {
  throw new Error("Sentry test error — server side (RSC). Pode deletar.");
}
