"use client";

import { Loader2, Upload as UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Extração concluída
          </h1>
          <p className="text-muted-foreground">
            {result.extractedCount} transações foram extraídas e salvas como
            pendentes pra você revisar.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Banco identificado:</span>
              <span className="font-medium">{result.bankSlug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo de documento:</span>
              <span className="font-medium">
                {result.documentType === "bank_statement"
                  ? "Extrato bancário"
                  : result.documentType === "credit_card_invoice"
                    ? "Fatura de cartão"
                    : "Desconhecido"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transações extraídas:</span>
              <span className="font-medium">{result.extractedCount}</span>
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/financeiro/transacoes")}>
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload de PDF</h1>
        <p className="text-muted-foreground">
          Envie um extrato bancário ou fatura de cartão. O sistema usa IA pra
          extrair as transações e tenta categorizar automaticamente baseado nas
          regras que você já criou.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Arquivo</CardTitle>
            <CardDescription>
              Aceitamos PDFs de extrato ou fatura. Tamanho máximo: 10 MB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="file">
                PDF
              </label>
              <input
                id="file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                required
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor="sourceType">
                Tipo (opcional)
              </label>
              <select
                id="sourceType"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                disabled={submitting}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="auto">Detectar automaticamente</option>
                <option value="bank_statement">Extrato bancário</option>
                <option value="credit_card_invoice">Fatura de cartão</option>
              </select>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={!file || submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processando ({"~"}30s a 1min)
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 size-4" />
                  Enviar e extrair
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
