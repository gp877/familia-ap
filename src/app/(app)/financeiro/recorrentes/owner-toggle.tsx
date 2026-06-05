"use client";

import Link from "next/link";

/**
 * Chip duplo "Meus / Todos" pra trocar entre ver só os recorrentes do usuário
 * logado vs todos do household. Persiste o mês focado.
 */
export function OwnerToggle({
  view,
  countMine,
  countAll,
  focusMonth,
}: {
  view: "mine" | "all";
  countMine: number;
  countAll: number;
  focusMonth: string;
}) {
  const monthQs = focusMonth ? `&month=${focusMonth}` : "";
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 0,
        borderRadius: 999,
        background: "var(--card2)",
        border: "0.5px solid var(--line-d)",
        padding: 2,
        marginBottom: 8,
      }}
    >
      <Link
        href={`/financeiro/recorrentes?view=mine${monthQs}`}
        style={chipStyle(view === "mine")}
      >
        Meus <Count>{countMine}</Count>
      </Link>
      <Link
        href={`/financeiro/recorrentes?view=all${monthQs}`}
        style={chipStyle(view === "all")}
      >
        Todos <Count>{countAll}</Count>
      </Link>
    </div>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        opacity: 0.7,
        marginLeft: 4,
      }}
    >
      {children}
    </span>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--accent-on)" : "var(--muted-d)",
    fontSize: 11.5,
    fontWeight: 700,
    textDecoration: "none",
    transition: "background 120ms",
    cursor: "pointer",
  };
}
