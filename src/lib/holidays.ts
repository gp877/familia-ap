/**
 * Catálogo de feriados/datas comemorativas brasileiras.
 *
 * Tudo é calculado deterministicamente — sem IA, sem cron, sem banco.
 * Toda vez que getHolidaysForYear(2027) for chamada, retorna a lista
 * correta com as datas certas pra aquele ano. Vivo sem precisar de
 * manutenção.
 *
 * Datas móveis usam o algoritmo de Gauss/Meeus pra Páscoa, e derivam
 * Carnaval (Páscoa − 47 dias), Sexta Santa (Páscoa − 2), Corpus Christi
 * (Páscoa + 60).
 *
 * Datas que dependem de "Nº domingo do mês" (Mães, Pais) usam função
 * helper nthDayOfWeek.
 */

export type Holiday = {
  /** Chave estável (não muda por ano) — usada pra esconder/customizar */
  key: string;
  /** Nome curto pra exibir no calendário */
  name: string;
  /** Ícone temático */
  icon: string;
  /** Data ISO "YYYY-MM-DD" no ano consultado */
  date: string;
  /** Categoria visual */
  kind: "afetivo" | "religioso" | "nacional";
};

/**
 * Calcula a data da Páscoa pelo algoritmo de Meeus/Jones/Butcher.
 * Retorna Date (00:00 local). 100% preciso pra qualquer ano gregoriano.
 */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Retorna a data do N-ésimo dia da semana em determinado mês.
 * Ex: nthDayOfWeek(2026, 5, 0, 2) = 2º domingo de maio (Dia das Mães)
 */
function nthDayOfWeek(year: number, month1: number, weekday: number, n: number): Date {
  const first = new Date(year, month1 - 1, 1);
  const firstDayOfWeek = first.getDay();
  let offset = weekday - firstDayOfWeek;
  if (offset < 0) offset += 7;
  const day = 1 + offset + 7 * (n - 1);
  return new Date(year, month1 - 1, day);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Retorna todos os feriados/datas comemorativas relevantes pra um ano.
 * Sem flag de "ativo" — toda a lista vem completa; UI decide o que
 * mostrar.
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const pascoa = easter(year);

  return [
    // ────────── Fixos do calendário ──────────
    { key: "ano_novo", name: "Ano Novo", icon: "🎉", date: `${year}-01-01`, kind: "nacional" },
    { key: "tiradentes", name: "Tiradentes", icon: "🇧🇷", date: `${year}-04-21`, kind: "nacional" },
    { key: "trabalho", name: "Dia do Trabalho", icon: "🛠️", date: `${year}-05-01`, kind: "nacional" },
    { key: "namorados", name: "Dia dos Namorados", icon: "💝", date: `${year}-06-12`, kind: "afetivo" },
    { key: "independencia", name: "Independência", icon: "🇧🇷", date: `${year}-09-07`, kind: "nacional" },
    { key: "crianca", name: "Dia da Criança", icon: "🧸", date: `${year}-10-12`, kind: "afetivo" },
    { key: "aparecida", name: "N. Sra. Aparecida", icon: "🙏", date: `${year}-10-12`, kind: "religioso" },
    { key: "finados", name: "Finados", icon: "🕯️", date: `${year}-11-02`, kind: "nacional" },
    { key: "republica", name: "Proclamação da República", icon: "🏛️", date: `${year}-11-15`, kind: "nacional" },
    { key: "consciencia_negra", name: "Consciência Negra", icon: "✊", date: `${year}-11-20`, kind: "nacional" },
    { key: "natal", name: "Natal", icon: "🎄", date: `${year}-12-25`, kind: "religioso" },

    // ────────── Móveis derivados da Páscoa ──────────
    { key: "carnaval", name: "Carnaval", icon: "🎭", date: fmt(addDays(pascoa, -47)), kind: "nacional" },
    { key: "sexta_santa", name: "Sexta-feira Santa", icon: "✝️", date: fmt(addDays(pascoa, -2)), kind: "religioso" },
    { key: "pascoa", name: "Páscoa", icon: "🐰", date: fmt(pascoa), kind: "religioso" },
    { key: "corpus_christi", name: "Corpus Christi", icon: "🍞", date: fmt(addDays(pascoa, 60)), kind: "religioso" },

    // ────────── Móveis por "Nº domingo do mês" ──────────
    { key: "maes", name: "Dia das Mães", icon: "🌸", date: fmt(nthDayOfWeek(year, 5, 0, 2)), kind: "afetivo" },
    { key: "pais", name: "Dia dos Pais", icon: "👔", date: fmt(nthDayOfWeek(year, 8, 0, 2)), kind: "afetivo" },
  ];
}

/**
 * Retorna feriados em um intervalo de datas (inclusive nas pontas).
 * Cobre automaticamente passagem de ano (ex: dez/2025 → jan/2026).
 */
export function getHolidaysInRange(startISO: string, endISO: string): Holiday[] {
  const startYear = parseInt(startISO.slice(0, 4), 10);
  const endYear = parseInt(endISO.slice(0, 4), 10);
  const all: Holiday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    all.push(...getHolidaysForYear(y));
  }
  return all.filter((h) => h.date >= startISO && h.date <= endISO);
}

/**
 * Pega o feriado de um dia específico (ou null se nada).
 * Se houver múltiplos no mesmo dia (ex: 12/10 = Criança + Aparecida),
 * retorna todos.
 */
export function getHolidaysOn(dateISO: string): Holiday[] {
  const year = parseInt(dateISO.slice(0, 4), 10);
  return getHolidaysForYear(year).filter((h) => h.date === dateISO);
}
