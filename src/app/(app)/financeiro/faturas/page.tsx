import { redirect } from "next/navigation";

// Tela antiga de faturas — substituída pela visão unificada de documentos
// (extratos + faturas lado a lado, organizados por mês).
// As rotas /faturas/[id] e /faturas/upload continuam funcionando.
export default function FaturasRedirect() {
  redirect("/financeiro/documentos");
}
