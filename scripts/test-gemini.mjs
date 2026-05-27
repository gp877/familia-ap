import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log("NO KEY in env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const candidates = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

for (const model of candidates) {
  try {
    const r = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Diga apenas: ok" }] }],
    });
    console.log(`OK  ${model} -> ${(r.text ?? "").trim().slice(0, 80)}`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.log(`ERR ${model} -> ${msg.slice(0, 200)}`);
  }
}
