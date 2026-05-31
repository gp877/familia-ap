/**
 * Sentry config rodando no SERVER (Node, Server Components, server actions,
 * API routes). Aqui captura os erros do tipo "Server Components render"
 * que o Next esconde do browser por segurança.
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
