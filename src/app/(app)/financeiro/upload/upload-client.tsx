"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";

type AccountOption = { id: string; name: string; type: string };

type Props = {
  accounts: AccountOption[];
};

function isCheckingLike(type: string) {
  return type === "checking" || type === "savings" || type === "investment" || type === "other";
}

/**
 * Upload de extrato bancário (CC, poupança, investimento, outros).
 * Faturas de cartão têm fluxo próprio em /financeiro/faturas/upload —
 * essa tela rejeita cartões na lista e fixa sourceType="bank_statement".
 */
export function UploadClient({ accounts }: Props) {
  const router = useRouter();
  const accountsForStatement = accounts.filter((a) => isCheckingLike(a.type));
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    extractedCount: number;
    savedCount?: number;
    skippedCount?: number;
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
      fd.append("sourceType", "bank_statement");
      if (bankAccountId) fd.append("bankAccountId", bankAccountId);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      // Parse defensivo: timeout da Vercel devolve HTML ("An error occurred…"),
      // não JSON. Em vez de explodir com "Unexpected token", mostra mensagem
      // amigável + sugere reenviar.
      let data: { error?: string; [k: string]: unknown };
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text().catch(() => "");
        if (text.toLowerCase().includes("error occurred")) {
          throw new Error(
            "A Vercel encerrou o processamento (timeout de 60s). O PDF é grande ou o Gemini está lento. Reenvie o arquivo — geralmente passa na 2ª tentativa."
          );
        }
        throw new Error(
          `Resposta inesperada do servidor (HTTP ${res.status}). Reenvie o arquivo.`
        );
      }
      if (!res.ok) throw new Error(data.error || "Falha no upload");
      setResult(data as Parameters<typeof setResult>[0]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Erro de rede genérico ("Failed to fetch") também é típico de timeout
      if (msg === "Failed to fetch" || /TypeError.*fetch/i.test(msg)) {
        setError(
          "A conexão foi interrompida (provável timeout). Reenvie o arquivo."
        );
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const saved = result.savedCount ?? result.extractedCount;
    const skipped = result.skippedCount ?? 0;
    return (
      <ScreenShell
        userQ="Já processou o extrato?"
        insight={
          <>
            <b>{saved}</b> {saved === 1 ? "transação salva" : "transações salvas"} como pendente.
            {skipped > 0 ? (
              <>
                {" "}
                <b>{skipped}</b> {skipped === 1 ? "já estava" : "já estavam"} no banco (duplicada) e {skipped === 1 ? "foi ignorada" : "foram ignoradas"}.
              </>
            ) : null}
          </>
        }
      >
        <SectionRow icon="file" label="Pronto" action="extração concluída" />
        <BigNumber value={`${saved} salvas`} sub={skipped > 0 ? `${skipped} duplicadas ignoradas` : undefined} accent />

        <div style={{ padding: "14px 20px 0" }}>
          <Card raised pad={16}>
            <Row label="Banco" value={result.bankSlug} />
            <Row label="Tipo" value="Extrato bancário" />
            <Row label="Transações" value={String(result.extractedCount)} />
          </Card>
        </div>

        <div style={{ padding: "16px 20px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => router.push("/financeiro/transacoes")}
            style={primaryButtonStyle}
          >
            Ver transações
          </button>
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

  const needsAccount = accountsForStatement.length === 0;

  return (
    <ScreenShell
      userQ="Quero subir um extrato"
      insight={
        needsAccount ? (
          <>
            Antes de subir, <b>cadastra uma conta corrente ou poupança</b> em <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>/financeiro/contas</a> — fatura de cartão é em <a href="/financeiro/faturas/upload" style={{ color: "var(--accent)" }}>/financeiro/faturas</a>.
          </>
        ) : (
          <>Selecione a conta, mande o PDF do extrato — eu extraio e categorizo automaticamente. <b>Fatura de cartão</b> tem fluxo próprio em <a href="/financeiro/faturas/upload" style={{ color: "var(--accent)" }}>/financeiro/faturas</a>.</>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro/extratos" label="Extratos" />
      </div>

      <SectionRow icon="file" label="Subir extrato" />
      <BigNumber value="PDF" sub="extrato bancário (CC, poupança, investimento)" />

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
                até 10 MB · extrato bancário
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

        {/* Seleção de conta — só CC/poupança/investimento (cartões têm fluxo próprio) */}
        <div style={{ marginTop: 18 }}>
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
            Conta *
          </label>
          {accountsForStatement.length === 0 ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--card2)",
                fontSize: 12,
                color: "var(--muted-d)",
              }}
            >
              Nenhuma conta corrente/poupança cadastrada. Vá em{" "}
              <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
                /financeiro/contas
              </a>{" "}
              primeiro.
            </div>
          ) : (
            <AccountList
              accounts={accountsForStatement}
              value={bankAccountId}
              onChange={setBankAccountId}
              disabled={submitting}
            />
          )}
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
              <Spinner /> Processando — pode levar até 1 min, não recarregue
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

/**
 * Lista de contas (sem cartões — esses têm fluxo próprio em /financeiro/faturas/upload).
 */
function AccountList({
  accounts,
  value,
  onChange,
  disabled,
}: {
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {accounts.map((a) => {
          const selected = value === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange(a.id)}
              disabled={disabled}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                background: selected
                  ? "color-mix(in oklab, var(--accent) 14%, var(--card))"
                  : "var(--card)",
                border: selected
                  ? "1px solid var(--accent)"
                  : "0.5px solid var(--line-d)",
                color: "var(--ink)",
                fontSize: 13.5,
                fontWeight: selected ? 700 : 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: selected ? "var(--accent)" : "var(--muted)",
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{a.name}</span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                {typeLabel(a.type)}
              </span>
            </button>
          );
        })}
    </div>
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
