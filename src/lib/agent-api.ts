/**
 * API pra assistentes de IA (/api/agent/*): consulta E lançamentos.
 *
 * Autenticação: `Authorization: Bearer <AGENT_API_TOKEN>`, sem sessão do
 * Google. Fail-closed: sem a env configurada (ou curta demais), recusa tudo.
 *
 * Household: o token enxerga só o household da família — o dos usuários em
 * ALLOWED_EMAILS (o banco tem outros households). AGENT_HOUSEHOLD_ID
 * sobrescreve. Se não der exatamente um, a API recusa (nunca chuta).
 * Escritas são gravadas em nome do primeiro e-mail de ALLOWED_EMAILS da família.
 *
 * Escritas reaproveitam o MESMO código das telas (lib/upload-pipeline,
 * lib/transactions-core) — nada de segundo caminho com regra diferente.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/db";

const MIN_TOKEN_LENGTH = 32;

// ── Rate limit ────────────────────────────────────────────────────
// Janela fixa em memória, por IP. Na Vercel cada instância tem a sua
// memória, então é um freio simples (não um limite global exato) — basta
// pra conter loop descontrolado de agente e tentativa de força bruta.
const RATE_LIMIT = 60; // requisições por minuto (padrão)
const RATE_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number): { ok: boolean; retryAfter: number } {
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
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
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

// ── Household + autor ─────────────────────────────────────────────
export type AgentActor = { householdId: string; userId: string };

async function resolveActor(): Promise<AgentActor | null> {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return null;
  const members = await db.query.users.findMany({
    columns: { id: true, email: true, householdId: true },
    where: (u, { and, inArray, isNotNull, sql }) =>
      and(inArray(sql`lower(${u.email})`, allowed), isNotNull(u.householdId)),
  });

  const configured = process.env.AGENT_HOUSEHOLD_ID?.trim();
  const ids = new Set(members.map((m) => m.householdId!));
  const householdId = configured || (ids.size === 1 ? [...ids][0] : null);
  if (!householdId) return null;

  // Autor = primeiro e-mail da lista que pertence ao household
  const family = members
    .filter((m) => m.householdId === householdId)
    .sort((a, b) => allowed.indexOf(a.email.toLowerCase()) - allowed.indexOf(b.email.toLowerCase()));
  return family.length ? { householdId, userId: family[0].id } : null;
}

// ── Respostas ─────────────────────────────────────────────────────
const NO_STORE = { "Cache-Control": "no-store" };

export function agentJson(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export class AgentInputError extends Error {}
export class AgentNotFoundError extends Error {}

export type AgentContext = AgentActor & {
  req: Request;
  url: URL;
  params: Record<string, string>;
};

/**
 * Envolve um handler: rate limit → token → household/autor → handler.
 * O handler devolve um objeto (vira JSON 200) ou uma Response pronta.
 * AgentInputError → 400; AgentNotFoundError → 404; o resto → 500 genérico.
 */
export function agentRoute(
  handler: (ctx: AgentContext) => Promise<unknown>,
  opts: { rateLimit?: number } = {}
) {
  return async function route(
    req: Request,
    ctx?: { params?: Promise<Record<string, string>> }
  ) {
    const url = new URL(req.url);
    const limit = opts.rateLimit ?? RATE_LIMIT;
    const rl = rateLimit(`${clientIp(req)}|${limit === RATE_LIMIT ? "*" : url.pathname}`, limit);
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
      const actor = await resolveActor();
      if (!actor) {
        return agentJson({ erro: "Household não configurado (ALLOWED_EMAILS / AGENT_HOUSEHOLD_ID)" }, 500);
      }
      const params = (await ctx?.params) ?? {};
      const data = await handler({ ...actor, req, url, params });
      return data instanceof Response ? data : agentJson(data);
    } catch (err) {
      if (err instanceof AgentInputError) return agentJson({ erro: err.message }, 400);
      if (err instanceof AgentNotFoundError) return agentJson({ erro: err.message }, 404);
      console.error("[api/agent]", err);
      return agentJson({ erro: "Erro interno" }, 500);
    }
  };
}

/** Lê o corpo JSON; corpo ausente/inválido vira 400. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new AgentInputError("Corpo da requisição deve ser um objeto JSON");
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

/**
 * Executa uma regra compartilhada (lib/*-core) traduzindo os erros de
 * validação dela pro status certo: "não encontrada" → 404, inválido → 400.
 */
export async function coreCall<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/não encontrad/i.test(msg)) throw new AgentNotFoundError(msg);
    if (/obrigatóri|inválid|soma dos splits/i.test(msg)) throw new AgentInputError(msg);
    throw err;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AgentInputError(`"${name}" deve ser um id (uuid)`);
  }
  return value;
}

/** Valor em reais (número ou "1234.56") → string com 2 casas, sempre positivo. */
export function moneyValue(value: unknown, name: string): string {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new AgentInputError(`"${name}" deve ser um número positivo (ex.: 123.45)`);
  }
  return n.toFixed(2);
}
