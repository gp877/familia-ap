/**
 * Hook do Next App Router pra inicializar coisas no boot do servidor.
 * É o ponto correto pra registrar o Sentry no server e edge runtime
 * (substitui a antiga init em `_app.tsx` do Pages Router).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Hook que reporta automaticamente erros que vêm do react Server Components
 * pro Sentry. Sem esse hook, RSC errors só aparecem como "An error occurred
 * in the Server Components render" genéricos no browser.
 */
export { captureRequestError as onRequestError } from "@sentry/nextjs";
