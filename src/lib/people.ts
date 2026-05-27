/**
 * Membros do household para tagging em compromissos, pesagens, exames, etc.
 * Lista canônica — mudar aqui propaga pra todas as telas.
 */
export const HOUSEHOLD_PEOPLE = ["Gabriel", "Marília", "Francisco", "Bebê"] as const;
export type HouseholdPerson = (typeof HOUSEHOLD_PEOPLE)[number];

/** Adultos (donos das contas, perfis no header). */
export const HOUSEHOLD_ADULTS = ["Gabriel", "Marília"] as const;

export function personColor(who: string): string {
  const k = who.toUpperCase();
  if (k.startsWith("G")) return "var(--accent)";
  if (k.startsWith("M")) return "#FF4FA3"; // rosa (mesma da Marília no layout)
  if (k.startsWith("F")) return "#B57FFF"; // Francisco
  if (k.startsWith("B")) return "#5DA9FF"; // Bebê
  return "var(--ink)";
}

export function personInitial(who: string): string {
  return (who.slice(0, 1) || "?").toUpperCase();
}
