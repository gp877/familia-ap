import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Sentry wrapping. Sem SENTRY_DSN em runtime, o SDK fica em no-op
 * silencioso (ver instrumentation-client.ts e sentry.server.config.ts).
 */
export default withSentryConfig(nextConfig, {
  // Slugs pra upload de source maps no build
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Silencioso em local; verbose só em CI
  silent: !process.env.CI,

  // Upload uma cobertura maior de arquivos client → stack traces mais
  // completas em produção
  widenClientFileUpload: true,

  // Tunnel route pra contornar ad-blockers que bloqueiam *.sentry.io
  // (UBlock etc). Os events do browser são proxiados via /monitoring
  // no nosso domínio, o que ad-blocker não tem como detectar.
  tunnelRoute: "/monitoring",

  // Delete source maps do bundle final (não vazam código pro client),
  // mas upload pro Sentry já foi feito
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
