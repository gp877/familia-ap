"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { patchSonho } from "@/app/actions/sonhos";

type Sonho = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
};

/**
 * Botão de lápis que abre um modal centralizado com formulário pra
 * editar título, descrição e URL de imagem do sonho. Salva via
 * patchSonho (auto-save no submit, sem auto-save no blur — usuário tem
 * controle).
 */
export function SonhoEditDialog({ sonho }: { sonho: Sonho }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fecha com Escape + foco preso dentro
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", sonho.id);
    startTransition(async () => {
      await patchSonho(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar sonho"
        title="Editar"
        style={EDIT_BTN_STYLE}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "color-mix(in oklab, var(--accent) 16%, transparent)";
          e.currentTarget.style.color = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--muted-d)";
        }}
      >
        <PencilIcon />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: "var(--card)",
              borderRadius: 20,
              padding: 0,
              maxWidth: 480,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25), 0 24px 64px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                padding: "18px 22px 14px",
                borderBottom: "0.5px solid var(--line-d)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                Editar sonho
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: "transparent",
                  color: "var(--muted)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSave}
              style={{
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <Field label="Título">
                <input
                  name="title"
                  required
                  defaultValue={sonho.title}
                  autoFocus
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Descrição">
                <textarea
                  name="description"
                  defaultValue={sonho.description ?? ""}
                  placeholder="o que esse sonho significa, com quem, quando…"
                  rows={4}
                  style={{ ...INPUT_STYLE, resize: "vertical", minHeight: 80 }}
                />
              </Field>

              <Field label="URL da imagem" hint="cola um link de inspiração (Unsplash, Pinterest, etc)">
                <input
                  type="url"
                  name="imageUrl"
                  defaultValue={sonho.imageUrl ?? ""}
                  placeholder="https://..."
                  style={INPUT_STYLE}
                />
                {sonho.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sonho.imageUrl}
                    alt="preview"
                    style={{
                      marginTop: 8,
                      width: "100%",
                      maxHeight: 160,
                      objectFit: "cover",
                      borderRadius: 10,
                    }}
                  />
                )}
              </Field>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  paddingTop: 14,
                  borderTop: "0.5px solid var(--line-d)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 12,
                    background: "transparent",
                    color: "var(--muted-d)",
                    border: "0.5px solid var(--line-d)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    flex: 1,
                    padding: "10px 18px",
                    borderRadius: 12,
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isPending ? "wait" : "pointer",
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
        {hint && (
          <span
            style={{
              marginLeft: 6,
              fontWeight: 500,
              letterSpacing: "normal",
              textTransform: "none",
              color: "var(--muted)",
            }}
          >
            · {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function PencilIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

const EDIT_BTN_STYLE: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 14,
  background: "transparent",
  color: "var(--muted-d)",
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: 0,
  transition: "background-color 0.12s, color 0.12s",
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "none",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};
