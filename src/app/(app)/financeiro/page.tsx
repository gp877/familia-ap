import { eq, sql } from "drizzle-orm";
import { ArrowRight, FileText, List, Tag, Upload as UploadIcon } from "lucide-react";
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Módulo"
        title="Financeiro"
        description="Upload de extratos, categorização inteligente e visão completa dos gastos da família."
      />

      {/* Stats em destaque */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Transações"
          value={txCount.toLocaleString("pt-BR")}
          tone="primary"
        />
        <StatCard
          label="Pendentes de revisão"
          value={pendingCount.toLocaleString("pt-BR")}
          tone={pendingCount > 0 ? "warning" : "muted"}
        />
        <StatCard
          label="PDFs processados"
          value={uploadCount.toLocaleString("pt-BR")}
          tone="muted"
        />
      </div>

      {/* Ações */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          href="/financeiro/upload"
          icon={UploadIcon}
          title="Subir extrato ou fatura"
          description="Envie um PDF. A IA extrai todas as transações e tenta categorizar automaticamente baseado nas regras que você já criou."
          primary
        />
        <ActionCard
          href="/financeiro/transacoes"
          icon={List}
          title="Ver transações"
          description="Lista de tudo que foi extraído. Edite categorias, confirme ou ignore — cada ajuste vira regra automática pras próximas."
        />
        <ActionCard
          href="/financeiro/categorias"
          icon={Tag}
          title="Categorias"
          description="19 categorias iniciais já criadas. Veja quais estão sendo usadas e quantas transações cada uma tem."
        />
        <Card className="h-full border-dashed bg-muted/30">
          <CardHeader>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-5" />
            </div>
            <CardTitle className="mt-3 flex items-center gap-2 text-base">
              Dashboard com gráficos
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground/80">
                em breve
              </span>
            </CardTitle>
            <CardDescription>
              Gastos por mês, top categorias, comparação m-a-m, alertas de gasto
              alto. Próximo passo do módulo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "warning" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "from-primary/10 to-primary/5 text-primary"
      : tone === "warning"
        ? "from-warning/15 to-warning/5 text-warning-foreground"
        : "from-muted to-muted/40 text-foreground";
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${toneClass} p-5 shadow-card`}
    >
      <p className="text-xs font-medium uppercase tracking-wider opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  primary = false,
}: {
  href: string;
  icon: typeof UploadIcon;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <Card
        className={`h-full transition-all hover:-translate-y-0.5 hover:shadow-card-hover ${
          primary ? "border-primary/30 bg-gradient-brand-subtle" : ""
        }`}
      >
        <CardHeader>
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-lg ${
              primary
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Icon className="size-5" />
          </div>
          <CardTitle className="mt-3">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-sm font-medium text-primary">
            Abrir
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
