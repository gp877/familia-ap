import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { SectionRow } from "@/components/ap/atoms";
import { BackButton, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createInvoice } from "@/app/actions/invoices";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, invoices, transactions, uploads, users } from "@/db/schema";

import { StaleUploadBanner } from "../_components/stale-upload-banner";
import { InvoiceActions, StatementActions } from "../_components/upload-actions";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthName(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
}

function monthShort(m: number): string {
  return new Date(2000, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
}

function formatDayMonth(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d.slice(0, 10) + "T12:00:00") : d;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

type SearchParams = Promise<{ year?: string }>;

type ExtratoEntry = {
  upload: typeof uploads.$inferSelect;
  refMonth: string;
  count: number;
  debit: number;
  credit: number;
  minDate: string | null;
  maxDate: string | null;
};

type InvoiceEntry = typeof invoices.$inferSelect & {
  bankAccount: typeof bankAccounts.$inferSelect | null;
};

export default async function DocumentosPage({
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

  const [allAccounts, statementUploads, invoiceUploads, aggByUpload, allInvoices, aggByInvoice] =
    await Promise.all([
      db.query.bankAccounts.findMany({
        where: eq(bankAccounts.householdId, hh),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
      db.query.uploads.findMany({
        where: and(eq(uploads.householdId, hh), eq(uploads.sourceType, "bank_statement")),
        orderBy: [desc(uploads.createdAt)],
      }),
      db.query.uploads.findMany({
        where: and(eq(uploads.householdId, hh), eq(uploads.sourceType, "credit_card_invoice")),
        orderBy: [desc(uploads.createdAt)],
      }),
      db
        .select({
          uploadId: transactions.uploadId,
          count: sql<number>`count(*)::int`,
          debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          minDate: sql<string>`min(${transactions.occurredOn})::text`,
          maxDate: sql<string>`max(${transactions.occurredOn})::text`,
        })
        .from(transactions)
        .where(eq(transactions.householdId, hh))
        .groupBy(transactions.uploadId),
      db.query.invoices.findMany({
        where: eq(invoices.householdId, hh),
        with: { bankAccount: true },
        orderBy: [desc(invoices.referenceMonth)],
      }),
      db
        .select({
          invoiceId: transactions.invoiceId,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit' and ${transactions.isInternalTransfer} = false), 0)::text`,
        })
        .from(transactions)
        .where(eq(transactions.householdId, hh))
        .groupBy(transactions.invoiceId),
    ]);

  const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
  const creditCards = allAccounts.filter((a) => a.type === "credit_card");

  const aggUploadMap = new Map(
    aggByUpload.filter((r) => r.uploadId).map((r) => [r.uploadId as string, r])
  );
  const aggInvoiceMap = new Map(
    aggByInvoice.filter((r) => r.invoiceId).map((r) => [r.invoiceId as string, r])
  );

  // PDF da fatura: primeiro upload vinculado com blob válido
  const uploadByInvoiceId = new Map<string, string | null>();
  for (const u of invoiceUploads) {
    if (u.invoiceId && !uploadByInvoiceId.has(u.invoiceId)) {
      uploadByInvoiceId.set(u.invoiceId, u.blobUrl);
    }
  }

  // ── Extratos enriquecidos, agrupados por mês de referência ──────
  const extratoEntries: ExtratoEntry[] = statementUploads.map((u) => {
    const agg = aggUploadMap.get(u.id);
    return {
      upload: u,
      refMonth: agg?.minDate?.slice(0, 7) ?? new Date(u.createdAt).toISOString().slice(0, 7),
      count: agg?.count ?? 0,
      debit: agg ? parseFloat(agg.debit) : 0,
      credit: agg ? parseFloat(agg.credit) : 0,
      minDate: agg?.minDate ?? null,
      maxDate: agg?.maxDate ?? null,
    };
  });

  const extratosByMonth = new Map<string, ExtratoEntry[]>();
  for (const e of extratoEntries) {
    const arr = extratosByMonth.get(e.refMonth) ?? [];
    arr.push(e);
    extratosByMonth.set(e.refMonth, arr);
  }
  const invoicesByMonth = new Map<string, InvoiceEntry[]>();
  for (const inv of allInvoices) {
    const arr = invoicesByMonth.get(inv.referenceMonth) ?? [];
    arr.push(inv);
    invoicesByMonth.set(inv.referenceMonth, arr);
  }

  // ── Janela de controle e anos disponíveis ───────────────────────
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const allMonthsWithData = [...extratosByMonth.keys(), ...invoicesByMonth.keys()];
  const firstTracked = allMonthsWithData.length > 0 ? allMonthsWithData.sort()[0] : currentMonth;

  const minYear = parseInt(firstTracked.slice(0, 4), 10);
  const maxYear = now.getFullYear();
  const yearRaw = sp.year ? parseInt(sp.year, 10) : maxYear;
  const year = isNaN(yearRaw) ? maxYear : Math.min(Math.max(yearRaw, minYear), maxYear);

  type MonthState = "complete" | "partial" | "current" | "future" | "pre";
  type MonthInfo = {
    ym: string;
    m: number;
    state: MonthState;
    extratos: ExtratoEntry[];
    faturas: InvoiceEntry[];
  };

  const months: MonthInfo[] = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    const ext = extratosByMonth.get(ym) ?? [];
    const fat = invoicesByMonth.get(ym) ?? [];
    let state: MonthState;
    if (ym === currentMonth) state = "current";
    else if (ym > currentMonth) state = "future";
    else if (ym < firstTracked && ext.length === 0 && fat.length === 0) state = "pre";
    else state = ext.length > 0 && fat.length > 0 ? "complete" : "partial";
    months.push({ ym, m, state, extratos: ext, faturas: fat });
  }

  const trackedMonths = months.filter((x) => x.state !== "future" && x.state !== "pre");
  const completeCount = months.filter((x) => x.state === "complete").length;
  const totalDocs = months.reduce((s, x) => s + x.extratos.length + x.faturas.length, 0);

  // Renderização: meses com conteúdo/janela em ordem decrescente;
  // futuros e pré-controle colapsados em uma linha cada.
  const visibleMonths = [...trackedMonths].reverse();
  const futureMonths = months.filter((x) => x.state === "future");
  const preMonths = months.filter((x) => x.state === "pre");

  const staleOf = (list: (typeof uploads.$inferSelect)[]) =>
    list
      .filter((u) => {
        const ageMin = (Date.now() - new Date(u.createdAt).getTime()) / 60000;
        return (u.status === "processing" && ageMin > 5) || u.status === "failed";
      })
      .map((u) => ({
        id: u.id,
        filename: u.filename,
        status: u.status,
        createdAt: new Date(u.createdAt).toISOString(),
        ageMinutes: Math.round((Date.now() - new Date(u.createdAt).getTime()) / 60000),
        invoiceId: u.invoiceId,
      }));

  return (
    <ScreenShell
      insight={
        totalDocs === 0 ? (
          <>Nenhum documento ainda. Suba o primeiro extrato ou fatura — a IA extrai tudo.</>
        ) : (
          <>
            <b>{completeCount}</b> de <b>{trackedMonths.length}</b>{" "}
            {trackedMonths.length === 1 ? "mês completo" : "meses completos"} em {year}.
            Verde = extrato + fatura lançados.
          </>
        )
      }
    >
      {/* hovers e responsividade — inline styles não cobrem :hover/media */}
      <style>{`
        .doc-card { transition: border-color .12s, transform .1s; }
        .doc-card:hover { border-color: var(--accent) !important; transform: translateY(-1px); }
        .heat-cell { transition: transform .1s; }
        .heat-cell:hover { transform: translateY(-2px); }
        @keyframes doc-pulse { 50% { opacity: 0.35; } }
        .doc-cols { display: grid; grid-template-columns: 1fr 1fr; }
        .doc-cols > div + div { border-left: 0.5px solid var(--line); }
        @media (max-width: 700px) {
          .doc-cols { grid-template-columns: 1fr; }
          .doc-cols > div + div { border-left: none; border-top: 0.5px solid var(--line); }
          .doc-heat { grid-template-columns: repeat(6, 1fr) !important; }
        }
      `}</style>

      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow
        icon="bank"
        label="Documentos do mês — extratos & faturas"
        action={`${totalDocs} em ${year}`}
      />

      <StaleUploadBanner uploadKind="statement" uploads={staleOf(statementUploads)} />
      <StaleUploadBanner uploadKind="invoice" uploads={staleOf(invoiceUploads)} />

      {/* ── Seletor de ano ───────────────────────────────────────── */}
      <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <YearNav targetYear={year - 1} disabled={year - 1 < minYear} dir="prev" />
        <span className="ap-num" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", padding: "0 4px" }}>
          {year}
        </span>
        <YearNav targetYear={year + 1} disabled={year + 1 > maxYear} dir="next" />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted-d)" }}>
          <b style={{ color: "var(--ok)" }}>{completeCount} de {trackedMonths.length}</b>{" "}
          meses completos
        </span>
      </div>

      {/* ── Heatmap do ano ───────────────────────────────────────── */}
      <div
        className="doc-heat"
        style={{
          margin: "12px 20px 4px",
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 6,
        }}
      >
        {months.map((info) => {
          const tone =
            info.state === "complete"
              ? "var(--ok)"
              : info.state === "partial"
                ? "var(--alert)"
                : info.state === "current"
                  ? "var(--accent)"
                  : "var(--line-d)";
          const dimmed = info.state === "future" || info.state === "pre";
          const cell = (
            <span
              style={{
                display: "block",
                textAlign: "center",
                padding: "8px 2px 7px",
                borderRadius: 10,
                border: `0.5px solid ${dimmed ? "var(--line-d)" : `color-mix(in oklab, ${tone} 45%, var(--line-d))`}`,
                background: "var(--card)",
                opacity: dimmed ? 0.38 : 1,
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: info.state === "current" ? "var(--accent)" : "var(--muted)",
                }}
              >
                {monthShort(info.m)}
              </span>
              <span
                style={{
                  display: "block",
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  margin: "5px auto 0",
                  background: dimmed ? "var(--line-d)" : tone,
                  animation: info.state === "current" ? "doc-pulse 1.6s infinite" : undefined,
                }}
              />
            </span>
          );
          return dimmed ? (
            <span key={info.ym}>{cell}</span>
          ) : (
            <a key={info.ym} href={`#m-${info.ym}`} className="heat-cell" style={{ textDecoration: "none" }}>
              {cell}
            </a>
          );
        })}
      </div>

      {/* ── Uploads ──────────────────────────────────────────────── */}
      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <Link href="/financeiro/upload" style={uploadBtnStyle}>
          <span>Subir extrato</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>↗</span>
        </Link>
        <Link href="/financeiro/faturas/upload" style={uploadBtnStyle}>
          <span>Subir fatura</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>↗</span>
        </Link>
      </div>

      {/* Cadastro manual de fatura — caminho manual sempre disponível */}
      <div style={{ padding: "10px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar fatura manualmente">
          <form action={createInvoice}>
            <FormField label="Cartão *">
              <select name="bankAccountId" required style={fieldStyle}>
                <option value="">Selecione...</option>
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Mês de competência *">
              <input
                type="month"
                name="referenceMonth"
                required
                defaultValue={currentMonth}
                style={fieldStyle}
              />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Vencimento">
                <input type="date" name="dueDate" style={fieldStyle} />
              </FormField>
              <FormField label="Fechamento">
                <input type="date" name="closingDate" style={fieldStyle} />
              </FormField>
            </div>
            <FormField label="Valor total (R$)">
              <input type="number" step="0.01" name="totalAmount" style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar fatura</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* ── Blocos por mês (mais recente primeiro) ───────────────── */}
      <div style={{ padding: "4px 20px 0" }}>
        {visibleMonths.map((info) => (
          <MonthBlock key={info.ym} info={info} accountsById={accountsById} uploadByInvoiceId={uploadByInvoiceId} aggInvoiceMap={aggInvoiceMap} />
        ))}

        {futureMonths.length > 0 && (
          <CollapsedMonths
            label={`${futureMonths.map((x) => monthShort(x.m)).join(" · ")} — meses futuros`}
          />
        )}
        {preMonths.length > 0 && (
          <CollapsedMonths
            label={`${preMonths.map((x) => monthShort(x.m)).join(" · ")} — antes do início do controle`}
          />
        )}
      </div>
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
    cursor: disabled ? "default" : "pointer",
    pointerEvents: disabled ? "none" : undefined,
  };
  const glyph = dir === "prev" ? "‹" : "›";
  if (disabled) return <span style={style}>{glyph}</span>;
  return (
    <Link href={`/financeiro/documentos?year=${targetYear}`} style={style}>
      {glyph}
    </Link>
  );
}

function MonthBlock({
  info,
  accountsById,
  uploadByInvoiceId,
  aggInvoiceMap,
}: {
  info: {
    ym: string;
    m: number;
    state: "complete" | "partial" | "current" | "future" | "pre";
    extratos: ExtratoEntry[];
    faturas: InvoiceEntry[];
  };
  accountsById: Map<string, typeof bankAccounts.$inferSelect>;
  uploadByInvoiceId: Map<string, string | null>;
  aggInvoiceMap: Map<string, { count: number; total: string }>;
}) {
  const chip =
    info.state === "complete"
      ? { label: "✓ completo", color: "var(--ok)" }
      : info.state === "current"
        ? { label: "em andamento", color: "var(--accent)" }
        : info.extratos.length === 0 && info.faturas.length === 0
          ? { label: "⚠ sem documentos", color: "var(--alert)" }
          : info.extratos.length === 0
            ? { label: "⚠ falta extrato", color: "var(--alert)" }
            : { label: "⚠ falta fatura", color: "var(--alert)" };

  return (
    <div
      id={`m-${info.ym}`}
      style={{
        marginTop: 14,
        border: "0.5px solid var(--line-d)",
        borderRadius: 18,
        background: "color-mix(in oklab, var(--card) 55%, var(--bg))",
        overflow: "hidden",
        scrollMarginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "0.5px solid var(--line)",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {monthName(info.ym)}
        </span>
        {info.state === "current" && (
          <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>· mês atual</span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 999,
            background: `color-mix(in oklab, ${chip.color} 15%, transparent)`,
            color: chip.color,
            border: `0.5px solid color-mix(in oklab, ${chip.color} 42%, transparent)`,
          }}
        >
          {chip.label}
        </span>
      </div>

      <div className="doc-cols">
        {/* coluna EXTRATO */}
        <div style={{ padding: "12px 14px 14px" }}>
          <ColLabel text="🏦 Extrato" />
          {info.extratos.length === 0 ? (
            <EmptySlot
              calm={info.state === "current"}
              hint={
                info.state === "current"
                  ? "o extrato fecha no fim do mês"
                  : `nenhum extrato de ${monthName(info.ym)} lançado`
              }
              ctaLabel={info.state === "current" ? "subir mesmo assim ↗" : "subir extrato ↗"}
              href="/financeiro/upload"
            />
          ) : (
            info.extratos.map((e) => {
              const acc = e.upload.bankAccountId ? accountsById.get(e.upload.bankAccountId) : null;
              const status = e.upload.status;
              return (
                <Link
                  key={e.upload.id}
                  href={
                    acc
                      ? `/financeiro/transacoes?account=${acc.id}&month=${e.refMonth}`
                      : `/financeiro/transacoes?month=${e.refMonth}`
                  }
                  className="doc-card"
                  style={docCardStyle}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{acc?.name ?? "Conta não vinculada"}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9.5,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color:
                          status === "completed"
                            ? "var(--ok)"
                            : status === "failed" || status === "needs_review"
                              ? "var(--alert)"
                              : "var(--accent)",
                      }}
                    >
                      {status === "completed"
                        ? "processado"
                        : status === "failed"
                          ? "erro"
                          : status === "needs_review"
                            ? "revisar"
                            : status === "processing"
                              ? "processando"
                              : "pendente"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                    {e.count} lançamentos
                    {e.minDate && e.maxDate
                      ? ` · ${formatDayMonth(e.minDate)} → ${formatDayMonth(e.maxDate)}`
                      : ""}
                  </div>
                  <div className="ap-num" style={{ display: "flex", gap: 12, marginTop: 7, alignItems: "baseline" }}>
                    <span style={{ color: "var(--alert)", fontSize: 13, fontWeight: 700 }}>
                      −R$ {formatBRL(e.debit)}
                    </span>
                    <span style={{ color: "var(--ok)", fontSize: 13, fontWeight: 700 }}>
                      +R$ {formatBRL(e.credit)}
                    </span>
                  </div>
                  <StatementActions
                    uploadId={e.upload.id}
                    blobUrl={e.upload.blobUrl}
                    filename={e.upload.filename}
                    txCount={e.count}
                  />
                </Link>
              );
            })
          )}
        </div>

        {/* coluna FATURAS */}
        <div style={{ padding: "12px 14px 14px" }}>
          <ColLabel
            text="💳 Faturas"
            extra={info.faturas.length > 1 ? `· ${info.faturas.length} cartões` : undefined}
          />
          {info.faturas.length === 0 ? (
            <EmptySlot
              calm={info.state === "current"}
              hint={
                info.state === "current"
                  ? "a fatura fecha na virada do mês"
                  : `nenhuma fatura de ${monthName(info.ym)} lançada`
              }
              ctaLabel={info.state === "current" ? "subir mesmo assim ↗" : "subir fatura ↗"}
              href="/financeiro/faturas/upload"
            />
          ) : (
            info.faturas.map((inv) => {
              const agg = aggInvoiceMap.get(inv.id);
              const total = inv.totalAmount ? parseFloat(inv.totalAmount) : agg ? parseFloat(agg.total) : 0;
              const paid = inv.status === "paid";
              const parent = inv.bankAccount?.parentAccountId
                ? accountsById.get(inv.bankAccount.parentAccountId)
                : null;
              return (
                <Link key={inv.id} href={`/financeiro/faturas/${inv.id}`} className="doc-card" style={docCardStyle}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{inv.bankAccount?.name ?? "Cartão"}</span>
                    {inv.bankAccount?.lastFour && (
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>····{inv.bankAccount.lastFour}</span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9.5,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: paid ? "var(--ok)" : "var(--alert)",
                      }}
                    >
                      {paid ? "✓ paga" : inv.status === "scheduled" ? "agendada" : "em aberto"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                    {agg?.count ?? 0} lançamentos
                    {inv.dueDate ? ` · ${paid ? "venceu" : "vence"} ${formatDayMonth(inv.dueDate)}` : ""}
                    {parent ? ` · paga via ${parent.name}` : ""}
                  </div>
                  <div className="ap-num" style={{ marginTop: 7, fontSize: 15, fontWeight: 800 }}>
                    R$ {formatBRL(total)}
                  </div>
                  <InvoiceActions
                    invoiceId={inv.id}
                    blobUrl={uploadByInvoiceId.get(inv.id) ?? null}
                    referenceMonth={inv.referenceMonth}
                    txCount={agg?.count ?? 0}
                  />
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ColLabel({ text, extra }: { text: string; extra?: string }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 8,
      }}
    >
      {text}
      {extra && <span style={{ color: "var(--accent)", marginLeft: 4 }}>{extra}</span>}
    </div>
  );
}

function EmptySlot({
  hint,
  ctaLabel,
  href,
  calm,
}: {
  hint: string;
  ctaLabel: string;
  href: string;
  calm?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        minHeight: 86,
        border: `1px dashed ${calm ? "var(--line-d)" : "color-mix(in oklab, var(--alert) 50%, transparent)"}`,
        borderRadius: 13,
      }}
    >
      <span style={{ fontSize: 10, color: "var(--muted)" }}>{hint}</span>
      <Link
        href={href}
        style={{
          fontSize: 11,
          fontWeight: calm ? 700 : 800,
          color: calm ? "var(--muted-d)" : "var(--alert)",
          padding: "5px 13px",
          borderRadius: 999,
          border: `1px solid ${calm ? "var(--line-d)" : "color-mix(in oklab, var(--alert) 55%, transparent)"}`,
          background: calm ? "transparent" : "color-mix(in oklab, var(--alert) 10%, transparent)",
          textDecoration: "none",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function CollapsedMonths({ label }: { label: string }) {
  return (
    <div
      style={{
        marginTop: 14,
        border: "0.5px solid var(--line-d)",
        borderRadius: 18,
        background: "color-mix(in oklab, var(--card) 55%, var(--bg))",
        opacity: 0.45,
        padding: "14px 16px",
        fontSize: 11.5,
        color: "var(--muted)",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

const docCardStyle: React.CSSProperties = {
  display: "block",
  background: "var(--card)",
  border: "0.5px solid var(--line-d)",
  borderRadius: 13,
  padding: "11px 13px",
  textDecoration: "none",
  color: "inherit",
  marginBottom: 8,
};

const uploadBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "13px 16px",
  borderRadius: 14,
  background: "var(--accent)",
  color: "var(--accent-on)",
  textDecoration: "none",
  fontSize: 13.5,
  fontWeight: 700,
};
