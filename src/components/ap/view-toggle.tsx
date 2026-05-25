import Link from "next/link";

type Option = {
  /** Valor do query param. Use `null` pro modo default (sem param). */
  key: string | null;
  label: string;
};

/**
 * Pill toggle entre 2+ visualizações. Default: Resumo / Lista.
 * Para mais opções, passe `options` customizado.
 */
export function ViewToggle({
  basePath,
  current,
  extraParams = {},
  options,
  resumoLabel = "Resumo",
  listaLabel = "Lista",
}: {
  basePath: string;
  current: string | undefined;
  extraParams?: Record<string, string | undefined>;
  options?: Option[];
  resumoLabel?: string;
  listaLabel?: string;
}) {
  const opts: Option[] = options ?? [
    { key: null, label: resumoLabel },
    { key: "list", label: listaLabel },
  ];

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
      {opts.map((o) => {
        const isActive = (current ?? null) === o.key || (o.key === null && !current);
        return (
          <Link
            key={String(o.key)}
            href={urlFor(o.key)}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: isActive ? "var(--card)" : "transparent",
              color: isActive ? "var(--ink)" : "var(--muted-d)",
              textDecoration: "none",
            }}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
