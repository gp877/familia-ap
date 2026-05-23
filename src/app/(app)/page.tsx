import { eq, sql } from "drizzle-orm";
import { ArrowRight, MessageSquare, Wallet } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";

export default async function HomePage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  let txCount = 0;
  let pendingCount = 0;
  if (session?.user?.id) {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (dbUser?.householdId) {
      const [total, pending] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(eq(transactions.householdId, dbUser.householdId))
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(
            sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} = 'pending'`
          )
          .then((r) => r[0]?.count ?? 0),
      ]);
      txCount = total;
      pendingCount = pending;
    }
  }

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-brand-subtle p-6 sm:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 [background-image:radial-gradient(at_85%_15%,oklch(0.85_0.12_162/0.3)_0%,transparent_50%)]"
        />
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Bem-vindo de volta
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
          Olá{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          {txCount > 0
            ? `${txCount} transações registradas${pendingCount > 0 ? `, ${pendingCount} pendentes de revisão` : ""}.`
            : "Plataforma pronta. Comece subindo um extrato ou fatura no módulo Financeiro."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/financeiro"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95"
          >
            Ir pro Financeiro
            <ArrowRight className="size-4" />
          </Link>
          {pendingCount > 0 && (
            <Link
              href="/financeiro/transacoes?status=pending"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              Revisar pendentes ({pendingCount})
            </Link>
          )}
        </div>
      </div>

      {/* Módulos */}
      <section className="space-y-4">
        <PageHeader
          eyebrow="Módulos"
          title="O que tem na plataforma"
          description="Comece pelo financeiro. O resto vem por aí, na ordem que faz sentido pra família."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/financeiro" className="group">
            <Card className="h-full overflow-hidden transition-all hover:shadow-card-hover">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wallet className="size-5" />
                </div>
                <CardTitle className="mt-3">Gestão Financeira</CardTitle>
                <CardDescription>
                  Upload de extratos e faturas, categorização inteligente,
                  dashboard de gastos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 text-sm font-medium text-primary">
                  Abrir módulo
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="h-full bg-muted/30">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <MessageSquare className="size-5" />
              </div>
              <CardTitle className="mt-3 flex items-center gap-2">
                Chat IA da Família
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground/80">
                  em breve
                </span>
              </CardTitle>
              <CardDescription>
                Agente com memória da família, acesso aos dados financeiros,
                conversas naturais. Será construído após estabilização do
                financeiro.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <PlaceholderCard title="Peso & Saúde" />
          <PlaceholderCard title="Metas" />
          <PlaceholderCard title="Sonhos" />
          <PlaceholderCard title="Outros" />
        </div>
      </section>
    </div>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning-foreground/70">
          em breve
        </span>
      </div>
    </div>
  );
}
