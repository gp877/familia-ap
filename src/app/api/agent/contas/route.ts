/**
 * GET /api/agent/contas — contas e cartões, com saldo do último extrato
 * (contas) e faturas não pagas (cartões). Somente leitura; ver lib/agent-api.
 */
import { agentRoute } from "@/lib/agent-api";
import { getAccountsWithBalances } from "@/lib/agent-queries";

export const runtime = "nodejs";

export const GET = agentRoute(async ({ householdId }) => getAccountsWithBalances(householdId));
