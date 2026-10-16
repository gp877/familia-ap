"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { wsArchive, wsRename, wsSetIcon, wsSetVisibility } from "@/app/actions/workspace";

import { AiBadge, GhostButton, MenuItem, Popover } from "./ws-ui";

const EMOJIS = "📄 📝 ✅ 📌 🗂️ 📅 💡 🎯 🚀 💼 🏠 👨‍👩‍👧 💰 🧾 📞 ✉️ 🛒 ✈️ 🍽️ 🏥 🎉 ⭐ 🔥 ⚠️ 🔒 📊 🧠 🛠️ 🎓 ❤️".split(" ");

export function PageHeader({
  id,
  title,
  icon,
  kind,
  visibility,
  isOwner,
  createdByAgent,
  agentUpdatedAt,
  crumbs,
}: {
  id: string;
  title: string;
  icon: string | null;
  kind: string;
  visibility: string;
  isOwner: boolean;
  createdByAgent: boolean;
  agentUpdatedAt: string | null;
  crumbs: Array<{ id: string; title: string; icon: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [iconOpen, setIconOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const [prevTitle, setPrevTitle] = useState(title);
  if (title !== prevTitle) {
    setPrevTitle(title);
    setValue(title);
  }

  const saveTitle = () => {
    if (value.trim() === title) return;
    start(() => wsRename(id, value.trim()));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", minHeight: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--muted-d)", minWidth: 0, overflow: "hidden", flexWrap: "wrap" }}>
          {crumbs.map((c) => (
            <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Link href={`/tarefas/${c.id}`} style={{ color: "var(--muted-d)", textDecoration: "none" }}>
                {c.icon ?? "📄"} {c.title || "Sem título"}
              </Link>
              <span>/</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <AiBadge created={createdByAgent} revisedAt={agentUpdatedAt} />
          {isOwner ? (
            <GhostButton
              onClick={() => start(() => wsSetVisibility(id, visibility === "household" ? "private" : "household"))}
              title={visibility === "household" ? "Clique para deixar só sua" : "Clique para compartilhar com a família"}
            >
              {visibility === "household" ? "👥 Compartilhada" : "🔒 Privada"}
            </GhostButton>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>👥 Compartilhada com você</span>
          )}
          <div style={{ position: "relative" }}>
            <GhostButton onClick={() => setMenu(true)}>⋯</GhostButton>
            <Popover open={menu} onClose={() => setMenu(false)} width={210} align="right">
              <MenuItem
                danger
                onClick={() =>
                  start(async () => {
                    await wsArchive(id);
                    router.push(crumbs.length ? `/tarefas/${crumbs[crumbs.length - 1].id}` : "/tarefas");
                  })
                }
              >
                Mover para a Lixeira
              </MenuItem>
            </Popover>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", width: "fit-content" }}>
        <button
          type="button"
          onClick={() => setIconOpen(true)}
          title="Trocar ícone"
          style={{ fontSize: kind === "row" ? 34 : 44, lineHeight: 1, background: "none", border: 0, cursor: "pointer", padding: 2, borderRadius: 8 }}
        >
          {icon ?? (kind === "database" ? "🗂️" : "📄")}
        </button>
        <Popover open={iconOpen} onClose={() => setIconOpen(false)} width={262}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setIconOpen(false);
                  start(() => wsSetIcon(id, e));
                }}
                className="ws-menu-item"
                style={{ fontSize: 20, background: "none", border: 0, borderRadius: 6, cursor: "pointer", padding: 3 }}
              >
                {e}
              </button>
            ))}
          </div>
          <MenuItem
            onClick={() => {
              setIconOpen(false);
              start(() => wsSetIcon(id, null));
            }}
          >
            Remover ícone
          </MenuItem>
        </Popover>
      </div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        placeholder="Sem título"
        style={{ width: "100%", background: "transparent", border: 0, outline: "none", color: "var(--ink)", fontSize: kind === "row" ? 28 : 34, fontWeight: 700, fontFamily: "inherit", padding: 0, lineHeight: 1.2 }}
      />
    </div>
  );
}
