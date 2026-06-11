"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";

type CardOption = { id: string; name: string; type: string };

function progressMessage(seconds: number): string {
  if (seconds < 5) return "Enviando arquivo…";
  if (seconds < 15) return "Extraindo dados com IA…";
  if (seconds < 30) return `Processando (${seconds}s) — Gemini lendo a fatura…`;
  if (seconds < 50) return `Quase lá (${seconds}s) — não recarregue…`;
  return `${seconds}s — pode demorar mais um pouco, aguarde…`;
}

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
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

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
    const timeout = setTimeout(() => controller.abort(), 80_000);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sourceType", "credit_card_invoice");
      if (cardId) fd.append("bankAccountId", cardId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") ?? "";
      let data: { error?: string; code?: string; canRetry?: boolean; [k: string]: unknown };
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text().catch(() => "");
        if (text.toLowerCase().includes("error occurred")) {
          setError({
            message:
              "A Vercel encerrou o processamento (timeout de 60s). Tente reenviar — geralmente passa na 2ª tentativa.",
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
          message: "Tempo esgotado (80s) sem resposta. Tente reenviar.",
          canRetry: true,
        });
      } else if (msg === "Failed to fetch" || /TypeError.*fetch/i.test(msg)) {
        setError({
          message: "A conexão foi interrompida. Tente reenviar.",
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
          {submitting ? progressMessage(elapsed) : "Enviar e extrair"}
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
