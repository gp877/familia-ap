import type { aiSettings } from "@/db/schema";

type AiSettings = typeof aiSettings.$inferSelect;

/**
 * Gera a parte do system prompt derivada das preferências do household.
 * Em arquivo separado de actions/ai-settings.ts porque actions exportam
 * só async (uso "use server"), e isso aqui é função pura.
 */
export function aiSettingsToSystemPrompt(s: AiSettings): string {
  const parts: string[] = [];

  const tone =
    s.tone === "formal"
      ? "Tom: formal, profissional, respeitoso. Cortesia explícita."
      : s.tone === "divertido"
        ? "Tom: leve e divertido, brincadeiras sutis quando couber, mas sempre informativo."
        : "Tom: conversacional, íntimo, português brasileiro. Primeira pessoa do plural quando relevante (\"vocês\", \"a gente\").";
  parts.push(tone);

  const length =
    s.responseLength === "detalhado"
      ? "Resposta: detalhada quando o assunto pede. Pode usar listas e estruturação. Mas nunca enrole."
      : s.responseLength === "medio"
        ? "Resposta: 2-4 frases tipicamente. Pode estruturar quando ajudar."
        : "Resposta: curta e direta. 1-2 frases na maioria dos casos.";
  parts.push(length);

  parts.push(s.allowEmoji ? "Pode usar emoji com moderação." : "NUNCA use emoji.");
  parts.push(
    s.callsUserByName
      ? "Chame os usuários pelo primeiro nome quando souber quem está falando."
      : "Não use nomes pessoais nas respostas."
  );
  parts.push(
    s.autoSaveMemories
      ? "Use salvar_memoria proativamente quando aprender algo importante e durável."
      : "Só salve memória se o usuário pedir explicitamente."
  );

  if (s.alma) {
    parts.push(`\nAlma da AP (personalidade definida pela família):\n${s.alma}`);
  }
  if (s.customInstructions) {
    parts.push(`\nInstruções adicionais:\n${s.customInstructions}`);
  }

  return parts.join("\n");
}
