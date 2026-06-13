"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { MemberChips } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { Logo } from "@/components/ap/logo";
import { NAV_ITEMS } from "@/components/ap/nav-items";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/saude-exames") {
    return pathname.startsWith("/saude-exames") || pathname.startsWith("/saude-peso");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function moduleNameFor(pathname: string) {
  const exact = NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.module;
  const sub = NAV_ITEMS.find(
    (i) => pathname.startsWith(`${i.href}/`) || (i.href === "/saude-exames" && pathname.startsWith("/saude-peso"))
  );
  return sub?.module ?? "Família AP";
}

export function MobileTop({
  activeKey = null,
  bell = null,
}: {
  activeKey?: "G" | "M" | null;
  bell?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moduleName = moduleNameFor(pathname);

  return (
    <>
      <header
        className="lg:hidden"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: "var(--card)",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon name="menu" size={20} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {moduleName}
            </span>
            <Icon name="chev" size={14} color="var(--muted)" stroke={2.2} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {bell}
          <MemberChips size={30} activeKey={activeKey} />
        </div>
      </header>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              background: "var(--surf)",
              padding: "28px 20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
              borderRight: "0.5px solid var(--line-d)",
            }}
          >
            <div style={{ paddingLeft: 4 }}>
              <Logo variant="casa" size={56} />
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: active ? "var(--card)" : "transparent",
                      color: active ? "var(--ink)" : "var(--muted-d)",
                      fontSize: 14,
                      fontWeight: active ? 600 : 500,
                      textDecoration: "none",
                    }}
                  >
                    <Icon name={item.icon} size={18} stroke={active ? 2 : 1.6} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Rodapé: Configurações + Sair — antes esses destinos só
                existiam na sidebar web; no celular eram inalcançáveis. */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                paddingTop: 12,
                borderTop: "0.5px solid var(--line-d)",
              }}
            >
              <Link
                href="/configuracoes"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  color: isActive(pathname, "/configuracoes") ? "var(--ink)" : "var(--muted-d)",
                  background: isActive(pathname, "/configuracoes") ? "var(--card)" : "transparent",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Configurações
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "transparent",
                    color: "var(--muted-d)",
                    border: "none",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    width: "100%",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
