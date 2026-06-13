"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

const ITEMS: Item[] = [
  { href: "/financeiro", label: "Resumo" },
  { href: "/financeiro/documentos", label: "Documentos" },
  { href: "/financeiro/transacoes", label: "Transações" },
  { href: "/financeiro/dashboard", label: "Dashboard" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/orcamento", label: "Orçamento" },
  { href: "/financeiro/recorrentes", label: "Recorrentes" },
  { href: "/financeiro/categorias", label: "Categorias" },
  { href: "/financeiro/contas", label: "Contas" },
];

function isActive(pathname: string, href: string) {
  if (href === "/financeiro") return pathname === "/financeiro";
  // Faturas e upload "pertencem" a Documentos na navegação
  if (href === "/financeiro/documentos") {
    return (
      pathname.startsWith("/financeiro/documentos") ||
      pathname.startsWith("/financeiro/faturas") ||
      pathname.startsWith("/financeiro/extratos") ||
      pathname.startsWith("/financeiro/upload")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sub-navegação persistente do módulo Financeiro — chips horizontais com
 * scroll. Sem ela, ir de Transações pro Dashboard exigia voltar ao hub.
 * Renderizada pelo layout de /financeiro, aparece em TODAS as subtelas.
 */
export function FinanceiroNav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 20px 2px",
        overflowX: "auto",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flexShrink: 0,
              padding: "6px 13px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: active ? 800 : 600,
              letterSpacing: "0.01em",
              textDecoration: "none",
              background: active ? "var(--accent)" : "var(--card)",
              color: active ? "var(--accent-on)" : "var(--muted-d)",
              border: active ? "none" : "0.5px solid var(--line-d)",
              transition: "background-color 0.12s",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
