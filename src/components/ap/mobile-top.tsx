"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function MobileTop({ activeKey = null }: { activeKey?: "G" | "M" | null }) {
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
        <MemberChips size={30} activeKey={activeKey} />
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
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
          </div>
        </div>
      )}
    </>
  );
}
