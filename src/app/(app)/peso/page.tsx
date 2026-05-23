import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PesoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Peso & Saúde</h1>
        <p className="text-muted-foreground">
          Registro de peso, medidas, exercícios e indicadores de saúde da família.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            Placeholder reservado no roadmap. Será desenvolvido após o MVP
            financeiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ideias iniciais: gráfico de evolução de peso, lembretes, integração
          com balança/smartwatch, metas de saúde compartilhadas.
        </CardContent>
      </Card>
    </div>
  );
}
