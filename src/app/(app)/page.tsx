import { eq, sql } from "drizzle-orm";
import { ArrowRight, MessageSquare, Wallet } from "lucide-react";
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
import { transactions, users } from "@/db/schema";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

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
    <div className="space-y-12">
      {/* Hero conversacional */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-brand-soft p-8 shadow-warm sm:p-12">
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-30" />
        <div
          aria-hidden
          className="absolute -right-12 -top-12 -z-10 h-64 w-64 rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.85 0.12 35 / 0.5) 0%, transparent 70%)",
          }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
          {greeting()}
        </p>
        <h1 className="mt-2 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          {firstName ? (
            <>
              Olá, <span className="italic text-gradient-brand">{firstName}</span>
            </>
          ) : (
            <>
              Bem-vindo de <span className="italic text-gradient-brand">volta</span>
            </>
          )}
        </h1>
        <p className="mt-4 max-w-xl text-base text-foreground/70 sm:text-lg">
          {txCount > 0 ? (
            <>
              <strong className="text-foreground">{txCount}</strong>{" "}
              {txCount === 1 ? "transação registrada" : "transações registradas"}
              {pendingCount > 0 ? (
                <>
                  {" — "}
                  <strong className="text-foreground">{pendingCount}</strong>{" "}
                  pendente{pendingCount === 1 ? "" : "s"} de revisão.
                </>
              ) : (
                "."
              )}
            </>
          ) : (
            "Tudo pronto. Comece subindo um extrato ou fatura — a IA cuida da parte chata pra vocês."
          )}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/financeiro"
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background shadow-warm-sm transition-all hover:gap-3 hover:bg-foreground/90"
          >
            Ir pro financeiro
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {pendingCount > 0 && (
            <Link
              href="/financeiro/transacoes?status=pending"
              className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-card/70 px-6 py-3 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-card"
            >
              Revisar pendentes
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                {pendingCount}
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* Módulos */}
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Módulos
          </p>
          <h2 className="mt-1 font-display text-3xl">O que tem por aqui</h2>
          <p className="mt-1 max-w-xl text-muted-foreground">
            Comecem pelo financeiro. O resto vem por aí, na ordem que fizer
            sentido pra vocês.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/financeiro" className="group">
            <Card className="h-full overflow-hidden border-border/60 transition-all hover:-translate-y-1 hover:shadow-warm-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-warm-sm">
                  <Wallet className="size-5" />
                </div>
                <CardTitle className="mt-4 font-display text-2xl">
                  Gestão financeira
                </CardTitle>
                <CardDescription className="text-sm">
                  Upload de extratos e faturas, categorização inteligente,
                  dashboard de gastos. A IA aprende com cada ajuste que vocês fazem.
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

          <Card className="h-full bg-muted/40">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <MessageSquare className="size-5" />
              </div>
              <CardTitle className="mt-4 flex items-center gap-2 font-display text-2xl">
                Chat com a IA
                <span className="sticker">em breve</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Conversa natural com um agente que conhece o contexto financeiro e
                pessoal da família. Memória persistente, perguntas sobre os gastos.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            { title: "Peso & Saúde", href: "/peso" },
            { title: "Metas", href: "/metas" },
            { title: "Sonhos", href: "/sonhos" },
            { title: "Outros", href: "/outros" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="block">
              <div className="rounded-2xl border border-dashed border-border bg-card/30 p-4 transition-colors hover:border-primary/40 hover:bg-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="sticker">em breve</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
