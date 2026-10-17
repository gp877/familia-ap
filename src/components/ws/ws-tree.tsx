"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { wsArchive, wsCreatePage } from "@/app/actions/workspace";

import { MenuItem, Popover } from "./ws-ui";

export type TreeItem = {
  id: string;
  parentId: string | null;
  kind: string;
  title: string;
  icon: string | null;
  visibility: string;
};

export function WsTree({ items }: { items: TreeItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname.split("/")[2] ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [, start] = useTransition();

  const children = useMemo(() => {
    const m = new Map<string | null, TreeItem[]>();
    const ids = new Set(items.map((i) => i.id));
    for (const it of items) {
      const key = it.parentId && ids.has(it.parentId) ? it.parentId : null;
      m.set(key, [...(m.get(key) ?? []), it]);
    }
    return m;
  }, [items]);

  const create = (kind: "page" | "database", parentId: string | null = null) =>
    start(async () => {
      const r = await wsCreatePage({ parentId, kind, title: "" });
      setNewMenu(false);
      setMobileOpen(false);
      router.push(`/tarefas/${r.id}`);
    });

  const list = (
    <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {(children.get(null) ?? []).map((it) => (
        <Node key={it.id} item={it} depth={0} childrenOf={children} activeId={activeId} onCreateChild={(id) => create("page", id)} onNavigate={() => setMobileOpen(false)} />
      ))}
      <div style={{ position: "relative", marginTop: 6 }}>
        <button type="button" onClick={() => setNewMenu(true)} style={sideBtn}>
          + Nova
        </button>
        <Popover open={newMenu} onClose={() => setNewMenu(false)} width={200}>
          <MenuItem onClick={() => create("page")}>📄 Página</MenuItem>
          <MenuItem onClick={() => create("database")}>🗂️ Banco de dados</MenuItem>
        </Popover>
      </div>
      <Link href="/tarefas/registro" onClick={() => setMobileOpen(false)} style={{ ...sideBtn, textDecoration: "none", color: activeId === "registro" ? "var(--ink)" : "var(--muted-d)", marginTop: 6 }}>
        📈 Registro
      </Link>
      <Link href="/tarefas/lixeira" onClick={() => setMobileOpen(false)} style={{ ...sideBtn, textDecoration: "none", color: activeId === "lixeira" ? "var(--ink)" : "var(--muted-d)" }}>
        🗑️ Lixeira
      </Link>
    </nav>
  );

  return (
    <>
      <div className="lg:hidden" style={{ padding: "8px 16px 0" }}>
        <button type="button" onClick={() => setMobileOpen((v) => !v)} style={{ ...sideBtn, border: "0.5px solid var(--line-d)", width: "auto", padding: "6px 10px" }}>
          ☰ Páginas {mobileOpen ? "▴" : "▾"}
        </button>
        {mobileOpen && <div style={{ marginTop: 8, padding: 8, background: "var(--surf)", borderRadius: 10 }}>{list}</div>}
      </div>
      <aside className="hidden lg:block" style={{ width: 240, flexShrink: 0, padding: "18px 10px", borderRight: "0.5px solid var(--line)", position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "100vh", overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", padding: "0 8px 8px" }}>Meu espaço</div>
        {list}
      </aside>
    </>
  );
}

const sideBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "5px 8px",
  borderRadius: 6,
  border: 0,
  background: "transparent",
  color: "var(--muted-d)",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

function Node({
  item,
  depth,
  childrenOf,
  activeId,
  onCreateChild,
  onNavigate,
}: {
  item: TreeItem;
  depth: number;
  childrenOf: Map<string | null, TreeItem[]>;
  activeId: string;
  onCreateChild: (id: string) => void;
  onNavigate: () => void;
}) {
  const kids = childrenOf.get(item.id) ?? [];
  const [open, setOpen] = useState(depth === 0 && kids.some((k) => k.id === activeId));
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const active = item.id === activeId;
  return (
    <div>
      <div
        className="ws-tree-item"
        style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 4 + depth * 14, borderRadius: 6, background: active ? "var(--card2)" : "transparent", position: "relative" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ width: 18, height: 22, border: 0, background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: 0, transform: open ? "rotate(90deg)" : "none", visibility: kids.length || item.kind === "page" ? "visible" : "hidden" }}
        >
          ▸
        </button>
        <Link
          href={`/tarefas/${item.id}`}
          onClick={onNavigate}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "4px 2px", color: active ? "var(--ink)" : "var(--ink-d)", textDecoration: "none", fontSize: 13.5 }}
        >
          <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon ?? (item.kind === "database" ? "🗂️" : "📄")}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || "Sem título"}</span>
          {item.visibility === "household" && <span title="Compartilhada com a família" style={{ fontSize: 10, flexShrink: 0 }}>👥</span>}
        </Link>
        <span className="ws-tree-actions" style={{ display: "flex", gap: 0 }}>
          <button type="button" title="Mais" onClick={() => setMenu(true)} style={iconBtn}>
            ⋯
          </button>
          {item.kind === "page" && (
            <button
              type="button"
              title="Nova subpágina"
              onClick={() => {
                setOpen(true);
                onCreateChild(item.id);
              }}
              style={iconBtn}
            >
              +
            </button>
          )}
        </span>
        <Popover open={menu} onClose={() => setMenu(false)} width={180} align="right">
          <MenuItem
            danger
            onClick={() => {
              setMenu(false);
              start(async () => {
                await wsArchive(item.id);
                if (active) router.push("/tarefas");
              });
            }}
          >
            Mover para a Lixeira
          </MenuItem>
        </Popover>
      </div>
      {open &&
        (kids.length ? (
          kids.map((k) => <Node key={k.id} item={k} depth={depth + 1} childrenOf={childrenOf} activeId={activeId} onCreateChild={onCreateChild} onNavigate={onNavigate} />)
        ) : (
          <div style={{ paddingLeft: 26 + depth * 14, fontSize: 12, color: "var(--muted)", padding: "2px 0 2px " + (26 + depth * 14) + "px" }}>Sem páginas dentro</div>
        ))}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  border: 0,
  background: "transparent",
  color: "var(--muted-d)",
  cursor: "pointer",
  borderRadius: 4,
  fontSize: 14,
  padding: 0,
};
