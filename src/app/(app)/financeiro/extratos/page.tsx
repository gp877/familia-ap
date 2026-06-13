import { redirect } from "next/navigation";

// Tela antiga de extratos — substituída pela visão unificada de documentos
// (extratos + faturas lado a lado, organizados por mês).
export default function ExtratosRedirect() {
  redirect("/financeiro/documentos");
}
