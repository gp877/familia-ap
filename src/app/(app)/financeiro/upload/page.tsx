"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";

type SourceType = "auto" | "bank_statement" | "credit_card_invoice";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    extractedCount: number;
    bankSlug: string;
    documentType: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (sourceType !== "auto") fd.append("sourceType", sourceType);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no upload");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <ScreenShell
        userQ="Já processou o extrato?"
        insight={<>{result.extractedCount} transações entraram como pendentes. Vai na lista e revisa as categorias — cada ajuste vira regra automática.</>}
      >
        <SectionRow icon="file" label="Pronto" action="extração concluída" />
        <BigNumber value={`${result.extractedCount} transações`} accent />

        <div style={{ padding: "14px 20px 0" }}>
          <Card raised pad={16}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--muted)" }}>Banco</span>
              <span style={{ color: "var(--ink)" }}>{result.bankSlug}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--muted)" }}>Tipo</span>
              <span style={{ color: "var(--ink)" }}>
                {result.documentType === "bank_statement"
                  ? "Extrato bancário"
                  : result.documentType === "credit_card_invoice"
                    ? "Fatura de cartão"
                    : "Desconhecido"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--muted)" }}>Transações</span>
              <span style={{ color: "var(--ink)" }}>{result.extractedCount}</span>
            </div>
          </Card>
        </div>

        <div style={{ padding: "16px 20px 0", display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => router.push("/financeiro/transacoes")}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 16,
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontWeight: 700,
              fontSize: 13.5,
              border: "none",
              cursor: "pointer",
            }}
          >
            Ver transações
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 16,
              background: "var(--card)",
              color: "var(--ink-d)",
              fontSize: 13.5,
              border: "none",
              cursor: "pointer",
            }}
          >
            Subir outro
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      userQ="Quero subir um extrato"
      insight={
        <>
          Manda o PDF — extrato ou fatura. Eu uso o Gemini pra extrair e tento categorizar automaticamente baseado no que já vi.
        </>
      }
    >
      <SectionRow icon="file" label="Novo upload" />
      <BigNumber value="PDF" sub="extrato bancário ou fatura de cartão" />

      <form onSubmit={handleSubmit} style={{ padding: "14px 20px 0" }}>
        <label
          htmlFor="file"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "32px 20px",
            borderRadius: 18,
            background: "var(--card)",
            border: file ? "1px solid var(--accent)" : "1px dashed var(--line-d)",
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              background: "var(--card2)",
              color: file ? "var(--accent)" : "var(--muted-d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={file ? "file" : "plus"} size={22} stroke={1.8} />
          </div>
          {file ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {(file.size / 1024).toFixed(1)} KB · clique pra trocar
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-d)" }}>
                Clique pra escolher um PDF
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                até 10 MB · extrato ou fatura
              </div>
            </>
          )}
          <input
            id="file"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            required
            style={{ display: "none" }}
          />
        </label>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["auto", "bank_statement", "credit_card_invoice"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSourceType(opt)}
              disabled={submitting}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: sourceType === opt ? "var(--card)" : "transparent",
                color: sourceType === opt ? "var(--ink)" : "var(--muted-d)",
                border: "1px solid var(--line-d)",
                cursor: "pointer",
              }}
            >
              {opt === "auto" ? "Detectar" : opt === "bank_statement" ? "Extrato" : "Fatura"}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--card)",
              fontSize: 12.5,
              color: "var(--alert)",
              border: "1px solid var(--alert)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || submitting}
          style={{
            marginTop: 16,
            width: "100%",
            height: 48,
            borderRadius: 24,
            background: !file || submitting ? "var(--card)" : "var(--accent)",
            color: !file || submitting ? "var(--muted-d)" : "var(--accent-on)",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: !file || submitting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {submitting ? (
            <>
              <Spinner /> Processando (~30s a 1 min)
            </>
          ) : (
            "Enviar e extrair"
          )}
        </button>

        {submitting && (
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
            <Pill tone="accent">processando</Pill>
          </div>
        )}
      </form>
    </ScreenShell>
  );
}

function Spinner() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{
          animation: "spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </svg>
  );
}
