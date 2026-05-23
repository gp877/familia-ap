"use client";

import { CheckCircle2, FileText, Loader2, Upload as UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <div className="space-y-8 max-w-2xl">
        <PageHeader
          title="Extração concluída"
          description={`${result.extractedCount} transações foram extraídas e salvas como pendentes pra você revisar.`}
        />
        <Card className="border-success/30 bg-gradient-to-br from-success/5 to-transparent">
          <CardHeader>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <CardTitle className="mt-3">Tudo certo</CardTitle>
            <CardDescription>
              Vá pra lista de transações pra revisar e ajustar categorias. Cada
              ajuste vira regra automática.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              <Row label="Banco identificado" value={result.bankSlug} />
              <Row
                label="Tipo de documento"
                value={
                  result.documentType === "bank_statement"
                    ? "Extrato bancário"
                    : result.documentType === "credit_card_invoice"
                      ? "Fatura de cartão"
                      : "Desconhecido"
                }
              />
              <Row
                label="Transações extraídas"
                value={result.extractedCount.toString()}
              />
            </dl>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => router.push("/financeiro/transacoes")}
            className="bg-gradient-brand text-white"
          >
            Ver transações
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
          >
            Subir outro PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        title="Subir PDF"
        description="Envie um extrato bancário ou fatura de cartão. A IA extrai as transações e tenta categorizar baseado nas regras que você já criou."
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <label
              htmlFor="file"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                file
                  ? "border-success/40 bg-success/5"
                  : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full ${
                  file ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                }`}
              >
                {file ? (
                  <FileText className="size-6" />
                ) : (
                  <UploadIcon className="size-6" />
                )}
              </div>
              {file ? (
                <>
                  <p className="mt-3 font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · clique pra trocar
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-medium">Clique pra escolher um PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Extrato bancário ou fatura de cartão · até 10 MB
                  </p>
                </>
              )}
              <input
                id="file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                required
                className="sr-only"
              />
            </label>

            <div>
              <label
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                htmlFor="sourceType"
              >
                Tipo de documento (opcional)
              </label>
              <select
                id="sourceType"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                disabled={submitting}
                className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="auto">Detectar automaticamente</option>
                <option value="bank_statement">Extrato bancário</option>
                <option value="credit_card_invoice">Fatura de cartão</option>
              </select>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={!file || submitting}
              size="lg"
              className="w-full bg-gradient-brand text-white hover:opacity-95"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processando ({"~"}20s a 1 min)
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 size-4" />
                  Enviar e extrair transações
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
