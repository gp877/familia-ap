/**
 * Helpers determinísticos pra pagamentos recorrentes — cálculo de período
 * corrente, due date e status.
 *
 * Status do pagamento NESTE período:
 *   "paid"     — record existe pro período corrente
 *   "due"      — não pago, mas ainda dentro do mês/ano corrente, antes
 *                ou no vencimento
 *   "overdue"  — não pago e vencimento já passou
 */

export type RecurringFreq = "monthly" | "yearly";

export type PaymentStatus = "paid" | "due" | "overdue";

/**
 * Período corrente pra qual o pagamento deve ser considerado.
 * monthly → "YYYY-MM" do mês atual
 * yearly  → "YYYY" do ano atual
 */
export function currentPeriod(freq: RecurringFreq, now: Date = new Date()): string {
  if (freq === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(now.getFullYear());
}

/**
 * Data de vencimento do período corrente.
 * monthly → dia X do mês atual (clamp se dia > último dia do mês)
 * yearly  → dia X do mês Y do ano atual
 */
export function dueDateOfCurrentPeriod(
  freq: RecurringFreq,
  dueDay: number,
  dueMonth: number | null,
  now: Date = new Date()
): Date {
  const year = now.getFullYear();
  if (freq === "monthly") {
    const month = now.getMonth(); // 0-based
    return clampDayToMonth(year, month, dueDay);
  }
  const month = (dueMonth ?? 1) - 1;
  return clampDayToMonth(year, month, dueDay);
}

/**
 * Trata fevereiro 30/31 etc — usa o último dia do mês se dueDay extrapolar.
 */
function clampDayToMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  const d = new Date(year, month, safeDay);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Determina o status do pagamento para o período corrente.
 */
export function computeStatus(args: {
  frequency: RecurringFreq;
  dueDay: number;
  dueMonth: number | null;
  recordedPeriods: Set<string>; // periodos já pagos
  now?: Date;
}): { status: PaymentStatus; period: string; dueDate: Date; daysUntilDue: number } {
  const now = args.now ?? new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const period = currentPeriod(args.frequency, now);
  const dueDate = dueDateOfCurrentPeriod(
    args.frequency,
    args.dueDay,
    args.dueMonth,
    now
  );

  const daysUntilDue = Math.round(
    (dueDate.getTime() - today.getTime()) / 86_400_000
  );

  let status: PaymentStatus;
  if (args.recordedPeriods.has(period)) {
    status = "paid";
  } else if (daysUntilDue < 0) {
    status = "overdue";
  } else {
    status = "due";
  }

  return { status, period, dueDate, daysUntilDue };
}

/**
 * Formata o período pra exibição: "jun/2026" ou "2026".
 */
export function formatPeriod(period: string): string {
  if (period.length === 4) return period; // yearly
  const [y, m] = period.split("-").map(Number);
  const monthName = new Date(y, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
  return `${monthName}/${y}`;
}

/**
 * Nível de urgência baseado em dias até vencer + status.
 * Usado pra colorir o ponto/borda do card.
 */
export type UrgencyLevel = "paid" | "ok" | "soon" | "urgent" | "overdue";

export function urgencyOf(status: PaymentStatus, daysUntilDue: number): UrgencyLevel {
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  if (daysUntilDue <= 2) return "urgent";
  if (daysUntilDue <= 7) return "soon";
  return "ok";
}

/**
 * Formata data de vencimento: "10/jun" ou "10/jun (em 5 dias)".
 */
export function formatDueDate(dueDate: Date, daysUntil: number): string {
  const dd = dueDate
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(".", "");
  if (daysUntil === 0) return `${dd} (hoje)`;
  if (daysUntil > 0) return `${dd} (em ${daysUntil}d)`;
  return `${dd} (atrasado ${Math.abs(daysUntil)}d)`;
}
