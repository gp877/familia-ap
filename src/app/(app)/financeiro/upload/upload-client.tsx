"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";

type AccountOption = { id: string; name: string; type: string };

type Props = {
  accounts: AccountOption[];
};

function isCheckingLike(type: string) {
  return type === "checking" || type === "savings" || type === "investment" || type === "other";
}

/**
 * Mensagem contextual conforme tempo decorre. Dá feedback de que o
 * processo está em curso e não travou — importante porque o user
 * sem feedback pode achar que travou e recarregar (e perder tudo).
 */
function progressMessage(seconds: number): string {
  if (seconds < 5) return "Enviando arquivo…";
  if (seconds < 15) return "Extraindo dados com IA…";
  if (seconds < 30) return `Processando (${seconds}s) — Gemini lendo o PDF…`;
  if (seconds < 50) return `Quase lá (${seconds}s) — não recarregue…`;
  return `${seconds}s — pode demorar mais um pouco, aguarde…`;
}

/**
 * Upload UNIFICADO de documentos: extrato bancário OU fatura de cartão.
 * O usuário não precisa saber a diferença de fluxo — escolhe a conta/cartão
 * e o tipo é derivado dela: conta corrente/poupança → extrato; cartão de
 * crédito → fatura. Uma tela só, um botão só.
 */
export function UploadClient({ accounts }: Props) {
  const router = useRouter();
  const checkingAccounts = accounts.filter((a) => isCheckingLike(a.type));
  const cardAccounts = accounts.filter((a) => a.type === "credit_card");
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>("");

  const selectedAccount = accounts.find((a) => a.id === bankAccountId) ?? null;
  const isCard = selectedAccount?.type === "credit_card";
  const sourceType = isCard ? "credit_card_invoice" : "bank_statement";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0); // segundos
  const abortRef = useRef<AbortController | null>(null);

  // Cronômetro durante upload — fornece feedback visual contínuo e
  // contextualiza que "tá demorando, calma".
  useEffect(() => {
    if (!submitting) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [submitting]);
  const [result, setResult] = useState<{
    extractedCount: number;
    savedCount?: number;
    skippedCount?: number;
    bankSlug: string;
    documentType: string;
    invoiceId: string | null;
  } | null>(null);

  async function doUpload() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    // Timeout client > Vercel (60s) por margem — se a Vercel timeoutar, a
    // resposta HTML chega antes; se a rede travar, a gente aborta em 80s.
    const timeout = setTimeout(() => controller.abort(), 80_000);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sourceType", sourceType);
      if (bankAccountId) fd.append("bankAccountId", bankAccountId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });

      // Parse defensivo: timeout da Vercel devolve HTML ("An error occurred…"),
      // não JSON. Em vez de explodir com "Unexpected token", mostra mensagem
      // amigável + sugere reenviar.
      const contentType = res.headers.get("content-type") ?? "";
      let data: { error?: string; code?: string; canRetry?: boolean; [k: string]: unknown };

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text().catch(() => "");
        if (text.toLowerCase().includes("error occurred")) {
          setError({
            message:
              "A Vercel encerrou o processamento (timeout de 60s). O PDF pode ser grande ou o Gemini está lento. Tente reenviar — geralmente passa na 2ª tentativa.",
            canRetry: true,
          });
          return;
        }
        setError({
          message: `Resposta inesperada do servidor (HTTP ${res.status}). Reenvie o arquivo.`,
          canRetry: true,
        });
        return;
      }

      if (!res.ok) {
        setError({
          message: data.error || "Falha no upload",
          canRetry: data.canRetry !== false,
        });
        return;
      }
      setResult(data as Parameters<typeof setResult>[0]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted) {
        setError({
          message:
            "Tempo esgotado (80s) sem resposta do servidor. A conexão pode ter caído. Tente reenviar.",
          canRetry: true,
        });
      } else if (msg === "Failed to fetch" || /TypeError.*fetch/i.test(msg)) {
        setError({
          message: "A conexão foi interrompida. Tente reenviar — pode ser instabilidade momentânea.",
          canRetry: true,
        });
      } else {
        setError({ message: msg, canRetry: true });
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doUpload();
  }

  function cancelUpload() {
    abortRef.current?.abort();
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
            <Row
              label="Tipo"
              value={
                result.documentType === "credit_card_invoice"
                  ? "Fatura de cartão"
                  : "Extrato bancário"
              }
            />
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
      userQ="Quero subir um extrato ou fatura"
      insight={
        needsAccount ? (
          <>
            Antes de subir, <b>cadastra uma conta ou cartão</b> em <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>/financeiro/contas</a>.
          </>
        ) : (
          <>Escolha a conta ou cartão e mande o PDF — eu detecto o tipo: conta vira <b>extrato</b>, cartão vira <b>fatura</b>. Extraio e categorizo automaticamente.</>
        )
      }
    >
      <SectionRow icon="file" label="Subir documento" />
      <BigNumber
        value="PDF"
        sub={
          selectedAccount
            ? isCard
              ? `fatura de cartão · ${selectedAccount.name}`
              : `extrato bancário · ${selectedAccount.name}`
            : "extrato bancário ou fatura de cartão"
        }
      />

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

        {/* Seleção de conta/cartão — define o TIPO do documento */}
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
            Conta ou cartão *
          </label>
          {needsAccount ? (
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
          ) : (
            <>
              {checkingAccounts.length > 0 && (
                <>
                  <GroupCaption text="🏦 contas — PDF entra como extrato" />
                  <AccountList
                    accounts={checkingAccounts}
                    value={bankAccountId}
                    onChange={setBankAccountId}
                    disabled={submitting}
                  />
                </>
              )}
              {cardAccounts.length > 0 && (
                <>
                  <GroupCaption text="💳 cartões — PDF entra como fatura" />
                  <AccountList
                    accounts={cardAccounts}
                    value={bankAccountId}
                    onChange={setBankAccountId}
                    disabled={submitting}
                  />
                </>
              )}
            </>
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
            <div style={{ fontWeight: 600, marginBottom: error.canRetry ? 10 : 0 }}>
              {error.message}
            </div>
            {error.canRetry && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={doUpload}
                  disabled={submitting}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "var(--alert)",
                    color: "var(--accent-on)",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: submitting ? "wait" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ↻ Tentar de novo (mesmo arquivo)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFile(null);
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "transparent",
                    color: "var(--muted-d)",
                    border: "0.5px solid var(--line-d)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Escolher outro
                </button>
              </div>
            )}
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
              <Spinner /> {progressMessage(elapsed)}
            </>
          ) : (
            "Enviar e extrair"
          )}
        </button>

        {submitting && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <Pill tone="accent">{elapsed}s decorridos</Pill>
            <button
              type="button"
              onClick={cancelUpload}
              style={{
                background: "transparent",
                color: "var(--muted-d)",
                border: "none",
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              cancelar
            </button>
          </div>
        )}
      </form>
    </ScreenShell>
  );
}

function GroupCaption({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: "var(--muted)",
        margin: "10px 0 6px",
      }}
    >
      {text}
    </div>
  );
}

/** Lista de contas selecionáveis (botões-rádio estilizados). */
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
