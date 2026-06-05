"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

type Attachment = {
  id: string;
  filename: string;
  blobUrl: string;
  fileSize: number | null;
  mimeType: string | null;
};

/**
 * Botão minúsculo de clipe (📎) com contador opcional. Discreto até o user
 * passar mouse ou clicar. Click → abre dialog modal com lista de anexos +
 * dropzone pra upload.
 *
 * Genérico via `apiPath` — funciona pra qualquer entidade que tenha
 * endpoint `/<apiPath>/attachments` (POST upload, DELETE por attachmentId).
 */
export function AttachmentsButton({
  apiPath,
  attachments,
}: {
  apiPath: string; // ex: "/api/compromissos/abc-123"
  attachments: Attachment[];
}) {
  const [open, setOpen] = useState(false);
  const count = attachments.length;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title={count > 0 ? `${count} anexo${count === 1 ? "" : "s"}` : "Anexar arquivo"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          borderRadius: 999,
          background: "transparent",
          color: count > 0 ? "var(--accent)" : "var(--muted)",
          border: count > 0 ? "0.5px solid var(--accent)" : "0.5px solid var(--line-d)",
          fontSize: 10.5,
          fontWeight: 600,
          cursor: "pointer",
          lineHeight: 1,
        }}
        aria-label="Anexos"
      >
        <span style={{ fontSize: 11 }} aria-hidden>
          📎
        </span>
        {count > 0 && <span>{count}</span>}
      </button>

      {open && (
        <AttachmentsDialog
          apiPath={apiPath}
          initial={attachments}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Dialog
// ────────────────────────────────────────────────────────────

function AttachmentsDialog({
  apiPath,
  initial,
  onClose,
}: {
  apiPath: string;
  initial: Attachment[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Attachment[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fecha com ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error("Arquivo maior que 4MB não é suportado ainda");
      }
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`${apiPath}/attachments`, {
        method: "POST",
        body: fd,
      });

      // Parse seguro: trata caso de body vazio / não-JSON sem quebrar
      let data: { error?: string; id?: string; filename?: string; blobUrl?: string; fileSize?: number | null; mimeType?: string | null } = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        // body não é JSON
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText || "Falha no upload"}`);
      }
      if (!data.id) {
        throw new Error("Resposta do servidor incompleta (sem id)");
      }
      setItems((arr) => [
        ...arr,
        {
          id: data.id!,
          filename: data.filename ?? file.name,
          blobUrl: data.blobUrl ?? "",
          fileSize: data.fileSize ?? file.size,
          mimeType: data.mimeType ?? file.type ?? null,
        },
      ]);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este anexo?")) return;
    try {
      const res = await fetch(
        `${apiPath}/attachments?attachmentId=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        // Parse seguro: se body não é JSON ou está vazio, mostra status
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Falha ao remover (HTTP ${res.status})`
        );
      }
      setItems((arr) => arr.filter((a) => a.id !== id));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          borderRadius: 18,
          padding: 18,
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            anexos
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "transparent",
              color: "var(--muted-d)",
              border: "0.5px solid var(--line-d)",
              fontSize: 14,
              cursor: "pointer",
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Lista */}
        {items.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 12.5,
              fontStyle: "italic",
            }}
          >
            Nenhum arquivo anexado ainda.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {items.map((a) => (
              <AttachmentRow key={a.id} att={a} onDelete={() => handleDelete(a.id)} />
            ))}
          </div>
        )}

        {/* Upload */}
        <label
          htmlFor={`attach-input-${apiPath}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: "18px 14px",
            borderRadius: 14,
            background: "var(--card2)",
            border: "1px dashed var(--line-d)",
            cursor: uploading ? "wait" : "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: 22 }}>📎</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-d)" }}>
            {uploading ? "Enviando…" : "Clique pra anexar arquivo"}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--muted)" }}>até 10MB</span>
          <input
            id={`attach-input-${apiPath}`}
            ref={fileInputRef}
            type="file"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            style={{ display: "none" }}
          />
        </label>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--alert) 12%, var(--card2))",
              color: "var(--alert)",
              fontSize: 11.5,
            }}
          >
            {error}
          </div>
        )}

        {isPending && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--muted)", textAlign: "center" }}>
            atualizando…
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentRow({ att, onDelete }: { att: Attachment; onDelete: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "var(--card2)",
        borderRadius: 12,
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{iconFor(att.mimeType)}</span>
      <a
        href={att.blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flex: 1,
          minWidth: 0,
          textDecoration: "none",
          color: "var(--ink)",
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {att.filename}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
          {formatBytes(att.fileSize)} · clique pra abrir
        </div>
      </a>
      <button
        type="button"
        onClick={onDelete}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: "transparent",
          color: "var(--alert)",
          border: "0.5px solid var(--line-d)",
          fontSize: 14,
          cursor: "pointer",
          flexShrink: 0,
        }}
        aria-label="Remover"
        title="Remover anexo"
      >
        ×
      </button>
    </div>
  );
}

function iconFor(mime: string | null): string {
  if (!mime) return "📎";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("word") || mime.includes("document")) return "📘";
  if (mime.includes("sheet") || mime.includes("excel")) return "📗";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  return "📄";
}

function formatBytes(b: number | null): string {
  if (b === null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
