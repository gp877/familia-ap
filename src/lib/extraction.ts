import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type ExtractedTransaction = {
  occurredOn: string; // YYYY-MM-DD
  description: string; // limpa, pronta pra categorização
  rawDescription: string; // como aparece no PDF
  amount: string; // sempre positivo, formato decimal "1234.56"
  kind: "debit" | "credit";
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
};

export type ExtractionResult = {
  documentType: "bank_statement" | "credit_card_invoice" | "unknown";
  bankSlug: string;
  referenceMonth: string | null; // YYYY-MM
  // Total escrito no PDF (ex: "TOTAL DESTA FATURA: R$ 4.231,56"). Null se não achou.
  documentTotal: string | null;
  // Páginas que a IA acha que processou (pra detectar truncamento)
  pagesReported: number | null;
  // Avisos sobre o documento (linhas ilegíveis, suspeita de corte, etc)
  warnings: string[];
  transactions: ExtractedTransaction[];
};

const SCHEMA = {
  type: Type.OBJECT,
  required: [
    "documentType",
    "bankSlug",
    "documentTotal",
    "pagesReported",
    "warnings",
    "transactions",
  ],
  properties: {
    documentType: {
      type: Type.STRING,
      enum: ["bank_statement", "credit_card_invoice", "unknown"],
      description:
        "bank_statement = extrato bancário. credit_card_invoice = fatura de cartão.",
    },
    bankSlug: {
      type: Type.STRING,
      enum: [
        "unicred",
        "sicredi",
        "santander",
        "nubank",
        "itau",
        "bradesco",
        "bb",
        "caixa",
        "inter",
        "c6",
        "other",
      ],
    },
    referenceMonth: {
      type: Type.STRING,
      nullable: true,
      description: "Mês de referência do documento no formato YYYY-MM. Null se não detectado.",
    },
    documentTotal: {
      type: Type.STRING,
      nullable: true,
      description:
        "Valor total ESCRITO NO PDF. Para fatura: 'TOTAL DESTA FATURA' ou equivalente. Para extrato: null (extrato não tem total único). Formato decimal com ponto, ex: '4231.56'. Null se não encontrar.",
    },
    pagesReported: {
      type: Type.INTEGER,
      nullable: true,
      description:
        "Número de páginas que você processou. Use isso pra detectar se o PDF parece cortado (ex: 'página 1 de 3' visível mas só uma página enviada).",
    },
    warnings: {
      type: Type.ARRAY,
      description:
        "Lista de avisos sobre o documento. Inclua aqui: páginas que pareciam cortadas, linhas com data ilegível, valores ambíguos, suspeitas de truncamento, qualquer coisa que MERECE revisão humana. Array vazio se tudo OK.",
      items: { type: Type.STRING },
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["occurredOn", "description", "rawDescription", "amount", "kind"],
        properties: {
          occurredOn: {
            type: Type.STRING,
            description: "Data da transação no formato YYYY-MM-DD",
          },
          description: {
            type: Type.STRING,
            description:
              "Descrição limpa, focada no estabelecimento ou natureza. Ex: 'iFood Pagamento', 'Mercado Livre', 'IPTU', 'Transferência PIX para terceiro'. Sem códigos internos, sem 'DEB PIX'/'CRED PIX' (use 'Transferência PIX' ou 'Recebimento PIX').",
          },
          rawDescription: {
            type: Type.STRING,
            description: "Texto bruto da linha como aparece no PDF.",
          },
          amount: {
            type: Type.STRING,
            description:
              "Valor SEMPRE positivo, decimal com ponto (não vírgula). Ex: '1234.56'. O sinal vai no campo 'kind'.",
          },
          kind: {
            type: Type.STRING,
            enum: ["debit", "credit"],
            description: "debit = saída/despesa. credit = entrada/receita/pagamento de cartão.",
          },
          installmentCurrent: {
            type: Type.INTEGER,
            nullable: true,
          },
          installmentTotal: {
            type: Type.INTEGER,
            nullable: true,
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é um extrator de transações de documentos bancários brasileiros. Sua única tarefa é converter o PDF anexo em JSON estruturado.

Regras críticas:

1. **TODA transação do PDF deve ser extraída** — não pule, não resuma.

2. **Datas**: sempre no formato ISO YYYY-MM-DD.
   - Extrato bancário: data tem ano completo (ex: 02/02/2026 → "2026-02-02").
   - Fatura de cartão: data tem mês abreviado em português (ex: "06/jan", "01/fev"). Use o mês de referência da fatura pra inferir o ano correto. Compras antes do mês de referência são do ano anterior; compras no mês ou depois são do mesmo ano.

3. **Valor (amount)**: SEMPRE positivo, decimal com ponto.
   - "R$ 1.234,56" → "1234.56"
   - "- R$ 160,00" → "160.00" (o sinal vira kind=debit)
   - "R$ 15.000,00" → "15000.00"

4. **kind**:
   - **bank_statement** (extrato): valores negativos no PDF (com "-" antes) → debit. Valores positivos → credit. ESTORNO PIX é credit (devolução).
   - **credit_card_invoice** (fatura): valores positivos → debit (você gastou). Valores negativos (com "-" antes, ex: "Pagamento Recebido", "Anuidade - bonificação") → credit.

5. **description** (limpa):
   - "DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX / Odair Jose de Vargas )" → "Transferência PIX para Odair Jose de Vargas"
   - "DEBITO PAGAMENTO PIX ( Doc.: PGTO PIX / IFOOD PAGO INSTITUICAO DE PAGAMENTO SA )" → "iFood"
   - "CREDITO RECEBIMENTO DE PIX ( Doc.: CRED PIX / WINDI COBRANCAS LTDA )" → "Recebimento PIX de Windi Cobranças"
   - "LIQUIDACAO DE TITULO - IB ( Doc.: 0603694098 / IPTU )" → "IPTU"
   - "DEBITO FATURA- CARTAO VISA ( ... )" → "Pagamento Fatura Cartão Visa"
   - "MERCADOLIVRE*7PRODUTOS Parc.2/2" → "Mercado Livre"
   - "DE VILLE BRAVA BE" → "De Ville Brava" (limpe códigos finais aleatórios)
   - Preserve nome do estabelecimento mesmo que abreviado. Não invente.

6. **rawDescription**: texto bruto exato do PDF (sem reformatação).

7. **Parcelas (fatura)**: "Parc.2/5" → installmentCurrent=2, installmentTotal=5. Sem parcela: null.

8. **NÃO inclua**:
   - Linhas de saldo (saldo anterior, saldo final, saldo atual)
   - Subtotais ou totais
   - "Lançamentos futuros" sem data
   - IOF rotativo se aparecer como linha de encargo sem data específica (mas IOF de compra específica COM data, sim)
   - Cabeçalhos de página

8.b. **INCLUA SIM** (mesmo parecendo "ajuste"):
   - Extrato: "DEBITO FATURA- CARTAO VISA" → INCLUA como debit. O sistema marca como transferência interna depois — não é tua tarefa decidir.
   - Fatura: "Pagamento Recebido" (-R$ valor grande) → INCLUA como credit. Idem.
   - Fatura: "Anuidade - bonificação" (-R$ pequeno) → INCLUA como credit.
   - Extrato: "ESTORNO PIX" → INCLUA como credit.
   - Tua regra é simples: se a linha tem data + descrição + valor, EXTRAIA. Quem decide se é "real" vs "neutro" é o código que roda depois.

9. **documentType**:
   - Se vê linhas com "Saldo" + valores e tabela com débito/crédito separados → bank_statement
   - Se vê "FATURA", "VENCIMENTO", "PAGAMENTO MÍNIMO" e LANÇAMENTOS de cartão → credit_card_invoice

10. **bankSlug**: identifique pelo logo/cabeçalho. "UNICRED" → unicred. Se não conseguir → "other".

11. **documentTotal**: Procure o total ESCRITO no PDF.
    - Fatura: linhas como "TOTAL DESTA FATURA", "VALOR TOTAL", "TOTAL A PAGAR" — pegue esse valor.
    - Extrato: extrato não tem "total" único (tem saldo). Retorne null.
    - Formato decimal com ponto. Sem este campo, perdemos a chance de cross-check.

12. **pagesReported**: Conte quantas páginas você efetivamente analisou. Se o PDF tem indicação "página X de Y" e Y > pages que você viu, AVISE em warnings.

13. **warnings**: Liste tudo que merece revisão humana:
    - "PDF parece cortado: indica 'página 1 de 3' mas só vi 1 página"
    - "Linha sem data legível na página 2 — pulada"
    - "Valor R$ 1.5_3,00 ambíguo na linha 'IFOOD' — usei 1.503,00"
    - "Encontrei 2 linhas idênticas (data+valor+desc) — incluí ambas"
    Array vazio se tudo OK.

Retorne APENAS o JSON. Sem markdown, sem prefácio.`;

/**
 * Erros recuperáveis do Gemini (503 sobrecarga, 429 rate limit, 500
 * interno, timeouts de rede). 400/401/403 NÃO retry — input ruim ou
 * credencial errada não vai melhorar tentando de novo.
 */
function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
  if (code === 503 || code === 429 || code === 500 || code === 502 || code === 504) return true;
  return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|500|timeout|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function extractFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
  // Retry pra 503/429/timeout. Budget super apertado (~2s no pior caso)
  // — com gemini-2.5-flash-lite a chamada base é só ~2s, então um retry
  // rápido cabe tranquilo nos 60s do Vercel. Se falhar 2x seguidas,
  // user reenviando manualmente é mais útil.
  const delays = [2000];
  let lastErr: unknown = null;
  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const tStart = Date.now();
    try {
      response = await ai.models.generateContent({
        // gemini-2.5-flash-lite: 4x mais rápido que flash normal (1.7s vs
        // 6.7s num PDF típico de extrato), e tem cota MUITO maior. Pra
        // PDFs de extrato/fatura, lite é mais que suficiente — quando
        // falhar com erro de qualidade, escalonamos pro flash normal.
        model: "gemini-2.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBuffer.toString("base64"),
                },
              },
              { text: SYSTEM_PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0,
        },
      });
      console.log(
        `[extraction] Gemini ok em ${Date.now() - tStart}ms (tentativa ${attempt + 1}/${delays.length + 1}, PDF ${(pdfBuffer.length / 1024).toFixed(1)} KB)`
      );
      break;
    } catch (err) {
      lastErr = err;
      const elapsed = Date.now() - tStart;
      if (attempt === delays.length || !isRetryableError(err)) {
        console.error(
          `[extraction] Gemini falhou definitivamente após ${elapsed}ms (tentativa ${attempt + 1}). Erro:`,
          err instanceof Error ? err.message : err
        );
        throw err;
      }
      const wait = delays[attempt];
      console.warn(
        `[extraction] Gemini falhou em ${elapsed}ms (tentativa ${attempt + 1}/${delays.length + 1}). Retentar em ${wait}ms. Erro:`,
        err instanceof Error ? err.message : err
      );
      await sleep(wait);
    }
  }
  if (!response) throw lastErr ?? new Error("Extraction falhou");

  const text = response.text;
  if (!text) {
    throw new Error("Gemini retornou resposta vazia");
  }

  const parsed = JSON.parse(text) as ExtractionResult;

  if (!Array.isArray(parsed.transactions)) {
    throw new Error("Resposta do Gemini não tem array de transactions");
  }
  if (!Array.isArray(parsed.warnings)) {
    parsed.warnings = [];
  }

  return parsed;
}
