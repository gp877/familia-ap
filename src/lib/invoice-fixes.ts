// Conferências determinísticas sobre o que a IA extraiu de uma fatura de cartão.
import type { ExtractionResult } from "@/lib/extraction";

/**
 * Fatura: a IA às vezes erra o ANO (ex.: fatura de out/2026 lida como 2023 — as
 * compras somem do mês certo). Fatura recente nunca tem compra no futuro nem
 * referência com mais de ~15 meses. Se o ano estiver fora disso, recalcula pela
 * regra da própria fatura: dia/mês até o mês de referência = ano da referência;
 * mês depois dele = ano anterior (ex.: "18/nov Parc.11/11" na fatura de out).
 */
export function fixInvoiceYears(extracted: ExtractionResult, hoje: Date): void {
  const txs = extracted.transactions ?? [];
  if (!txs.length) return;
  const refRaw = /^\d{4}-\d{2}$/.test(extracted.referenceMonth ?? "") ? extracted.referenceMonth! : null;
  const meses = txs.map((t) => t.occurredOn?.slice(0, 7)).filter((m): m is string => /^\d{4}-\d{2}$/.test(m ?? ""));
  if (!meses.length) return;
  const limiteFuturo = new Date(hoje.getTime() + 45 * 864e5).toISOString().slice(0, 7);
  const limitePassado = new Date(hoje.getTime() - 15 * 30 * 864e5).toISOString().slice(0, 7);
  const ref = refRaw ?? meses.sort()[Math.floor(meses.length / 2)];
  const anoErrado = ref > limiteFuturo || ref < limitePassado || meses.some((m) => m > limiteFuturo);
  if (!anoErrado) return;
  const refMes = Number(ref.slice(5, 7));
  // ano da referência = o mais recente em que (ano, refMes) não passa de hoje + 45 dias
  let refAno = hoje.getFullYear();
  if (`${refAno}-${String(refMes).padStart(2, "0")}` > limiteFuturo) refAno -= 1;
  for (const t of txs) {
    const m = Number(t.occurredOn?.slice(5, 7));
    const d = t.occurredOn?.slice(8, 10);
    if (!m || !d) continue;
    const ano = m <= refMes ? refAno : refAno - 1;
    t.occurredOn = `${ano}-${String(m).padStart(2, "0")}-${d}`;
  }
  extracted.referenceMonth = `${refAno}-${String(refMes).padStart(2, "0")}`;
  console.log(`[upload] fatura com ano fora do esperado (${ref}) — datas recalculadas para referência ${extracted.referenceMonth}`);
}

/**
 * Fatura: "R$ 28.474,88" às vezes volta como 28.474 (ponto de milhar lido como
 * decimal). Se o total "escrito" for ~1/1000 da soma dos débitos, descarta e
 * deixa o sistema usar a soma das transações.
 */
export function fixMisreadInvoiceTotal(extracted: ExtractionResult): void {
  const doc = extracted.documentTotal ? parseFloat(extracted.documentTotal) : NaN;
  if (!Number.isFinite(doc) || doc <= 0) return;
  const debitos = (extracted.transactions ?? []).filter((t) => t.kind === "debit").reduce((s, t) => s + parseFloat(t.amount || "0"), 0);
  if (debitos > 1000 && doc < debitos / 100 && Math.abs(doc * 1000 - debitos) / debitos < 0.1) {
    console.log(`[upload] total da fatura lido como ${doc} (soma dos débitos ${debitos.toFixed(2)}) — descartado`);
    extracted.documentTotal = null;
  }
}
