import { MessageSquare } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export default function ChatPage() {
  return (
    <ComingSoon
      title="Chat IA da Família"
      description="Converse com um agente que conhece o contexto financeiro e pessoal da família."
      icon={MessageSquare}
      ideas="Memória persistente da família (fatos relevantes, preferências, metas) e capacidade de responder perguntas sobre os gastos. Construído após estabilização do módulo financeiro."
    />
  );
}
