import { MoreHorizontal } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export default function OutrosPage() {
  return (
    <ComingSoon
      title="Outros"
      description="Espaço pra demandas familiares que ainda não têm módulo próprio."
      icon={MoreHorizontal}
      ideas="Lugar pra anotações, lembretes, links úteis, contatos — tudo que a família quiser ter à mão sem precisar de um módulo dedicado. Quando alguma demanda crescer, vira módulo próprio."
    />
  );
}
