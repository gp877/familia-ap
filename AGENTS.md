<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## API para assistentes de IA (`/api/agent/*`)

- Somente leitura (só `GET`), autenticada por `Authorization: Bearer <AGENT_API_TOKEN>`
  (env na Vercel, mín. 32 caracteres; sem ela a API recusa tudo). Não usa a sessão do Google.
- Lógica comum em `src/lib/agent-api.ts` (token timing-safe, rate limit 60/min por IP,
  household) e `src/lib/agent-queries.ts` (saldos, filtro de lançamentos reais).
- Totais seguem a regra do Dashboard: excluem transferências internas e status `ignored`.
- Nunca expor: tokens/sessões, `rawDescription`, chave PIX/código de barras dos recorrentes,
  conteúdo de uploads. Rota nova = mesma `agentRoute()` e só leitura.
