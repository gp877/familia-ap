import { redirect } from "next/navigation";

// Fluxo antigo de upload de fatura — unificado em /financeiro/upload:
// a tela única aceita contas E cartões, e o tipo do documento é derivado
// da conta escolhida (cartão → fatura, conta → extrato).
export default function FaturaUploadRedirect() {
  redirect("/financeiro/upload");
}
