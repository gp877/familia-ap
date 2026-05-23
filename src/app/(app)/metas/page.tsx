import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function MetasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
        <p className="text-muted-foreground">
          Objetivos da família: financeiros, profissionais, pessoais.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            Placeholder reservado no roadmap. Será desenvolvido após o MVP.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ideias: definição de metas SMART, marcos intermediários, progresso
          visível em cards, integração com o módulo financeiro (ex: meta de
          economizar X% por mês).
        </CardContent>
      </Card>
    </div>
  );
}
