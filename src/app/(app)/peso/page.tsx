import { Scale } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export default function PesoPage() {
  return (
    <ComingSoon
      title="Peso & Saúde"
      description="Registro de peso, medidas, exercícios e indicadores de saúde da família."
      icon={Scale}
      ideas="Gráfico de evolução de peso, lembretes, integração com balança ou smartwatch, metas de saúde compartilhadas."
    />
  );
}
