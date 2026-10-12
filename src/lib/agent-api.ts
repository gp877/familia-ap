/**
 * API somente leitura pra assistentes de IA externos (/api/agent/*).
 *
 * Autenticação: `Authorization: Bearer <AGENT_API_TOKEN>`, sem sessão do
 * Google. Fail-closed: sem a env configurada (ou curta demais), recusa tudo.
 *
 * Household: o app usa o modelo "casal compartilha 1 household". O token
 * enxerga só esse household. Se um dia existir mais de um, é obrigatório
 * apontar qual em AGENT_HOUSEHOLD_ID — senão a API recusa (nunca chuta).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/db";

const MIN_TOKEN_LENGTH = 32;

// ── Rate limit ────────────────────────────────────────────────────
// Janela fixa em memória, por IP. Na Vercel cada instância tem a sua
// memória, então é um freio simples (não um limite global exato) — basta
// pra conter loop descontrolado de agente e tentativa de força bruta.
const RATE_LIMIT = 60; // requisições
const RATE_WINDOW_MS = 60_000; // por minuto
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return { ok: b.count <= RATE_LIMIT, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// ── Token ─────────────────────────────────────────────────────────
/** Compara via SHA-256 dos dois lados: mesmo tamanho sempre, tempo constante. */
function tokenMatches(received: string, expected: string): boolean {
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ── Household ─────────────────────────────────────────────────────
async function resolveHouseholdId(): Promise<string | null> {
  const configured = process.env.AGENT_HOUSEHOLD_ID?.trim();
  if (configured) return (await householdExists(configured)) ? configured : null;
  const rows = await db.query.households.findMany({ columns: { id: true }, limit: 2 });
  return rows.length === 1 ? rows[0].id : null;
}

async function householdExists(id: string): Promise<boolean> {
  const row = await db.query.households.findFirst({
    columns: { id: true },
    where: (h, { eq }) => eq(h.id, id),
  });
  return !!row;
}

// ── Respostas ─────────────────────────────────────────────────────
const NO_STORE = { "Cache-Control": "no-store" };

export function agentJson(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export class AgentInputError extends Error {}

/**
 * Envolve um handler GET: rate limit → token → household → handler.
 * Erros de validação viram 400; o resto vira 500 genérico (sem vazar detalhe).
 */
export function agentRoute(
  handler: (ctx: { householdId: string; url: URL }) => Promise<unknown>
) {
  return async function GET(req: Request) {
    const rl = rateLimit(clientIp(req));
    if (!rl.ok) {
      return agentJson({ erro: "Muitas requisições. Tente de novo em instantes." }, 429, {
        "Retry-After": String(rl.retryAfter),
      });
    }

    const expected = process.env.AGENT_API_TOKEN ?? "";
    const header = req.headers.get("authorization") ?? "";
    const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (expected.length < MIN_TOKEN_LENGTH || !received || !tokenMatches(received, expected)) {
      return agentJson({ erro: "Não autorizado" }, 401, { "WWW-Authenticate": "Bearer" });
    }

    try {
      const householdId = await resolveHouseholdId();
      if (!householdId) {
        return agentJson({ erro: "Household não configurado (AGENT_HOUSEHOLD_ID)" }, 500);
      }
      const data = await handler({ householdId, url: new URL(req.url) });
      return agentJson(data);
    } catch (err) {
      if (err instanceof AgentInputError) return agentJson({ erro: err.message }, 400);
      console.error("[api/agent]", err);
      return agentJson({ erro: "Erro interno" }, 500);
    }
  };
}

// ── Datas (sempre no fuso de Brasília) ────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function todayBrt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function parseDateParam(value: string | null, name: string): string | null {
  if (!value) return null;
  if (!DATE_RE.test(value) || isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AgentInputError(`Parâmetro "${name}" inválido — use AAAA-MM-DD`);
  }
  return value;
}

/** `?mes=AAAA-MM` (padrão: mês atual) → primeiro e último dia do mês. */
export function parseMonthParam(value: string | null) {
  const ym = value ?? todayBrt().slice(0, 7);
  if (!MONTH_RE.test(ym)) throw new AgentInputError('Parâmetro "mes" inválido — use AAAA-MM');
  const [year, month] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    mes: ym,
    year,
    month,
    de: `${ym}-01`,
    ate: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isoDate(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "conta_corrente",
  savings: "poupanca",
  credit_card: "cartao_credito",
  investment: "investimento",
  other: "outro",
};
