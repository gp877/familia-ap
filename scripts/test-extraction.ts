/* eslint-disable no-console */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractFromPdf } from "../src/lib/extraction";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: tsx scripts/test-extraction.ts <caminho.pdf>");
    process.exit(1);
  }

  const buf = readFileSync(resolve(file));
  console.log(`Lendo ${file} (${(buf.length / 1024).toFixed(1)} KB)...`);
  console.log("Chamando Gemini...\n");

  const t0 = Date.now();
  const result = await extractFromPdf(buf);
  const ms = Date.now() - t0;

  console.log(`✓ Pronto em ${ms}ms\n`);
  console.log(`documentType: ${result.documentType}`);
  console.log(`bankSlug:     ${result.bankSlug}`);
  console.log(`referenceMonth: ${result.referenceMonth}`);
  console.log(`transactions: ${result.transactions.length}\n`);

  console.log("Primeiras 5 transações:");
  for (const t of result.transactions.slice(0, 5)) {
    const sign = t.kind === "debit" ? "-" : "+";
    const parc =
      t.installmentCurrent && t.installmentTotal
        ? ` [Parc.${t.installmentCurrent}/${t.installmentTotal}]`
        : "";
    console.log(`  ${t.occurredOn} ${sign}R$${t.amount.padStart(9)}  ${t.description}${parc}`);
  }

  console.log("\nÚltimas 3 transações:");
  for (const t of result.transactions.slice(-3)) {
    const sign = t.kind === "debit" ? "-" : "+";
    console.log(`  ${t.occurredOn} ${sign}R$${t.amount.padStart(9)}  ${t.description}`);
  }

  // Verificações sanidade
  const totalDebit = result.transactions
    .filter((t) => t.kind === "debit")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalCredit = result.transactions
    .filter((t) => t.kind === "credit")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  console.log(`\nTotais: débitos R$ ${totalDebit.toFixed(2)} | créditos R$ ${totalCredit.toFixed(2)}`);
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exit(1);
});
