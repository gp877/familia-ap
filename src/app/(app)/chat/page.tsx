import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat IA da Família</h1>
        <p className="text-muted-foreground">
          Converse com um agente de IA que conhece o contexto financeiro e
          pessoal da família.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            Será construído após estabilização do módulo financeiro, pois o chat
            consulta esses dados.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          O agente terá memória persistente da família (fatos relevantes,
          preferências, metas) e capacidade de responder perguntas sobre os
          gastos.
        </CardContent>
      </Card>
    </div>
  );
}
