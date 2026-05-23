import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">
          Upload de extratos, categorização inteligente e visão dos gastos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Em desenvolvimento</CardTitle>
          <CardDescription>
            O fluxo de upload → extração → categorização será implementado nas
            próximas sessões. A base (auth, banco de dados, schema) já está
            pronta — agora é construir as telas e a integração com o Gemini
            para ler os PDFs.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Próximos passos planejados:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Tela de upload de PDF (extrato ou fatura)</li>
            <li>Extração de transações via Gemini</li>
            <li>Categorização automática (regras + IA)</li>
            <li>Lista filtrável de transações</li>
            <li>Dashboard com gráficos por mês/categoria</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
