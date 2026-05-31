import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Sentry wrapping — só ativa de fato quando SENTRY_DSN existe em runtime
 * (ver sentry.*.config.ts). Sem DSN, o SDK fica em no-op silencioso.
 *
 * Ao buildar com SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT, source
 * maps são enviados pro Sentry (stack trace fica legível). Sem essas
 * envs, o build segue normal só sem upload de source maps.
 */
export default withSentryConfig(nextConfig, {
  // Org/project só usados pra upload de source maps no build
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Silencioso em local; verbose só em CI
  silent: !process.env.CI,

  // Source maps com prefixo de path escondido (não vaza estrutura)
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  widenClientFileUpload: true,
});
