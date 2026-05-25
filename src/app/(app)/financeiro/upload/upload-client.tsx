"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";

type SourceType = "auto" | "bank_statement" | "credit_card_invoice";
type AccountOption = { id: string; name: string; type: string };

type Props = {
  accounts: AccountOption[];
};

export function UploadClient({ accounts }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [sourceType, setSourceType] = useState<SourceType>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    extractedCount: number;
    bankSlug: string;
    documentType: string;
    invoiceId: string | null;
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
      if (bankAccountId) fd.append("bankAccountId", bankAccountId);

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
        insight={
          <>
            {result.extractedCount} transações salvas como pendentes.
            {result.invoiceId
              ? " Fatura criada e vinculada — você consegue revisar em /financeiro/faturas."
              : " Revise as categorias na lista."}
          </>
        }
      >
        <SectionRow icon="file" label="Pronto" action="extração concluída" />
        <BigNumber value={`${result.extractedCount} transações`} accent />

        <div style={{ padding: "14px 20px 0" }}>
          <Card raised pad={16}>
            <Row label="Banco" value={result.bankSlug} />
            <Row
              label="Tipo"
              value={
                result.documentType === "bank_statement"
                  ? "Extrato bancário"
                  : result.documentType === "credit_card_invoice"
                    ? "Fatura de cartão"
                    : "Desconhecido"
              }
            />
            {result.invoiceId && (
              <Row label="Fatura" value="vinculada" />
            )}
            <Row label="Transações" value={String(result.extractedCount)} />
          </Card>
        </div>

        <div style={{ padding: "16px 20px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {result.invoiceId ? (
            <button
              type="button"
              onClick={() => router.push(`/financeiro/faturas/${result.invoiceId}`)}
              style={primaryButtonStyle}
            >
              Ver fatura
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/financeiro/transacoes")}
              style={primaryButtonStyle}
            >
              Ver transações
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
            style={secondaryButtonStyle}
          >
            Subir outro
          </button>
        </div>
      </ScreenShell>
    );
  }

  const needsAccount = accounts.length === 0;

  return (
    <ScreenShell
      userQ="Quero subir um extrato"
      insight={
        needsAccount ? (
          <>
            Antes de subir, <b>cadastra suas contas e cartões</b> em <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>/financeiro/contas</a> — assim as transações ficam organizadas por conta.
          </>
        ) : (
          <>Selecione a conta ou cartão, mande o PDF — eu extraio e categorizo automaticamente.</>
        )
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

        {/* Seleção de conta */}
        <div style={{ marginTop: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 6,
            }}
          >
            Conta / cartão *
          </label>
          {accounts.length > 0 ? (
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                background: "var(--card2)",
                color: "var(--ink)",
                border: bankAccountId ? "1px solid transparent" : "1px solid var(--alert)",
                fontSize: 13.5,
                fontFamily: "inherit",
              }}
            >
              <option value="">Selecione...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({typeLabel(a.type)})
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--card2)",
                fontSize: 12,
                color: "var(--muted-d)",
              }}
            >
              Nenhuma conta cadastrada. Vá em{" "}
              <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
                /financeiro/contas
              </a>{" "}
              primeiro.
            </div>
          )}
        </div>

        {/* Tipo de documento */}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          disabled={!file || !bankAccountId || submitting || needsAccount}
          style={{
            marginTop: 16,
            width: "100%",
            height: 48,
            borderRadius: 24,
            background: !file || !bankAccountId || submitting || needsAccount ? "var(--card)" : "var(--accent)",
            color: !file || !bankAccountId || submitting || needsAccount ? "var(--muted-d)" : "var(--accent-on)",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: !file || !bankAccountId || submitting || needsAccount ? "not-allowed" : "pointer",
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

function typeLabel(t: string) {
  return t === "checking"
    ? "CC"
    : t === "savings"
      ? "Poupança"
      : t === "credit_card"
        ? "Cartão"
        : t === "investment"
          ? "Inv."
          : "Outra";
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 16,
  background: "var(--accent)",
  color: "var(--accent-on)",
  fontWeight: 700,
  fontSize: 13.5,
  border: "none",
  cursor: "pointer",
  flex: 1,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 16,
  background: "var(--card)",
  color: "var(--ink-d)",
  fontSize: 13.5,
  border: "none",
  cursor: "pointer",
  flex: 1,
};

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
