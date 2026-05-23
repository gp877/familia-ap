import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { categoryRules } from "@/db/schema";

/**
 * Aplica regras de auto-categorização ao description.
 * Retorna o categoryId do match (ou null se nenhuma regra bater).
 *
 * Ordem: regras mais específicas primeiro (exact > prefix > contains > regex).
 */
export async function applyAutoCategorization(
  householdId: string,
  description: string
): Promise<string | null> {
  const rules = await db.query.categoryRules.findMany({
    where: and(
      eq(categoryRules.householdId, householdId),
      eq(categoryRules.isActive, true)
    ),
  });

  if (rules.length === 0) return null;

  const desc = description.toLowerCase();
  const priority = { exact: 0, prefix: 1, contains: 2, regex: 3 } as const;
  const sorted = [...rules].sort(
    (a, b) => priority[a.matchType] - priority[b.matchType]
  );

  for (const rule of sorted) {
    const pattern = rule.pattern.toLowerCase();
    let match = false;
    switch (rule.matchType) {
      case "exact":
        match = desc === pattern;
        break;
      case "prefix":
        match = desc.startsWith(pattern);
        break;
      case "contains":
        match = desc.includes(pattern);
        break;
      case "regex":
        try {
          match = new RegExp(rule.pattern, "i").test(description);
        } catch {
          match = false;
        }
        break;
    }
    if (match) return rule.categoryId;
  }

  return null;
}
