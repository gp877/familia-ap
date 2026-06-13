import { and, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import Link from "next/link";

import { Card, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, invoices, transactions, uploads, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBRLCompact(n: number) {
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type SearchParams = Promise<{ year?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;
  const hh = dbUser.householdId;

  const now = new Date();
  const currentYear = now.getFullYear();

  // Range de anos com dados (1 query barata)
  const [yearRange] = await db
    .select({
      min: sql<string | null>`to_char(min(${transactions.occurredOn}), 'YYYY')`,
      max: sql<string | null>`to_char(max(${transactions.occurredOn}), 'YYYY')`,
    })
    .from(transactions)
    .where(eq(transactions.householdId, hh));
  const minYear = yearRange?.min ? parseInt(yearRange.min, 10) : currentYear;
  const maxYear = Math.max(currentYear, yearRange?.max ? parseInt(yearRange.max, 10) : currentYear);
  const yearRaw = sp.year ? parseInt(sp.year, 10) : currentYear;
  const year = isNaN(yearRaw) ? currentYear : Math.min(Math.max(yearRaw, minYear), maxYear);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Base comum: tx REAIS (não-internas, não-ignoradas) do ano.
  // Sem dupla contagem: o pagamento da fatura no extrato é interno (excluído),
  // as compras DENTRO da fatura são as despesas reais (incluídas).
  const realTxWhere = and(
    eq(transactions.householdId, hh),
    gte(transactions.occurredOn, yearStart),
    lte(transactions.occurredOn, yearEnd),
    eq(transactions.isInternalTransfer, false),
    ne(transactions.status, "ignored")
  );

  const [monthlyRows, categoryRows, allCategories, invoiceRows] = await Promise.all([
    // Receita/despesa por mês
    db
      .select({
        month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
        credit: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'credit'), 0)::text`,
        debit: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit'), 0)::text`,
      })
      .from(transactions)
      .where(realTxWhere)
      .groupBy(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`),
    // Despesa por categoria (ano inteiro)
    db
      .select({
        categoryId: transactions.categoryId,
        total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      })
      .from(transactions)
      .where(and(realTxWhere, eq(transactions.kind, "debit")))
      .groupBy(transactions.categoryId),
    db.query.categories.findMany({ where: eq(categories.householdId, hh) }),
    // Faturas do ano (competência) — total da fatura por mês
    db
      .select({
        refMonth: invoices.referenceMonth,
        total: sql<string>`coalesce(sum(coalesce(${invoices.totalAmount}::numeric, 0)), 0)::text`,
      })
      .from(invoices)
      .where(and(eq(invoices.householdId, hh), sql`${invoices.referenceMonth} like ${year + "-%"}`))
      .groupBy(invoices.referenceMonth),
  ]);

  // Saldo final em conta (extraído do PDF do extrato). refMonth do upload =
  // mês da primeira movimentação dele (mesma convenção de /documentos).
  // Soma os saldos quando há mais de uma conta no mesmo mês.
  const balanceRows = await db
    .select({
      closing: uploads.closingBalance,
      refMonth: sql<string | null>`(select to_char(min(t.occurred_on), 'YYYY-MM') from transaction t where t.upload_id = ${uploads.id})`,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.householdId, hh),
        eq(uploads.sourceType, "bank_statement"),
        isNotNull(uploads.closingBalance)
      )
    );

  // ── Série mensal ────────────────────────────────────────────────
  const byMonth = new Map(monthlyRows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const row = byMonth.get(ym);
    const credit = row ? parseFloat(row.credit) : 0;
    const debit = row ? parseFloat(row.debit) : 0;
    return { i, ym, credit, debit, net: credit - debit, hasData: !!row };
  });
  const monthsWithData = months.filter((m) => m.hasData);

  // Acumulado do ano (só até o último mês com dados)
  let acc = 0;
  const cumulative = months.map((m) => {
    acc += m.net;
    return { ...m, cum: acc };
  });
  const lastDataIdx = months.reduce((last, m) => (m.hasData ? m.i : last), -1);

  // ── Categorias (rollup pra categoria-mãe) ───────────────────────
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const parentTotals = new Map<string, number>();
  let uncategorized = 0;
  for (const r of categoryRows) {
    const v = parseFloat(r.total);
    if (!r.categoryId) {
      uncategorized += v;
      continue;
    }
    const cat = catById.get(r.categoryId);
    if (!cat) {
      uncategorized += v;
      continue;
    }
    const rootId = cat.parentId ?? cat.id;
    parentTotals.set(rootId, (parentTotals.get(rootId) ?? 0) + v);
  }
  const totalDespesas = months.reduce((s, m) => s + m.debit, 0);
  const totalReceitas = months.reduce((s, m) => s + m.credit, 0);
  const catList = [...parentTotals.entries()]
    .map(([id, total]) => {
      const cat = catById.get(id);
      return {
        id,
        name: cat?.name ?? "?",
        color: cat?.color ?? "#FF8B66",
        total,
        share: totalDespesas > 0 ? total / totalDespesas : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  if (uncategorized > 0.005) {
    catList.push({
      id: "_none",
      name: "Sem categoria",
      color: "#7A7A7A",
      total: uncategorized,
      share: totalDespesas > 0 ? uncategorized / totalDespesas : 0,
    });
    catList.sort((a, b) => b.total - a.total);
  }
  const topCats = catList.slice(0, 10);

  // ── Faturas por mês ─────────────────────────────────────────────
  const invoiceByMonth = new Map(invoiceRows.map((r) => [r.refMonth, parseFloat(r.total)]));
  const invoiceSeries = months.map((m) => ({
    ...m,
    fatura: invoiceByMonth.get(m.ym) ?? 0,
  }));
  const hasInvoices = invoiceSeries.some((m) => m.fatura > 0);

  // Saldo por mês do ano selecionado (soma das contas)
  const balanceByMonth = new Map<string, number>();
  for (const r of balanceRows) {
    if (!r.refMonth || !r.refMonth.startsWith(`${year}-`) || !r.closing) continue;
    balanceByMonth.set(r.refMonth, (balanceByMonth.get(r.refMonth) ?? 0) + parseFloat(r.closing));
  }
  const balanceSeries = months
    .filter((m) => balanceByMonth.has(m.ym))
    .map((m) => ({ i: m.i, value: balanceByMonth.get(m.ym)! }));

  // KPIs
  const resultado = totalReceitas - totalDespesas;
  const mediaDespesas = monthsWithData.length > 0 ? totalDespesas / monthsWithData.length : 0;

  return (
    <ScreenShell
      userQ={`Como estão nossas finanças em ${year}?`}
      insight={
        monthsWithData.length === 0 ? (
          <>Sem dados em {year}. Suba extratos e faturas pra alimentar o dashboard.</>
        ) : (
          <>
            {resultado >= 0 ? "Sobrou" : "Faltou"} <b>R$ {formatBRL(Math.abs(resultado))}</b> em{" "}
            {monthsWithData.length} {monthsWithData.length === 1 ? "mês" : "meses"} de {year}.
            Média de despesas: <b>R$ {formatBRL(mediaDespesas)}</b>/mês.
          </>
        )
      }
    >
      <SectionRow icon="chart" label="Dashboard" action={`${monthsWithData.length} meses com dados`} />

      {/* Seletor de ano */}
      <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <YearNav targetYear={year - 1} disabled={year - 1 < minYear} dir="prev" />
        <span className="ap-num" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
          {year}
        </span>
        <YearNav targetYear={year + 1} disabled={year + 1 > maxYear} dir="next" />
      </div>

      {/* KPIs */}
      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        <Kpi label="receitas no ano" value={`R$ ${formatBRL(totalReceitas)}`} color="var(--ok)" />
        <Kpi label="despesas no ano" value={`R$ ${formatBRL(totalDespesas)}`} color="var(--alert)" />
        <Kpi
          label="resultado"
          value={`${resultado >= 0 ? "+" : "−"}R$ ${formatBRL(Math.abs(resultado))}`}
          color={resultado >= 0 ? "var(--ok)" : "var(--alert)"}
        />
        <Kpi label="média de despesas/mês" value={`R$ ${formatBRL(mediaDespesas)}`} color="var(--ink-d)" />
      </div>

      {/* Receitas × Despesas por mês */}
      <SectionRow icon="chart" label="Receitas × despesas por mês" />
      <div style={{ padding: "0 20px" }}>
        <Card pad={16}>
          <DualBars months={months} />
          <Legend
            items={[
              { color: "var(--ok)", label: "receitas" },
              { color: "var(--alert)", label: "despesas" },
            ]}
          />
        </Card>
      </div>

      {/* Resultado acumulado */}
      <SectionRow icon="chart" label="Resultado acumulado no ano" />
      <div style={{ padding: "0 20px" }}>
        <Card pad={16}>
          <CumulativeLine data={cumulative} lastIdx={lastDataIdx} />
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8 }}>
            Soma de (receitas − despesas) mês a mês. Mostra a direção do ano: subindo = sobrando,
            descendo = gastando mais do que entra.
          </div>
        </Card>
      </div>

      {/* Despesas por categoria */}
      <SectionRow icon="star" label={`Despesas por categoria · ${year}`} />
      <div style={{ padding: "0 20px" }}>
        <Card pad={16}>
          {topCats.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: 12 }}>
              Sem despesas categorizadas ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {topCats.map((c) => {
                const drillId = c.id === "_none" ? "none" : c.id;
                return (
                <Link
                  key={c.id}
                  href={`/financeiro/categoria/${drillId}?year=${year}`}
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: c.color,
                        flexShrink: 0,
                        alignSelf: "center",
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-d)", flex: 1 }}>
                      {c.name} <span style={{ color: "var(--muted)" }}>›</span>
                    </span>
                    <span className="ap-num" style={{ fontSize: 12, fontWeight: 700 }}>
                      R$ {formatBRL(c.total)}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", width: 38, textAlign: "right" }}>
                      {(c.share * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: "color-mix(in oklab, var(--muted) 12%, transparent)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(2, (c.total / topCats[0].total) * 100)}%`,
                        borderRadius: 3,
                        background: c.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </Link>
                );
              })}
            </div>
          )}
          {catList.length > topCats.length && (
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>
              +{catList.length - topCats.length} categorias menores — detalhe completo no{" "}
              <Link href={`/financeiro/dre?year=${year}`} style={{ color: "var(--accent)" }}>
                DRE
              </Link>
              .
            </div>
          )}
        </Card>
      </div>

      {/* Saldo em conta no fim do mês — extraído do PDF do extrato */}
      {balanceSeries.length > 0 && (
        <>
          <SectionRow icon="bank" label="Saldo em conta ao fim de cada extrato" />
          <div style={{ padding: "0 20px" }}>
            <Card pad={16}>
              <BalanceLine months={balanceSeries} />
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8 }}>
                Saldo final escrito no PDF de cada extrato (soma das contas quando há mais de
                uma). Extratos antigos não têm o dado — aparece a partir dos uploads novos.
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Fatura do cartão por mês */}
      {hasInvoices && (
        <>
          <SectionRow icon="bank" label="Fatura do cartão por competência" />
          <div style={{ padding: "0 20px 20px" }}>
            <Card pad={16}>
              <SingleBars
                months={invoiceSeries.map((m) => ({ i: m.i, value: m.fatura, hasData: m.fatura > 0 }))}
                color="var(--accent)"
              />
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8 }}>
                Total da fatura no mês das COMPRAS (competência). Meses muito acima da média merecem
                uma olhada na tela da fatura.
              </div>
            </Card>
          </div>
        </>
      )}
    </ScreenShell>
  );
}

/* ════════════════════════ componentes ════════════════════════ */

function YearNav({ targetYear, disabled, dir }: { targetYear: number; disabled: boolean; dir: "prev" | "next" }) {
  const style: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "var(--card)",
    border: "0.5px solid var(--line-d)",
    color: disabled ? "var(--line-d)" : "var(--muted-d)",
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    pointerEvents: disabled ? "none" : undefined,
  };
  const glyph = dir === "prev" ? "‹" : "›";
  if (disabled) return <span style={style}>{glyph}</span>;
  return (
    <Link href={`/financeiro/dashboard?year=${targetYear}`} style={style}>
      {glyph}
    </Link>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card pad={12}>
      <div className="ap-eyebrow" style={{ fontSize: 9.5 }}>
        {label}
      </div>
      <div className="ap-num" style={{ fontSize: 16, fontWeight: 800, color, marginTop: 4 }}>
        {value}
      </div>
    </Card>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 10, justifyContent: "center" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--muted-d)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Barras duplas (receitas × despesas) — SVG puro, responsivo via viewBox. */
function DualBars({ months }: { months: Array<{ i: number; credit: number; debit: number; hasData: boolean }> }) {
  const W = 480;
  const H = 170;
  const PAD_B = 18;
  const PAD_T = 14;
  const chartH = H - PAD_B - PAD_T;
  const max = Math.max(...months.map((m) => Math.max(m.credit, m.debit)), 1);
  const slot = W / 12;
  const barW = slot * 0.26;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {months.map((m) => {
        const x = m.i * slot;
        const hC = (m.credit / max) * chartH;
        const hD = (m.debit / max) * chartH;
        return (
          <g key={m.i}>
            {m.hasData && (
              <>
                <rect
                  x={x + slot / 2 - barW - 1.5}
                  y={PAD_T + chartH - hC}
                  width={barW}
                  height={Math.max(hC, 1)}
                  rx={2}
                  fill="var(--ok)"
                  opacity={0.9}
                >
                  <title>{`${MONTH_SHORT[m.i]}: +R$ ${formatBRL(m.credit)}`}</title>
                </rect>
                <rect
                  x={x + slot / 2 + 1.5}
                  y={PAD_T + chartH - hD}
                  width={barW}
                  height={Math.max(hD, 1)}
                  rx={2}
                  fill="var(--alert)"
                  opacity={0.9}
                >
                  <title>{`${MONTH_SHORT[m.i]}: −R$ ${formatBRL(m.debit)}`}</title>
                </rect>
                {/* valor da despesa em cima da barra (compacto) */}
                <text
                  x={x + slot / 2}
                  y={PAD_T + chartH - Math.max(hC, hD) - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="var(--muted)"
                  className="ap-num"
                >
                  {formatBRLCompact(Math.max(m.credit, m.debit))}
                </text>
              </>
            )}
            <text
              x={x + slot / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              fill={m.hasData ? "var(--muted-d)" : "var(--line-d)"}
            >
              {MONTH_SHORT[m.i]}
            </text>
          </g>
        );
      })}
      <line x1={0} y1={PAD_T + chartH} x2={W} y2={PAD_T + chartH} stroke="var(--line-d)" strokeWidth={0.5} />
    </svg>
  );
}

/** Linha do resultado acumulado, com área sombreada e zero-line. */
function CumulativeLine({
  data,
  lastIdx,
}: {
  data: Array<{ i: number; cum: number; hasData: boolean }>;
  lastIdx: number;
}) {
  const W = 480;
  const H = 150;
  const PAD_B = 18;
  const PAD_T = 12;
  const chartH = H - PAD_B - PAD_T;
  const visible = data.filter((d) => d.i <= lastIdx);
  const vals = visible.map((d) => d.cum);
  const maxV = Math.max(...vals, 0, 1);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const slot = W / 12;
  const yOf = (v: number) => PAD_T + chartH - ((v - minV) / range) * chartH;
  const xOf = (i: number) => i * slot + slot / 2;

  const pts = visible.map((d) => `${xOf(d.i)},${yOf(d.cum)}`).join(" ");
  const zeroY = yOf(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* linha do zero */}
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--line-d)" strokeWidth={0.5} strokeDasharray="3 3" />
      {visible.length > 1 && (
        <polygon
          points={`${xOf(visible[0].i)},${zeroY} ${pts} ${xOf(visible[visible.length - 1].i)},${zeroY}`}
          fill="var(--accent)"
          opacity={0.1}
        />
      )}
      {visible.length > 0 && (
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {visible.map((d) => (
        <circle key={d.i} cx={xOf(d.i)} cy={yOf(d.cum)} r={3} fill="var(--accent)">
          <title>{`${MONTH_SHORT[d.i]}: ${d.cum >= 0 ? "+" : "−"}R$ ${formatBRL(Math.abs(d.cum))} acumulado`}</title>
        </circle>
      ))}
      {data.map((d) => (
        <text
          key={d.i}
          x={xOf(d.i)}
          y={H - 4}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={700}
          fill={d.i <= lastIdx ? "var(--muted-d)" : "var(--line-d)"}
        >
          {MONTH_SHORT[d.i]}
        </text>
      ))}
    </svg>
  );
}

/** Linha do saldo em conta — pontos esparsos (só meses com extrato salvo),
 * suporta saldo negativo (zero-line tracejada). */
function BalanceLine({ months }: { months: Array<{ i: number; value: number }> }) {
  const W = 480;
  const H = 150;
  const PAD_B = 18;
  const PAD_T = 16;
  const chartH = H - PAD_B - PAD_T;
  const vals = months.map((m) => m.value);
  const maxV = Math.max(...vals, 0, 1);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const slot = W / 12;
  const yOf = (v: number) => PAD_T + chartH - ((v - minV) / range) * chartH;
  const xOf = (i: number) => i * slot + slot / 2;
  const zeroY = yOf(0);
  const pts = months.map((m) => `${xOf(m.i)},${yOf(m.value)}`).join(" ");
  const present = new Set(months.map((m) => m.i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--line-d)" strokeWidth={0.5} strokeDasharray="3 3" />
      {months.length > 1 && (
        <polyline points={pts} fill="none" stroke="var(--ok)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {months.map((m) => (
        <g key={m.i}>
          <circle cx={xOf(m.i)} cy={yOf(m.value)} r={3.5} fill={m.value >= 0 ? "var(--ok)" : "var(--alert)"}>
            <title>{`${MONTH_SHORT[m.i]}: R$ ${formatBRL(m.value)}`}</title>
          </circle>
          <text
            x={xOf(m.i)}
            y={yOf(m.value) - 7}
            textAnchor="middle"
            fontSize={7.5}
            fontWeight={700}
            fill="var(--muted-d)"
            className="ap-num"
          >
            {formatBRLCompact(m.value)}
          </text>
        </g>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <text
          key={i}
          x={xOf(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={700}
          fill={present.has(i) ? "var(--muted-d)" : "var(--line-d)"}
        >
          {MONTH_SHORT[i]}
        </text>
      ))}
    </svg>
  );
}

/** Barras simples (uma série) — usada pra fatura por mês. */
function SingleBars({
  months,
  color,
}: {
  months: Array<{ i: number; value: number; hasData: boolean }>;
  color: string;
}) {
  const W = 480;
  const H = 150;
  const PAD_B = 18;
  const PAD_T = 14;
  const chartH = H - PAD_B - PAD_T;
  const max = Math.max(...months.map((m) => m.value), 1);
  const slot = W / 12;
  const barW = slot * 0.45;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {months.map((m) => {
        const x = m.i * slot;
        const h = (m.value / max) * chartH;
        return (
          <g key={m.i}>
            {m.hasData && (
              <>
                <rect
                  x={x + slot / 2 - barW / 2}
                  y={PAD_T + chartH - h}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={2.5}
                  fill={color}
                  opacity={0.85}
                >
                  <title>{`${MONTH_SHORT[m.i]}: R$ ${formatBRL(m.value)}`}</title>
                </rect>
                <text
                  x={x + slot / 2}
                  y={PAD_T + chartH - h - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="var(--muted)"
                  className="ap-num"
                >
                  {formatBRLCompact(m.value)}
                </text>
              </>
            )}
            <text
              x={x + slot / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              fill={m.hasData ? "var(--muted-d)" : "var(--line-d)"}
            >
              {MONTH_SHORT[m.i]}
            </text>
          </g>
        );
      })}
      <line x1={0} y1={PAD_T + chartH} x2={W} y2={PAD_T + chartH} stroke="var(--line-d)" strokeWidth={0.5} />
    </svg>
  );
}
