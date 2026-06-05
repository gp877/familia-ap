"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * Sino com contador de não-lidas + popover.
 * Click no item navega via Link e marca como lido.
 * Botão "marcar todas como lidas" no topo do popover.
 */
export function NotificationBell({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.readAt).length;

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        title={unread > 0 ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Sem notificações"}
        style={{
          position: "relative",
          width: 32,
          height: 32,
          borderRadius: 16,
          background: open ? "var(--card2)" : "transparent",
          color: unread > 0 ? "var(--accent)" : "var(--muted-d)",
          border: "0.5px solid var(--line-d)",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontSize: 9.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationPopover
          notifications={notifications}
          unread={unread}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Popover
// ────────────────────────────────────────────────────────────

function NotificationPopover({
  notifications,
  unread,
  onClose,
}: {
  notifications: AppNotification[];
  unread: number;
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }
  function del(id: string) {
    startTransition(async () => {
      await deleteNotification(id);
    });
  }
  function readAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        zIndex: 60,
        minWidth: 340,
        maxWidth: 380,
        background: "var(--card)",
        borderRadius: 14,
        boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 16px 48px rgba(0,0,0,0.45)",
        overflow: "hidden",
        border: "0.5px solid var(--line-d)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "0.5px solid var(--line-d)",
          background: "var(--surf)",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-d)",
          }}
        >
          notificações {unread > 0 && `(${unread})`}
        </span>
        {unread > 0 && (
          <button
            type="button"
            onClick={readAll}
            style={{
              background: "transparent",
              color: "var(--accent)",
              border: "none",
              fontSize: 10.5,
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
            }}
          >
            marcar tudo como lido
          </button>
        )}
      </div>

      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            Sem notificações.
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              onMarkRead={() => markRead(n.id)}
              onDelete={() => del(n.id)}
              onNavigate={onClose}
            />
          ))
        )}
      </div>

      <div
        style={{
          padding: "8px 14px",
          borderTop: "0.5px solid var(--line-d)",
          background: "var(--surf)",
          textAlign: "right",
        }}
      >
        <Link
          href="/configuracoes/notificacoes"
          onClick={onClose}
          style={{
            fontSize: 10.5,
            color: "var(--muted)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          configurar →
        </Link>
      </div>
    </div>
  );
}

function NotificationItem({
  n,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  n: AppNotification;
  onMarkRead: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  const isUnread = !n.readAt;
  const content = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {isUnread && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "var(--accent)",
              marginTop: 6,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: isUnread ? 700 : 500,
              color: isUnread ? "var(--ink)" : "var(--muted-d)",
              lineHeight: 1.3,
            }}
          >
            {n.title}
          </div>
          {n.body && (
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {n.body}
            </div>
          )}
          <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4 }}>
            {relativeTime(n.createdAt)}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "0.5px solid var(--line-d)",
        background: isUnread ? "color-mix(in oklab, var(--accent) 4%, transparent)" : "transparent",
      }}
    >
      {n.href ? (
        <Link
          href={n.href}
          onClick={() => {
            if (isUnread) onMarkRead();
            onNavigate();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px 10px 14px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {content}
        </Link>
      ) : (
        <div
          onClick={() => isUnread && onMarkRead()}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px 10px 14px",
            cursor: isUnread ? "pointer" : "default",
          }}
        >
          {content}
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        title="Remover"
        aria-label="Remover"
        style={{
          background: "transparent",
          color: "var(--muted)",
          border: "none",
          fontSize: 14,
          cursor: "pointer",
          padding: "0 12px",
          opacity: 0.5,
        }}
      >
        ×
      </button>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - then) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
