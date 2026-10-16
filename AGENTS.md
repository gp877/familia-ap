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
- **Lixeira (`src/lib/trash.ts`)**: excluir lançamento/extrato/fatura NUNCA apaga direto —
  copia a linha inteira (`to_jsonb`) pra `trash_item` e só então apaga; restaurar recria com o
  mesmo id e religa as FKs "set null". Toda exclusão nova do financeiro passa por `trashEntities`.
  Tabela nova com FK pra transaction/upload/invoice → atualizar `INBOUND`/`OUTBOUND` lá.
  Esvaziar a lixeira só pelas telas (a API não tem purge).
- **Selo IA**: `transaction.created_via` / `upload.created_via` = `"agent"` quando veio da API;
  `transaction.agent_updated_at` = última revisão pela IA. Mostrado como "IA" / "rev. IA" na lista.
- Totais seguem a regra do Dashboard: excluem transferências internas e status `ignored`.
- Nunca expor: tokens/sessões, `rawDescription`, chave PIX/código de barras dos recorrentes,
  URL/conteúdo dos PDFs.

## Espaço de trabalho / Tarefas (`/tarefas`) — modelo do Notion

- Tabela única `ws_page`: TUDO é página. `kind` = `page` (blocos em `content`), `database`
  (`schema.properties` + `views`) ou `row` (linha de banco: `props` por id de propriedade).
- **Privado por padrão**: só o dono (`owner_id`) vê; `visibility = household` compartilha.
  Filho herda do pai; mudar visibilidade propaga pra árvore (só o dono muda).
- Excluir = `archived_at` na árvore inteira com o MESMO instante (Lixeira em `/tarefas/lixeira`);
  restaurar volta o que foi junto. Apagar de vez só pela tela.
- Lógica em `src/lib/workspace.ts` (com actor) + `workspace-model.ts` (tipos, filtros, visões — puro).
  Telas em `src/components/ws/`. API: `/api/agent/tarefas` e `/api/agent/paginas` falam por NOMES
  (`lib/agent-workspace.ts`); opção de seleção nova é criada sozinha, Status não.
- Espaço inicial (boas-vindas + banco "Tarefas" `system_key=tasks`) criado na 1ª visita,
  idempotente por índice único (owner_id, system_key).
- Agente age como o 1º e-mail de `ALLOWED_EMAILS` do household (ou `AGENT_OWNER_EMAIL`);
  `GET /api/agent` mostra `atuando_como`.
