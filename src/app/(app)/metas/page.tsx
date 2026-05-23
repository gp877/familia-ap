import { Target } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export default function MetasPage() {
  return (
    <ComingSoon
      title="Metas"
      description="Objetivos da família: financeiros, profissionais, pessoais."
      icon={Target}
      ideas="Definição de metas SMART, marcos intermediários, progresso visível em cards, integração com o módulo financeiro (ex: meta de economizar X% por mês)."
    />
  );
}
