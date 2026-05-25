import Link from "next/link";

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Chips de meses no formato `‹  jan fev mar abr … dez  ›` com setas pra trocar ano.
 * - basePath: rota base (ex: "/finais-de-semana")
 * - paramName: query param a ser setado (ex: "month")
 * - currentMonth: "YYYY-MM" atualmente ativo
 * - extraParams: query params adicionais a preservar
 */
export function MonthChips({
  basePath,
  paramName = "month",
  currentMonth,
  extraParams = {},
}: {
  basePath: string;
  paramName?: string;
  currentMonth: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const [yStr, mStr] = currentMonth.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);

  function urlFor(y: number, m: number) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    sp.set(paramName, `${y}-${String(m).padStart(2, "0")}`);
    return `${basePath}?${sp.toString()}`;
  }

  return (
    <div
      style={{
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        overflowX: "auto",
        scrollbarWidth: "thin",
      }}
    >
      <Link
        href={urlFor(year - 1, month)}
        aria-label="Ano anterior"
        style={{
          padding: "4px 8px",
          borderRadius: 8,
          background: "var(--card)",
          color: "var(--muted-d)",
          fontSize: 11,
          textDecoration: "none",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ‹ {year - 1}
      </Link>
      <div style={{ display: "flex", gap: 4, padding: "0 4px" }}>
        {MONTHS_PT.map((label, idx) => {
          const m = idx + 1;
          const isActive = m === month;
          return (
            <Link
              key={label}
              href={urlFor(year, m)}
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                background: isActive ? "var(--accent)" : "var(--card)",
                color: isActive ? "var(--accent-on)" : "var(--muted-d)",
                textDecoration: "none",
                flexShrink: 0,
                border: isActive ? "none" : "1px solid var(--line-d)",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <Link
        href={urlFor(year + 1, month)}
        aria-label="Próximo ano"
        style={{
          padding: "4px 8px",
          borderRadius: 8,
          background: "var(--card)",
          color: "var(--muted-d)",
          fontSize: 11,
          textDecoration: "none",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {year + 1} ›
      </Link>
    </div>
  );
}
