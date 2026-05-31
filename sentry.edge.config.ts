/**
 * Sentry config no EDGE runtime (middleware, edge route handlers).
 * No nosso projeto não usamos edge ainda, mas Next 13+ exige esse
 * arquivo se withSentryConfig estiver ativo.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    environment: process.env.NODE_ENV,
  });
}
