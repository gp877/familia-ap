/**
 * Membros do household para tagging em compromissos, pesagens, exames, etc.
 * Lista canônica — mudar aqui propaga pra todas as telas.
 */
export const HOUSEHOLD_PEOPLE = ["Gabriel", "Marília", "Francisco"] as const;
export type HouseholdPerson = (typeof HOUSEHOLD_PEOPLE)[number];

export function personColor(who: string): string {
  const k = who.toUpperCase();
  if (k.startsWith("G")) return "var(--accent)";
  if (k.startsWith("M")) return "#5DA9FF";
  if (k.startsWith("F")) return "#B57FFF";
  return "var(--ink)";
}

export function personInitial(who: string): string {
  return (who.slice(0, 1) || "?").toUpperCase();
}
