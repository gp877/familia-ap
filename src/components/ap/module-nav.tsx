"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ModuleNavItem = {
  href: string;
  label: string;
  /** Prefixos extras que também acendem este chip (ex: /financeiro/faturas
   * pertence a "Documentos"). */
  match?: string[];
};

/**
 * Sub-navegação padrão de módulo — chips horizontais com scroll, mesmo
 * visual em todos os módulos (padrão criado no Financeiro). O primeiro
 * item é o hub: só acende com path exato; os demais acendem por prefixo.
 */
export function ModuleNav({ items }: { items: ModuleNavItem[] }) {
  const pathname = usePathname();

  function isActive(item: ModuleNavItem, isHub: boolean) {
    if (item.match?.some((m) => pathname === m || pathname.startsWith(`${m}/`))) {
      return true;
    }
    if (isHub) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

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
      {items.map((item, idx) => {
        const active = isActive(item, idx === 0);
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

/** Wrapper com a mesma largura máxima do ScreenShell, pra usar em layouts. */
export function ModuleNavBar({ items }: { items: ModuleNavItem[] }) {
  return (
    <div className="mx-auto w-full max-w-[480px] lg:max-w-4xl">
      <ModuleNav items={items} />
    </div>
  );
}
