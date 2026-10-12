<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## API para assistentes de IA (`/api/agent/*`)

- Consulta E lançamentos, autenticada por `Authorization: Bearer <AGENT_API_TOKEN>`
  (env na Vercel, mín. 32 caracteres; sem ela a API recusa tudo). Não usa a sessão do Google.
- Lógica comum em `src/lib/agent-api.ts` (token timing-safe, rate limit por IP, household =
  o dos usuários em `ALLOWED_EMAILS`; escritas em nome do 1º e-mail da lista) e
  `src/lib/agent-queries.ts` (saldos, filtro de lançamentos reais).
- Escritas reaproveitam o código das telas: `src/lib/upload-pipeline.ts` (PDF) e
  `src/lib/transactions-core.ts` (criar/categorizar/status/divisões). Regra nova de escrita
  entra no core, nunca só na rota ou só na action.
- Sem exclusão pela API (apagar no app é permanente); usar status `ignorada`.
- Totais seguem a regra do Dashboard: excluem transferências internas e status `ignored`.
- Nunca expor: tokens/sessões, `rawDescription`, chave PIX/código de barras dos recorrentes,
  URL/conteúdo dos PDFs.
