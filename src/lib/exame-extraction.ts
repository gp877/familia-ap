import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type ExtractedMarker = {
  marker: string; // normalizado, snake_case: "glicose", "ldl_colesterol", "hemoglobina_glicada"
  markerLabel: string; // bonito: "Glicose", "LDL Colesterol"
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refMin: number | null;
  refMax: number | null;
  refText: string | null;
  flag: "low" | "normal" | "high" | "unknown";
};

export type ExameExtractionResult = {
  who: string | null; // nome detectado no PDF (paciente)
  examDate: string | null; // YYYY-MM-DD
  examName: string | null; // ex: "Hemograma completo", "Perfil lipídico"
  doctor: string | null; // médico solicitante ou laboratório
  lab: string | null;
  markers: ExtractedMarker[];
  status: "ok" | "atencao" | "anormal";
};

const SCHEMA = {
  type: Type.OBJECT,
  required: ["markers", "status"],
  properties: {
    who: {
      type: Type.STRING,
      nullable: true,
      description: "Nome do paciente, exatamente como aparece no laudo.",
    },
    examDate: {
      type: Type.STRING,
      nullable: true,
      description: "Data da coleta/exame no formato YYYY-MM-DD.",
    },
    examName: {
      type: Type.STRING,
      nullable: true,
      description: "Nome geral do exame ou painel (ex: Hemograma completo).",
    },
    doctor: {
      type: Type.STRING,
      nullable: true,
      description: "Médico solicitante ou laboratório.",
    },
    lab: {
      type: Type.STRING,
      nullable: true,
      description: "Laboratório que processou.",
    },
    status: {
      type: Type.STRING,
      enum: ["ok", "atencao", "anormal"],
      description:
        "Avaliação geral: ok=todos normais, atencao=alguns no limite, anormal=tem valor fora do range.",
    },
    markers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["marker", "markerLabel", "flag"],
        properties: {
          marker: {
            type: Type.STRING,
            description:
              "Identificador normalizado (snake_case, sem acentos): 'glicose', 'ldl_colesterol', 'hdl', 'hemoglobina_glicada', 'tsh', 't4_livre', 'creatinina', etc.",
          },
          markerLabel: {
            type: Type.STRING,
            description: "Nome bonito como apareceu no exame.",
          },
          value: {
            type: Type.NUMBER,
            nullable: true,
            description: "Valor numérico. Null se for textual (ex: 'Negativo').",
          },
          valueText: {
            type: Type.STRING,
            nullable: true,
            description: "Texto do resultado quando não é numérico.",
          },
          unit: { type: Type.STRING, nullable: true, description: "mg/dL, g/dL, %, etc" },
          refMin: { type: Type.NUMBER, nullable: true },
          refMax: { type: Type.NUMBER, nullable: true },
          refText: {
            type: Type.STRING,
            nullable: true,
            description: "Quando a referência é textual ('até 200', 'menor que 100')",
          },
          flag: {
            type: Type.STRING,
            enum: ["low", "normal", "high", "unknown"],
            description: "Comparação com a referência.",
          },
        },
      },
    },
  },
};

const PROMPT = `Você é um assistente que extrai dados estruturados de exames laboratoriais em PDF.

Extraia TODOS os marcadores/parâmetros do exame com seus valores numéricos, unidades e referências.

Regras:
- O nome do marcador (\`marker\`) deve ser normalizado em snake_case sem acentos. Exemplos canônicos:
  glicose, ldl_colesterol, hdl_colesterol, colesterol_total, triglicerides, hemoglobina,
  hemoglobina_glicada, leucocitos, hematocrito, plaquetas, tsh, t4_livre, t3_livre,
  creatinina, ureia, acido_urico, vitamina_d, vitamina_b12, ferro, ferritina, sodio,
  potassio, calcio, magnesio, fosforo, alt_tgp, ast_tgo, ggt, fosfatase_alcalina, bilirrubina_total.
  Use o mesmo \`marker\` para o mesmo tipo, mesmo que o laudo escreva diferente.
- \`markerLabel\` é o texto bonito, como aparece no laudo.
- Compute \`flag\` comparando \`value\` com refMin/refMax (low se value < refMin, high se value > refMax, normal se dentro do range).
  Quando não há referência clara, marque como 'unknown'.
- Se um valor é qualitativo (Negativo/Positivo/Reagente), preencha valueText e deixe value como null.
- examDate: data da COLETA. Se só houver data do laudo, use ela. Formato YYYY-MM-DD.
- status geral: 'ok' se todos normais, 'atencao' se algum no limite, 'anormal' se algum fora do range.`;

export async function extractExameFromPdf(pdfBuffer: Buffer): Promise<ExameExtractionResult> {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 0,
      maxOutputTokens: 8000,
    },
  });

  const raw = response.text?.trim();
  if (!raw) {
    throw new Error("Gemini não retornou conteúdo");
  }

  try {
    const parsed = JSON.parse(raw) as ExameExtractionResult;
    if (!Array.isArray(parsed.markers)) {
      throw new Error("Markers não é array");
    }
    return parsed;
  } catch (e) {
    throw new Error(
      `Falha ao parsear JSON da extração: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
