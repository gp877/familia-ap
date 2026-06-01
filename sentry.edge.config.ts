/**
 * Sentry config no EDGE runtime (middleware, edge route handlers).
 * Não usamos edge ainda, mas Next 13+ exige esse arquivo se
 * withSentryConfig estiver ativo.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: true,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    enableLogs: true,
    environment: process.env.NODE_ENV,
  });
}
