import Link from "next/link";

/**
 * Pill toggle entre modo Resumo (visão padrão) e Lista (cronológica).
 * - basePath: rota do módulo (ex: "/finais-de-semana")
 * - current: valor atual de `view` query param ("list" | undefined)
 * - extraParams: outros params a preservar (ex: month)
 */
export function ViewToggle({
  basePath,
  current,
  extraParams = {},
  resumoLabel = "Resumo",
  listaLabel = "Lista",
}: {
  basePath: string;
  current: string | undefined;
  extraParams?: Record<string, string | undefined>;
  resumoLabel?: string;
  listaLabel?: string;
}) {
  const isList = current === "list";

  function urlFor(view: string | null) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    if (view) sp.set("view", view);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 0,
        padding: 2,
        borderRadius: 999,
        background: "var(--card2)",
      }}
    >
      <Link
        href={urlFor(null)}
        style={{
          padding: "4px 14px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: !isList ? "var(--card)" : "transparent",
          color: !isList ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        {resumoLabel}
      </Link>
      <Link
        href={urlFor("list")}
        style={{
          padding: "4px 14px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: isList ? "var(--card)" : "transparent",
          color: isList ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        {listaLabel}
      </Link>
    </div>
  );
}
