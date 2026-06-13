import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { categoryRules } from "@/db/schema";

/**
 * Extrai o trecho MAIS DISTINTIVO de uma descrição pra virar pattern de regra.
 *
 * Bancos brasileiros descrevem PIX/TED com prefixos variáveis:
 *   "Transferência PIX para FULANO"
 *   "Pagto FULANO 12345678900"
 *   "PIX-SIM para FULANO"
 *   "TED de FULANO"
 *   "DOC-COMP FULANO"
 *
 * Match exato perde isso. Match "contains" do prefixo inteiro também (porque
 * outra tx pode ter prefixo diferente).
 *
 * Heurística: se a descrição tem uma preposição/keyword conhecida, pega o
 * trecho APÓS ela — costuma ser o nome do destinatário/remetente. Caso
 * contrário, devolve a descrição inteira (faturas de cartão tipo
 * "POSTO SHELL DO BAIRRO" já são estáveis).
 *
 * Conservador: se o trecho resultante ficar muito curto (<3 caracteres),
 * devolve a descrição inteira pra não criar pattern que casa demais.
 */
export function extractMatchPattern(description: string): string {
  const d = description.trim();
  if (!d) return d;

  // Ordem importa — pega o trecho mais específico primeiro.
  const patterns: RegExp[] = [
    /\b(?:para|de)\s+(.+)$/i, // "Transferência PIX para X" / "TED de X"
    /^Pagto\s+(.+)$/i, // "Pagto X 12345"
    /^Pagamento\s+(?:PIX|TED|DOC|BOLETO)\s+(.+)$/i, // "Pagamento PIX X"
    /^(?:Pix|Ted|Doc|Tef)[-\s]?(?:enviado|sim|recebido)?\s+(?:para|de)\s+(.+)$/i,
  ];

  for (const re of patterns) {
    const m = d.match(re);
    if (m && m[1]) {
      // Remove identificadores numéricos longos (CPF/CNPJ) no fim — eles
      // variam por destinatário, mas o nome é estável.
      const stripped = m[1].replace(/\s+\d{8,}\s*$/, "").trim();
      if (stripped.length >= 3) return stripped;
    }
  }

  return d;
}

export type MatchableRule = {
  id: string;
  pattern: string;
  matchType: "exact" | "prefix" | "contains" | "regex";
  categoryId: string;
};

/**
 * Casa UMA descrição contra uma lista de regras já carregadas. Função PURA
 * (sem I/O) — permite ao upload carregar as regras uma vez e casar centenas
 * de tx em memória, em vez de 1 query por transação.
 *
 * Ordem de prioridade:
 *   1. matchType: exact > prefix > contains > regex
 *   2. empate no tipo: padrão MAIS LONGO primeiro ("Mercado Livre" ganha de
 *      "Mercado" — o mais específico decide).
 */
export function matchRules(
  rules: MatchableRule[],
  description: string,
  rawDescription?: string
): MatchableRule | null {
  if (rules.length === 0) return null;

  const desc = description.toLowerCase();
  const raw = (rawDescription ?? "").toLowerCase();
  const priority = { exact: 0, prefix: 1, contains: 2, regex: 3 } as const;
  const sorted = [...rules].sort(
    (a, b) =>
      priority[a.matchType] - priority[b.matchType] ||
      b.pattern.length - a.pattern.length
  );

  for (const rule of sorted) {
    const pattern = rule.pattern.toLowerCase();
    let match = false;
    switch (rule.matchType) {
      case "exact":
        match = desc === pattern || (raw.length > 0 && raw === pattern);
        break;
      case "prefix":
        match = desc.startsWith(pattern) || raw.startsWith(pattern);
        break;
      case "contains":
        match = desc.includes(pattern) || raw.includes(pattern);
        break;
      case "regex":
        try {
          const re = new RegExp(rule.pattern, "i");
          match = re.test(description) || (rawDescription ? re.test(rawDescription) : false);
        } catch {
          match = false;
        }
        break;
    }
    if (match) return rule;
  }

  return null;
}

/** Carrega as regras ativas do household (uma query). */
export async function loadActiveRules(householdId: string): Promise<MatchableRule[]> {
  return db.query.categoryRules.findMany({
    where: and(
      eq(categoryRules.householdId, householdId),
      eq(categoryRules.isActive, true)
    ),
  });
}

/**
 * Aplica regras de auto-categorização a UMA descrição (conveniência pra
 * fluxos de tx única, como criação manual). Pra lotes, use loadActiveRules +
 * matchRules e atualize lastAppliedAt em batch.
 */
export async function applyAutoCategorization(
  householdId: string,
  description: string,
  rawDescription?: string
): Promise<string | null> {
  const rules = await loadActiveRules(householdId);
  const hit = matchRules(rules, description, rawDescription);
  if (!hit) return null;

  // Tracking: marca regra como usada — alimenta o filtro "não usada há
  // 6+ meses" na tela de regras.
  await db
    .update(categoryRules)
    .set({ lastAppliedAt: new Date() })
    .where(eq(categoryRules.id, hit.id));
  return hit.categoryId;
}
