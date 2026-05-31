"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";

type SourceType = "auto" | "bank_statement" | "credit_card_invoice";
type AccountOption = { id: string; name: string; type: string };

type Props = {
  accounts: AccountOption[];
};

function isCard(type: string) {
  return type === "credit_card";
}
function isCheckingLike(type: string) {
  return type === "checking" || type === "savings" || type === "investment" || type === "other";
}

export function UploadClient({ accounts }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [sourceType, setSourceType] = useState<SourceType>("auto");
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
            {result.invoiceId ? " Fatura vinculada." : ""}
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
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

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

        {/* Tipo de documento — escolha primeiro pra filtrar contas relevantes */}
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
            Tipo de documento *
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                { v: "bank_statement", label: "Extrato bancário" },
                { v: "credit_card_invoice", label: "Fatura de cartão" },
                { v: "auto", label: "Detectar" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => {
                  setSourceType(opt.v);
                  // Limpa seleção de conta se mudou o tipo e a atual não bate
                  if (bankAccountId) {
                    const sel = accounts.find((a) => a.id === bankAccountId);
                    if (sel) {
                      const ok =
                        opt.v === "auto" ||
                        (opt.v === "bank_statement" && isCheckingLike(sel.type)) ||
                        (opt.v === "credit_card_invoice" && isCard(sel.type));
                      if (!ok) setBankAccountId("");
                    }
                  }
                }}
                disabled={submitting}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: sourceType === opt.v ? "var(--accent)" : "transparent",
                  color: sourceType === opt.v ? "var(--accent-on)" : "var(--muted-d)",
                  border:
                    sourceType === opt.v ? "1px solid var(--accent)" : "1px solid var(--line-d)",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seleção de conta agrupada — cards visuais filtrados pelo tipo */}
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
            {sourceType === "credit_card_invoice"
              ? "Cartão *"
              : sourceType === "bank_statement"
                ? "Conta *"
                : "Conta ou cartão *"}
          </label>
          {accounts.length === 0 ? (
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
            <AccountPicker
              accounts={accounts}
              sourceType={sourceType}
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

/**
 * Picker visual de conta/cartão agrupado por categoria. Filtra pela
 * sourceType selecionada (extrato → contas; fatura → cartões; auto → ambos).
 * Substitui o `<select>` HTML que misturava tudo em lista flat.
 */
function AccountPicker({
  accounts,
  sourceType,
  value,
  onChange,
  disabled,
}: {
  accounts: AccountOption[];
  sourceType: SourceType;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const cards = accounts.filter((a) => isCard(a.type));
  const checking = accounts.filter((a) => isCheckingLike(a.type));

  const showCards = sourceType !== "bank_statement";
  const showChecking = sourceType !== "credit_card_invoice";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showChecking && checking.length > 0 && (
        <AccountGroup
          label="Contas"
          accounts={checking}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {showCards && cards.length > 0 && (
        <AccountGroup
          label="Cartões"
          accounts={cards}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {showCards && cards.length === 0 && sourceType === "credit_card_invoice" && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Nenhum cartão cadastrado.{" "}
          <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
            Cadastrar
          </a>
          .
        </div>
      )}
      {showChecking && checking.length === 0 && sourceType === "bank_statement" && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Nenhuma conta cadastrada.{" "}
          <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
            Cadastrar
          </a>
          .
        </div>
      )}
    </div>
  );
}

function AccountGroup({
  label,
  accounts,
  value,
  onChange,
  disabled,
}: {
  label: string;
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
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
