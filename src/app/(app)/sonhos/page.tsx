import { Sparkles } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export default function SonhosPage() {
  return (
    <ComingSoon
      title="Sonhos"
      description="Lista de sonhos da família — viagens, casa, projetos de longo prazo."
      icon={Sparkles}
      ideas="Cards visuais com imagens e descrição de cada sonho, estimativa de custo, prazo desejado, integração com o financeiro pra mostrar quanto falta poupar."
    />
  );
}
