"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";

type CardOption = { id: string; name: string; type: string };

/**
 * Upload de fatura de cartão de crédito. Espelha visualmente o upload
 * de extratos mas:
 *   - Aceita só contas do tipo `credit_card`
 *   - Fixa sourceType="credit_card_invoice"
 *   - Após sucesso, leva pra /financeiro/faturas/[id] se a API vinculou
 *     a fatura criada
 */
export function InvoiceUploadClient({ cards }: { cards: CardOption[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [cardId, setCardId] = useState<string>("");
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
      fd.append("sourceType", "credit_card_invoice");
      if (cardId) fd.append("bankAccountId", cardId);

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
        userQ="Já processou a fatura?"
        insight={
          <>
            <b>{saved}</b> {saved === 1 ? "lançamento salvo" : "lançamentos salvos"} como pendente.
            {skipped > 0 ? (
              <>
                {" "}
                <b>{skipped}</b> {skipped === 1 ? "já estava" : "já estavam"} no banco e {skipped === 1 ? "foi ignorada" : "foram ignoradas"}.
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
            <Row label="Tipo" value="Fatura de cartão" />
            {result.invoiceId && <Row label="Fatura" value="vinculada" />}
            <Row label="Lançamentos" value={String(result.extractedCount)} />
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
              onClick={() => router.push("/financeiro/faturas")}
              style={primaryButtonStyle}
            >
              Ver faturas
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
            Subir outra
          </button>
        </div>
      </ScreenShell>
    );
  }

  const noCards = cards.length === 0;

  return (
    <ScreenShell
      userQ="Quero subir uma fatura"
      insight={
        noCards ? (
          <>
            Antes de subir, <b>cadastra um cartão de crédito</b> em <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>/financeiro/contas</a>.
          </>
        ) : (
          <>Selecione o cartão, mande o PDF da fatura — eu extraio os lançamentos e crio o registro da fatura. <b>Extrato bancário</b> tem fluxo próprio em <a href="/financeiro/upload" style={{ color: "var(--accent)" }}>/financeiro/extratos</a>.</>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro/faturas" label="Faturas" />
      </div>

      <SectionRow icon="file" label="Subir fatura" />
      <BigNumber value="PDF" sub="fatura de cartão de crédito" />

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
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{file.name}</div>
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
                até 10 MB · fatura de cartão
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
            Cartão *
          </label>
          {noCards ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--card2)",
                fontSize: 12,
                color: "var(--muted-d)",
              }}
            >
              Nenhum cartão cadastrado. Vá em{" "}
              <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
                /financeiro/contas
              </a>{" "}
              primeiro.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cards.map((a) => {
                const selected = cardId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setCardId(a.id)}
                    disabled={submitting}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: selected
                        ? "color-mix(in oklab, var(--accent) 14%, var(--card))"
                        : "var(--card)",
                      border: selected ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
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
                      Cartão
                    </span>
                  </button>
                );
              })}
            </div>
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
          disabled={!file || !cardId || submitting || noCards}
          style={{
            marginTop: 16,
            width: "100%",
            height: 48,
            borderRadius: 24,
            background: !file || !cardId || submitting || noCards ? "var(--card)" : "var(--accent)",
            color: !file || !cardId || submitting || noCards ? "var(--muted-d)" : "var(--accent-on)",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: !file || !cardId || submitting || noCards ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {submitting ? <>Processando (~30s a 1 min)</> : "Enviar e extrair"}
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
