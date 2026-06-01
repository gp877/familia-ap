/**
 * Sentry config no BROWSER. Substitui o `sentry.client.config.ts` antigo
 * (deprecated). Next executa esse arquivo automaticamente em todos os
 * client bundles antes de qualquer outro código rodar.
 *
 * Sem NEXT_PUBLIC_SENTRY_DSN configurado, o init é skipado e o SDK fica
 * em no-op silencioso — não quebra dev/build/deploy.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: true,

    // 100% em dev pra capturar tudo enquanto testamos; 10% em produção
    // pra ficar dentro do free tier (5k errors/mês).
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Session Replay: só grava em sessões com erro (0% normais, 100% erro).
    // Zero overhead em sessão saudável; grava o vídeo quando estoura algo.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    enableLogs: true,

    environment: process.env.NODE_ENV,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
  });
}

// Hook do App Router pra tracing de navegação (page-to-page transitions).
// Sem isso, só request spans aparecem — com isso, navigation spans também.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
