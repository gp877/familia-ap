/**
 * Sentry config rodando no SERVER (Node — Server Components, server
 * actions, API routes). Captura erros do tipo "Server Components render"
 * que o Next esconde do browser por segurança.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: true,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Local variables nas stack frames — debug fica MUITO mais útil
    includeLocalVariables: true,

    enableLogs: true,
    environment: process.env.NODE_ENV,
  });
}
