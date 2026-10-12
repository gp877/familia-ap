/**
 * GET /api/agent — índice da API pra assistentes de IA (consulta e
 * lançamentos). Exige o mesmo token das demais rotas; ver lib/agent-api.
 */
import { agentRoute } from "@/lib/agent-api";

export const runtime = "nodejs";

export const GET = agentRoute(async () => ({
  api: "familia-ap / agent",
  versao: 2,
  autenticacao: "Authorization: Bearer <AGENT_API_TOKEN>",
  limites: "60 consultas/min · 30 lançamentos/min · 10 PDFs/min",
  moeda: "BRL",
  fluxo_recomendado: [
    "1. GET /api/agent/contas para descobrir o id da conta/cartão",
    "2. POST /api/agent/uploads com o PDF do extrato ou fatura (o app extrai, deduplica e categoriza sozinho)",
    "3. GET /api/agent/transacoes?status=pendente... — revise os pendentes e categorize com PATCH /api/agent/transacoes/{id}",
    "4. POST /api/agent/transacoes só para o que não tem PDF (ex.: dinheiro, PIX avulso)",
  ],
  rotas: [
    { metodo: "GET", caminho: "/api/agent/resumo", parametros: "mes=AAAA-MM (padrão: mês atual)" },
    {
      metodo: "GET",
      caminho: "/api/agent/transacoes",
      parametros:
        "de, ate (AAAA-MM-DD, padrão: mês atual, máx. 366 dias), tipo=receita|despesa, conta=<id>, categoria=<id>, status=pendente|confirmada|ignorada, incluir_internas=1, incluir_ignoradas=1, limite (1–2000), offset",
    },
    {
      metodo: "POST",
      caminho: "/api/agent/transacoes",
      corpo:
        '{"conta_id","data":"AAAA-MM-DD","descricao","valor":123.45,"tipo":"receita|despesa","categoria_id?","observacao?","permitir_duplicado?":false}',
      observacao: "Lançamento igual já existente → 409 com id_existente.",
    },
    {
      metodo: "PATCH",
      caminho: "/api/agent/transacoes/{id}",
      corpo:
        '{"categoria_id?":"<id>|null","criar_regra?":true,"status?":"pendente|confirmada|ignorada","divisoes?":[{"categoria_id","valor","nota?"}]}',
      observacao: "criar_regra também aplica a categoria em lançamentos parecidos ainda sem categoria.",
    },
    { metodo: "GET", caminho: "/api/agent/uploads", parametros: "limite (padrão 20)" },
    {
      metodo: "POST",
      caminho: "/api/agent/uploads",
      corpo: "multipart/form-data: file=<PDF até 10 MB, sem senha>, bankAccountId=<id>, sourceType?=bank_statement|credit_card_invoice",
      observacao: "Mesmo PDF duas vezes → 409.",
    },
    { metodo: "GET", caminho: "/api/agent/contas" },
    { metodo: "GET", caminho: "/api/agent/categorias", parametros: "mes=AAAA-MM (padrão: mês atual)" },
  ],
  sem_exclusao: "Não há rota de exclusão: no app, apagar é permanente. Use status=ignorada.",
}));
