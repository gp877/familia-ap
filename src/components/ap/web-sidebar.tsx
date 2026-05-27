"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { MemberChips } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { Logo } from "@/components/ap/logo";
import { NAV_ITEMS } from "@/components/ap/nav-items";

type Props = {
  userName?: string | null;
  partnerName?: string | null;
  activeKey?: "G" | "M" | null;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/saude-exames") {
    return pathname.startsWith("/saude-exames") || pathname.startsWith("/saude-peso");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WebSidebar({ userName, partnerName, activeKey = null }: Props) {
  const pathname = usePathname();
  const display =
    userName && partnerName
      ? `${userName} + ${partnerName}`
      : userName ?? "Família AP";

  return (
    <aside
      className="hidden lg:flex"
      style={{
        background: "var(--surf)",
        width: 240,
        padding: "28px 20px 24px",
        flexDirection: "column",
        gap: 24,
        borderRight: "0.5px solid var(--line-d)",
        flexShrink: 0,
      }}
    >
      <div style={{ paddingLeft: 4 }}>
        <Logo variant="casa" size={56} />
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 10px",
                borderRadius: 10,
                background: active ? "var(--card)" : "transparent",
                color: active ? "var(--ink)" : "var(--muted-d)",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
              }}
            >
              <Icon name={item.icon} size={17} stroke={active ? 2 : 1.6} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 6px 4px",
          borderTop: "0.5px solid var(--line-d)",
        }}
      >
        <MemberChips size={28} activeKey={activeKey} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {display}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>casa cheia · 2 contas</div>
        </div>
        <Link
          href="/configuracoes"
          title="Configurações"
          aria-label="Configurações"
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            background: "transparent",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            title="Sair"
            aria-label="Sair"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "transparent",
              color: "var(--muted)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}
