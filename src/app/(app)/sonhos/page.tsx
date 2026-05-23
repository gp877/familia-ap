import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SonhosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sonhos</h1>
        <p className="text-muted-foreground">
          Lista de sonhos da família — viagens, casa, projetos de longo prazo.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            Placeholder reservado no roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ideias: cards visuais com imagens e descrição de cada sonho,
          estimativa de custo, prazo desejado, integração com o financeiro pra
          mostrar quanto falta poupar.
        </CardContent>
      </Card>
    </div>
  );
}
