import { eq, sql } from "drizzle-orm";
import { ArrowRight, Upload as UploadIcon, List, Tag } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { transactions, uploads, users } from "@/db/schema";

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [txCount, uploadCount, pendingCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.householdId, dbUser.householdId))
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(eq(uploads.householdId, dbUser.householdId))
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} = 'pending'`
      )
      .then((r) => r[0]?.count ?? 0),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">
          Upload, categorização inteligente e visão dos gastos da família.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transações</CardDescription>
            <CardTitle className="text-2xl">{txCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendentes de revisão</CardDescription>
            <CardTitle className="text-2xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>PDFs processados</CardDescription>
            <CardTitle className="text-2xl">{uploadCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/financeiro/upload" className="block">
          <Card className="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UploadIcon className="size-5 text-primary" />
                <CardTitle>Subir extrato ou fatura</CardTitle>
              </div>
              <CardDescription>
                Envie um PDF. A IA extrai todas as transações e tenta categorizar
                automaticamente baseado nas regras que você já criou.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm font-medium text-primary">
                Ir pro upload <ArrowRight className="ml-1 size-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/financeiro/transacoes" className="block">
          <Card className="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <div className="flex items-center gap-2">
                <List className="size-5 text-primary" />
                <CardTitle>Ver transações</CardTitle>
              </div>
              <CardDescription>
                Lista de tudo que foi extraído. Edite categorias, confirme ou
                ignore transações. Toda categoria que você ajusta vira regra
                automática.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm font-medium text-primary">
                Ver lista <ArrowRight className="ml-1 size-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Em breve</CardTitle>
          </div>
          <CardDescription>
            Próximos passos planejados pra esse módulo: dashboard com gráficos
            mensais, comparação m-a-m por categoria, alertas de gastos altos,
            CRUD próprio de categorias.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
