import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OutrosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outros</h1>
        <p className="text-muted-foreground">
          Espaço pra demandas familiares que ainda não têm módulo próprio.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em aberto</CardTitle>
          <CardDescription>
            Lugar pra anotações, lembretes, links úteis, contatos — tudo que a
            família quiser ter à mão sem precisar de um módulo dedicado.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Quando uma demanda nesse espaço crescer, vira módulo próprio na lateral.
        </CardContent>
      </Card>
    </div>
  );
}
