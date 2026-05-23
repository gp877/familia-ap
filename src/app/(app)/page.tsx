import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function HomePage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-muted-foreground">
          Bem-vindo à plataforma Família AP. A base está pronta — os módulos
          serão construídos a partir daqui.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Gestão Financeira</CardTitle>
            <CardDescription>
              Upload de extratos, categorização inteligente, dashboard de gastos.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Em desenvolvimento — primeiro módulo do MVP.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat IA da Família</CardTitle>
            <CardDescription>
              Agente com memória, acesso aos dados financeiros, conversas naturais.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próxima fase, após estabilização do módulo financeiro.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peso, Metas, Sonhos</CardTitle>
            <CardDescription>
              Módulos futuros — placeholders já criados na lateral.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Backlog. Desenvolvidos depois que o financeiro estiver maduro.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
