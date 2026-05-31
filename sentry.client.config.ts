/**
 * Sentry config rodando no BROWSER (chunks client-side de Next).
 * Sem NEXT_PUBLIC_SENTRY_DSN configurado, o init não faz nada (no-op),
 * então rodar sem conta Sentry não quebra desenvolvimento.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Sample tracing/replay agressivamente em dev, baixo em prod
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
    environment: process.env.NODE_ENV,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
  });
}
