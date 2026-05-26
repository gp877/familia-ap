import Link from "next/link";

import { HOUSEHOLD_PEOPLE, personColor, personInitial } from "@/lib/people";

/**
 * Seletor proeminente de pessoa — 3 avatares grandes lado a lado.
 * Sempre a primeira ação nas telas de Saúde.
 */
export function PersonPicker({
  basePath,
  activeWho,
  extraParams = {},
  paramName = "who",
}: {
  basePath: string;
  activeWho: string | null | undefined;
  extraParams?: Record<string, string | undefined>;
  paramName?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 16px 4px",
        display: "grid",
        gridTemplateColumns: `repeat(${HOUSEHOLD_PEOPLE.length}, 1fr)`,
        gap: 10,
      }}
    >
      {HOUSEHOLD_PEOPLE.map((p) => {
        const isActive = activeWho === p;
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(extraParams)) {
          if (v) sp.set(k, v);
        }
        sp.set(paramName, p);
        const color = personColor(p);
        return (
          <Link
            key={p}
            href={`${basePath}?${sp.toString()}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "10px 6px 12px",
              borderRadius: 16,
              background: isActive ? "var(--card)" : "transparent",
              border: isActive
                ? `1.5px solid ${color}`
                : "0.5px solid var(--line-d)",
              textDecoration: "none",
              transition: "border-color 120ms, background 120ms",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: color,
                color: "var(--accent-on)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                opacity: isActive ? 1 : 0.7,
              }}
            >
              {personInitial(p)}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: isActive ? 800 : 600,
                color: isActive ? "var(--ink)" : "var(--muted-d)",
                letterSpacing: "-0.01em",
              }}
            >
              {p}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
