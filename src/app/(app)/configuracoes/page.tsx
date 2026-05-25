import { eq, sql } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { clearDemoData, seedDemoData } from "@/app/actions/mock";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Conta itens marcados como demo
  const demoTxCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.description} LIKE '%(demo)%'`
    )
    .then((r) => r[0]?.count ?? 0);

  return (
    <ScreenShell userQ="Quero ajustar as configurações">
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/" />
      </div>

      <SectionRow icon="home" label="Configurações" />

      <BigNumber value="Demo" sub="popular o sistema com dados de exemplo" />

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card pad={16} raised>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            Popular com dados de exemplo
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted-d)", lineHeight: 1.5, marginBottom: 12 }}>
            Cria contas, transações, compromissos, viagens, sonhos, itens de
            supermercado, exames, pesagens — tudo marcado com{" "}
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>(demo)</span> pra ser fácil de identificar e remover depois. Idempotente: se você já popular antes, não duplica.
          </p>
          <form action={seedDemoData}>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 12,
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              Popular agora
            </button>
          </form>
          {demoTxCount > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              Já tem {demoTxCount} transações de demo no banco.
            </div>
          )}
        </Card>

        {demoTxCount > 0 && (
          <Card pad={16}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              Limpar dados de exemplo
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted-d)", lineHeight: 1.5, marginBottom: 12 }}>
              Remove tudo que está marcado com (demo) — transações,
              compromissos, viagens, sonhos etc. Não mexe nos seus dados reais.
            </p>
            <form action={clearDemoData}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 12,
                  background: "transparent",
                  color: "var(--alert)",
                  border: "1px solid var(--alert)",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Limpar dados de exemplo
              </button>
            </form>
          </Card>
        )}
      </div>
    </ScreenShell>
  );
}
