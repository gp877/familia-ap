# Sentry — passos finais

Tudo já está configurado no código. Faltam só os credenciais:

## 1. Criar conta + projeto

1. Vai em [sentry.io](https://sentry.io) e cria conta (free tier inclui 5k errors/mês — sobra muito)
2. **Create project** → escolhe **Next.js** → dá nome `familia-ap`
3. Na tela seguinte aparece o **DSN** (uma URL tipo `https://abc123@o123.ingest.us.sentry.io/456`)
4. Em **Settings → Auth Tokens** → cria um token com escopo `project:releases` (pra upload de source maps)

## 2. Local (`.env.local`)

Adiciona ao final do arquivo:

```
NEXT_PUBLIC_SENTRY_DSN="https://abc123@o123.ingest.us.sentry.io/456"
SENTRY_DSN="https://abc123@o123.ingest.us.sentry.io/456"
SENTRY_ORG="<teu-org-slug>"
SENTRY_PROJECT="familia-ap"
SENTRY_AUTH_TOKEN="<token-criado-no-passo-1>"
```

> **Observação:** `NEXT_PUBLIC_SENTRY_DSN` e `SENTRY_DSN` têm o **mesmo valor**. A diferença é que o `NEXT_PUBLIC_*` é exposto pro browser, e o sem prefixo fica só no server.

## 3. Vercel

Mesma coisa em **vercel.com/<projeto>/settings/environment-variables** — adiciona as 5 vars acima (escopo: Production + Preview + Development).

Depois disso, qualquer push pra `main` faz upload automático dos source maps no build, e erros já caem no dashboard do Sentry com stack trace legível.

## 4. Verificar

Depois de configurado, força um erro pra testar:

```bash
curl https://familia-ap.vercel.app/api/sentry-example-api
```

Em 30 segundos o erro aparece no painel do Sentry.

## O que está instalado

- `@sentry/nextjs` (SDK oficial)
- `sentry.client.config.ts` — captura no browser, com session replay em erro
- `sentry.server.config.ts` — captura em server actions, RSC, API routes
- `sentry.edge.config.ts` — captura em middleware (não usamos, mas Next exige)
- `src/instrumentation.ts` — boot hook + `onRequestError` (reporta erros RSC)
- `src/app/(app)/error.tsx` — error boundary que chama `Sentry.captureException`
- `next.config.ts` envolvido com `withSentryConfig` — upload de source maps

## Sem DSN configurado

O SDK fica em **no-op silencioso** — não quebra build nem dev, só não captura nada.

## Custo

- **Free tier:** 5.000 errors + 10.000 performance events / mês — sobra muito pra esse projeto
- **Source maps upload:** gratuito ilimitado
- **Session replay:** já configurei só em erro (`replaysOnErrorSampleRate: 1.0`), não em sessões normais (zero overhead)
