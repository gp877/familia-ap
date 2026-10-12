/**
 * GET /api/agent — índice da API somente leitura pra assistentes de IA.
 * Exige o mesmo token das demais rotas; ver lib/agent-api.
 */
import { agentRoute } from "@/lib/agent-api";

export const runtime = "nodejs";

export const GET = agentRoute(async () => ({
  api: "familia-ap / agent",
  versao: 1,
  somente_leitura: true,
  autenticacao: "Authorization: Bearer <AGENT_API_TOKEN>",
  limite: "60 requisições por minuto",
  moeda: "BRL",
  rotas: [
    { caminho: "/api/agent/resumo", parametros: "mes=AAAA-MM (padrão: mês atual)" },
    {
      caminho: "/api/agent/transacoes",
      parametros:
        "de, ate (AAAA-MM-DD, padrão: mês atual, máx. 366 dias), tipo=receita|despesa, conta=<id>, categoria=<id>, incluir_internas=1, incluir_ignoradas=1, limite (1–2000), offset",
    },
    { caminho: "/api/agent/contas", parametros: null },
    { caminho: "/api/agent/categorias", parametros: "mes=AAAA-MM (padrão: mês atual)" },
  ],
}));
