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
  bankSlug: string; // unicred, sicredi, santander, nubank, other
  referenceMonth: string | null; // YYYY-MM
  transactions: ExtractedTransaction[];
};

const SCHEMA = {
  type: Type.OBJECT,
  required: ["documentType", "bankSlug", "transactions"],
  properties: {
    documentType: {
      type: Type.STRING,
      enum: ["bank_statement", "credit_card_invoice", "unknown"],
      description: "bank_statement = extrato bancário. credit_card_invoice = fatura de cartão.",
    },
    bankSlug: {
      type: Type.STRING,
      enum: ["unicred", "sicredi", "santander", "nubank", "itau", "bradesco", "bb", "caixa", "inter", "c6", "other"],
    },
    referenceMonth: {
      type: Type.STRING,
      nullable: true,
      description: "Mês de referência do documento no formato YYYY-MM. Null se não detectado.",
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

9. **documentType**:
   - Se vê linhas com "Saldo" + valores e tabela com débito/crédito separados → bank_statement
   - Se vê "FATURA", "VENCIMENTO", "PAGAMENTO MÍNIMO" e LANÇAMENTOS de cartão → credit_card_invoice

10. **bankSlug**: identifique pelo logo/cabeçalho. "UNICRED" → unicred. Se não conseguir → "other".

Retorne APENAS o JSON. Sem markdown, sem prefácio.`;

export async function extractFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
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

  const text = response.text;
  if (!text) {
    throw new Error("Gemini retornou resposta vazia");
  }

  const parsed = JSON.parse(text) as ExtractionResult;

  // Sanity check + normalização
  if (!Array.isArray(parsed.transactions)) {
    throw new Error("Resposta do Gemini não tem array de transactions");
  }

  return parsed;
}
