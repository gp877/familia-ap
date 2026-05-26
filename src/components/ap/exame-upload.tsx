"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ExameUpload({
  knownPeople = ["Gabriel", "Marília", "Francisco"],
}: {
  knownPeople?: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [who, setWho] = useState("");
  const [examDate, setExamDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Selecione um PDF");
      return;
    }
    setStatus("Enviando…");
    const fd = new FormData();
    fd.set("file", file);
    if (who.trim()) fd.set("who", who.trim());
    if (examDate) fd.set("examDate", examDate);

    try {
      const res = await fetch("/api/upload-exame", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Erro: ${data.error || res.statusText}`);
        return;
      }
      setStatus(
        `OK · ${data.markerCount} marcadores extraídos (${data.who} · ${data.examDate})`
      );
      if (fileRef.current) fileRef.current.value = "";
      setWho("");
      setExamDate("");
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ padding: "0 20px" }}>
      <details
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{ width: "100%" }}
      >
        <summary
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "var(--accent-on)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            listStyle: "none",
          }}
        >
          Subir PDF de exame
        </summary>
        <div
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 16,
            background: "var(--card)",
          }}
        >
          <form onSubmit={handleUpload}>
            <label
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--muted)",
                marginBottom: 5,
              }}
            >
              PDF do exame *
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                background: "var(--card2)",
                color: "var(--ink)",
                border: "1px dashed var(--line-d)",
                fontSize: 12,
                fontFamily: "inherit",
                marginBottom: 12,
              }}
            />

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--muted)",
                    marginBottom: 5,
                  }}
                >
                  Quem (opcional, sobrescreve)
                </label>
                <input
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  list="upload-exame-who"
                  placeholder="se vazio, lê do PDF"
                  style={fieldStyle}
                />
                <datalist id="upload-exame-who">
                  {knownPeople.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--muted)",
                    marginBottom: 5,
                  }}
                >
                  Data (opcional)
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending || status === "Enviando…"}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "12px 18px",
                borderRadius: 14,
                background:
                  status === "Enviando…" ? "var(--card2)" : "var(--accent)",
                color:
                  status === "Enviando…" ? "var(--muted)" : "var(--accent-on)",
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: status === "Enviando…" ? "wait" : "pointer",
              }}
            >
              {status === "Enviando…" ? "Extraindo do PDF…" : "Enviar"}
            </button>

            {status && status !== "Enviando…" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: status.startsWith("Erro") ? "var(--alert)" : "var(--card2)",
                  color: status.startsWith("Erro") ? "var(--accent-on)" : "var(--ink-d)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {status}
              </div>
            )}
            <p
              style={{
                fontSize: 10.5,
                color: "var(--muted)",
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              A IA lê o PDF e extrai cada marcador (glicose, LDL, hemoglobina…),
              valor, unidade e referência. Demora ~20s.
            </p>
          </form>
        </div>
      </details>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "1px solid transparent",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};
