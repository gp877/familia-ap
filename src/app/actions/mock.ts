"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  aniversarios,
  bankAccounts,
  budgets,
  categories,
  categoryRules,
  compromissos,
  exames,
  finsDeSemana,
  invoices,
  pesagens,
  presentes,
  roteiros,
  sonhos,
  supermercadoItens,
  supermercadoPedidoItens,
  supermercadoPedidos,
  transactions,
  viagens,
} from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(n: number): string {
  return daysAgo(-n).toISOString().slice(0, 10);
}

function dateAgo(n: number): string {
  return daysAgo(n).toISOString().slice(0, 10);
}

/**
 * Popula o household do usuário com dados de exemplo em todos os módulos.
 * Idempotente: não duplica o que já existe (verifica antes de inserir).
 */
export async function seedDemoData() {
  const { householdId, userId } = await requireUserAndHousehold();

  // ── BANK ACCOUNTS ────────────────────────────────────────
  const existingAccounts = await db.query.bankAccounts.findMany({
    where: (a, { eq }) => eq(a.householdId, householdId),
  });
  let cc = existingAccounts.find((a) => a.type === "checking");
  let card = existingAccounts.find((a) => a.type === "credit_card");

  if (!cc) {
    const [created] = await db
      .insert(bankAccounts)
      .values({
        householdId,
        name: "UNICRED · CC",
        type: "checking",
        institution: "UNICRED",
        lastFour: "9998",
      })
      .returning();
    cc = created;
  }
  if (!card) {
    const [created] = await db
      .insert(bankAccounts)
      .values({
        householdId,
        name: "UNICRED Visa Gold",
        type: "credit_card",
        institution: "UNICRED",
        lastFour: "6234",
      })
      .returning();
    card = created;
  }

  // ── CATEGORIAS auxiliares (assumindo seed inicial já criou as principais) ──
  const cats = await db.query.categories.findMany({
    where: (c, { eq }) => eq(c.householdId, householdId),
  });
  const findCat = (name: string) =>
    cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const alimentacao = findCat("Alimentação");
  const mercado = findCat("Mercado");
  const restaurante = findCat("Restaurante / Delivery");
  const transporte = findCat("Transporte");
  const combustivel = findCat("Combustível");
  const lazer = findCat("Lazer");
  const moradia = findCat("Moradia");
  const saudeCat = findCat("Saúde");
  const salario = findCat("Salário");

  // ── REGRAS de auto-categorização ──────────────────────────
  const existingRules = await db.query.categoryRules.findMany({
    where: (r, { eq }) => eq(r.householdId, householdId),
  });
  const ruleExists = (pattern: string) =>
    existingRules.some((r) => r.pattern.toLowerCase() === pattern.toLowerCase());

  const ruleSeeds: Array<{ pattern: string; categoryId: string }> = [];
  if (mercado && !ruleExists("Mercado Livre")) {
    ruleSeeds.push({ pattern: "Mercado Livre", categoryId: mercado.id });
  }
  if (restaurante && !ruleExists("iFood")) {
    ruleSeeds.push({ pattern: "iFood", categoryId: restaurante.id });
  }
  if (combustivel && !ruleExists("Posto")) {
    ruleSeeds.push({ pattern: "Posto", categoryId: combustivel.id });
  }
  if (ruleSeeds.length > 0) {
    await db.insert(categoryRules).values(
      ruleSeeds.map((r) => ({ householdId, ...r, matchType: "contains" as const }))
    );
  }

  // ── INVOICE atual + anterior ─────────────────────────────
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const existingInvoices = await db.query.invoices.findMany({
    where: (i, { eq, and }) =>
      and(eq(i.householdId, householdId), eq(i.bankAccountId, card.id)),
  });
  let currentInvoice = existingInvoices.find((i) => i.referenceMonth === currentMonth);
  let prevInvoice = existingInvoices.find((i) => i.referenceMonth === prevMonth);
  if (!currentInvoice) {
    const [created] = await db
      .insert(invoices)
      .values({
        householdId,
        bankAccountId: card.id,
        referenceMonth: currentMonth,
        dueDate: dateStr(10),
        status: "open",
      })
      .returning();
    currentInvoice = created;
  }
  if (!prevInvoice) {
    const [created] = await db
      .insert(invoices)
      .values({
        householdId,
        bankAccountId: card.id,
        referenceMonth: prevMonth,
        dueDate: dateAgo(20),
        status: "paid",
      })
      .returning();
    prevInvoice = created;
  }

  // ── TRANSAÇÕES de exemplo (só insere se não existirem mockadas) ──
  const existingMockTxs = await db.query.transactions.findMany({
    where: (t, { eq, and, like }) =>
      and(eq(t.householdId, householdId), like(t.description, "%(demo)%")),
    limit: 1,
  });
  if (existingMockTxs.length === 0) {
    const mockTxs: Array<typeof transactions.$inferInsert> = [
      // Conta corrente
      {
        householdId,
        bankAccountId: cc.id,
        createdById: userId,
        occurredOn: daysAgo(2),
        amount: "8500.00",
        kind: "credit",
        description: "Salário Augusto (demo)",
        rawDescription: "CREDITO TED RECEBIDO - EMPREGADOR LTDA",
        categoryId: salario?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: cc.id,
        createdById: userId,
        occurredOn: daysAgo(5),
        amount: "6500.00",
        kind: "credit",
        description: "Salário Marília (demo)",
        rawDescription: "CREDITO PIX - EMPRESA X LTDA",
        categoryId: salario?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: cc.id,
        createdById: userId,
        occurredOn: daysAgo(15),
        amount: "2200.00",
        kind: "debit",
        description: "Aluguel (demo)",
        rawDescription: "DEBITO TRANSFERENCIA PIX - IMOBILIARIA",
        categoryId: findCat("Aluguel / Financiamento")?.id ?? moradia?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: cc.id,
        createdById: userId,
        occurredOn: daysAgo(10),
        amount: "420.50",
        kind: "debit",
        description: "Mercado Livre 3 produtos (demo)",
        rawDescription: "DEBITO PAGAMENTO PIX - MERCADO LIVRE",
        categoryId: mercado?.id ?? null,
        status: "pending",
      },
      {
        householdId,
        bankAccountId: cc.id,
        createdById: userId,
        occurredOn: daysAgo(7),
        amount: "189.90",
        kind: "debit",
        description: "iFood Pagamento (demo)",
        rawDescription: "DEBITO PAGAMENTO PIX - IFOOD",
        categoryId: restaurante?.id ?? alimentacao?.id ?? null,
        status: "pending",
      },
      // Cartão (vinculadas à invoice atual)
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: currentInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(20),
        amount: "1280.40",
        kind: "debit",
        description: "Mercado Livre 8 produtos (demo)",
        rawDescription: "MERCADOLIVRE*8PRODUTOS",
        categoryId: mercado?.id ?? null,
        status: "pending",
      },
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: currentInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(12),
        amount: "560.57",
        kind: "debit",
        description: "Posto Lagoa Nova (demo)",
        rawDescription: "POSTOLAGOANOVA",
        categoryId: combustivel?.id ?? transporte?.id ?? null,
        status: "pending",
      },
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: currentInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(8),
        amount: "232.00",
        kind: "debit",
        description: "Restaurante da Ilha (demo)",
        rawDescription: "RESTAURANTE DA ILHA",
        categoryId: restaurante?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: prevInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(40),
        amount: "517.30",
        kind: "debit",
        description: "Zurich Seguros (demo)",
        rawDescription: "ZURICH SEGUROS Parc.5/10",
        installmentCurrent: 5,
        installmentTotal: 10,
        categoryId: saudeCat?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: prevInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(35),
        amount: "265.00",
        kind: "debit",
        description: "Porto Fit Academia (demo)",
        rawDescription: "PORTO.FIT ACADEMI Parc.3/11",
        installmentCurrent: 3,
        installmentTotal: 11,
        categoryId: saudeCat?.id ?? null,
        status: "confirmed",
      },
      {
        householdId,
        bankAccountId: card.id,
        invoiceId: prevInvoice.id,
        createdById: userId,
        occurredOn: daysAgo(33),
        amount: "11.90",
        kind: "debit",
        description: "Amazon Music (demo)",
        rawDescription: "AMAZON MUSIC",
        categoryId: lazer?.id ?? null,
        status: "confirmed",
      },
    ];
    await db.insert(transactions).values(mockTxs);

    // Atualiza totalAmount da currentInvoice
    const currentTotal = mockTxs
      .filter((t) => t.invoiceId === currentInvoice.id && t.kind === "debit")
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const prevTotal = mockTxs
      .filter((t) => t.invoiceId === prevInvoice.id && t.kind === "debit")
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const { eq: eqDrizzle } = await import("drizzle-orm");
    if (currentTotal > 0) {
      await db
        .update(invoices)
        .set({ totalAmount: String(currentTotal), updatedAt: new Date() })
        .where(eqDrizzle(invoices.id, currentInvoice.id));
    }
    if (prevTotal > 0) {
      await db
        .update(invoices)
        .set({ totalAmount: String(prevTotal), updatedAt: new Date() })
        .where(eqDrizzle(invoices.id, prevInvoice.id));
    }
  }

  // ── ORÇAMENTOS ─────────────────────────────────────────────
  if (alimentacao) {
    const exists = await db.query.budgets.findFirst({
      where: (b, { eq, and }) =>
        and(
          eq(b.householdId, householdId),
          eq(b.categoryId, alimentacao.id),
          eq(b.year, now.getFullYear()),
          eq(b.month, 0)
        ),
    });
    if (!exists) {
      await db.insert(budgets).values({
        householdId,
        categoryId: alimentacao.id,
        year: now.getFullYear(),
        month: 0,
        plannedAmount: "2500.00",
      });
    }
  }
  if (moradia) {
    const exists = await db.query.budgets.findFirst({
      where: (b, { eq, and }) =>
        and(
          eq(b.householdId, householdId),
          eq(b.categoryId, moradia.id),
          eq(b.year, now.getFullYear()),
          eq(b.month, 0)
        ),
    });
    if (!exists) {
      await db.insert(budgets).values({
        householdId,
        categoryId: moradia.id,
        year: now.getFullYear(),
        month: 0,
        plannedAmount: "3000.00",
      });
    }
  }
  if (lazer) {
    const exists = await db.query.budgets.findFirst({
      where: (b, { eq, and }) =>
        and(
          eq(b.householdId, householdId),
          eq(b.categoryId, lazer.id),
          eq(b.year, now.getFullYear()),
          eq(b.month, 0)
        ),
    });
    if (!exists) {
      await db.insert(budgets).values({
        householdId,
        categoryId: lazer.id,
        year: now.getFullYear(),
        month: 0,
        plannedAmount: "800.00",
      });
    }
  }

  // ── COMPROMISSOS ─────────────────────────────────────────
  const existingCompromissos = await db.query.compromissos.findMany({
    where: (c, { eq, like, and }) =>
      and(eq(c.householdId, householdId), like(c.title, "%(demo)%")),
    limit: 1,
  });
  if (existingCompromissos.length === 0) {
    await db.insert(compromissos).values([
      {
        householdId,
        createdById: userId,
        occurredOn: dateStr(2),
        time: "16:00",
        title: "Aula de natação Francisco (demo)",
        who: "Francisco",
        location: "Clube",
        recurringRule: "weekly",
      },
      {
        householdId,
        createdById: userId,
        occurredOn: dateStr(5),
        time: "19:30",
        title: "Jantar com vó Inês (demo)",
        who: "Casal",
      },
      {
        householdId,
        createdById: userId,
        occurredOn: dateStr(12),
        time: "08:00",
        title: "Reunião condomínio (demo)",
        who: "Augusto",
      },
      {
        householdId,
        createdById: userId,
        occurredOn: dateStr(20),
        title: "Passeio do colégio (demo)",
        who: "Francisco",
        notes: "Levar lanche e protetor solar",
      },
    ]);
  }

  // ── FINS DE SEMANA ─────────────────────────────────────────
  const existingFds = await db.query.finsDeSemana.findMany({
    where: (f, { eq, like, and }) =>
      and(eq(f.householdId, householdId), like(f.title, "%(demo)%")),
    limit: 1,
  });
  if (existingFds.length === 0) {
    // Próximo sábado e domingo
    const today = new Date();
    const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
    const sat = new Date(today);
    sat.setDate(today.getDate() + daysUntilSat);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);

    await db.insert(finsDeSemana).values([
      {
        householdId,
        createdById: userId,
        weekendDate: sat.toISOString().slice(0, 10),
        title: "Praia (demo)",
        notes: "Sair cedo, levar guarda-sol",
      },
      {
        householdId,
        createdById: userId,
        weekendDate: sun.toISOString().slice(0, 10),
        title: "Almoço família (demo)",
      },
    ]);
  }

  // ── ANIVERSÁRIOS ─────────────────────────────────────────
  const existingAnivs = await db.query.aniversarios.findMany({
    where: (a, { eq, like, and }) =>
      and(eq(a.householdId, householdId), like(a.name, "%(demo)%")),
    limit: 1,
  });
  if (existingAnivs.length === 0) {
    const inserted = await db
      .insert(aniversarios)
      .values([
        {
          householdId,
          createdById: userId,
          name: "Vó Inês (demo)",
          monthDay: "05-26",
          birthYear: 1948,
          relation: "avó da Marília",
        },
        {
          householdId,
          createdById: userId,
          name: "Francisco (demo)",
          monthDay: "07-02",
          birthYear: 2018,
          relation: "filho",
        },
        {
          householdId,
          createdById: userId,
          name: "Marília (demo)",
          monthDay: "08-11",
          birthYear: 1986,
          relation: "esposa",
        },
      ])
      .returning();

    // Adicionar presentes pra vó Inês
    const voInes = inserted.find((a) => a.name.startsWith("Vó"));
    if (voInes) {
      await db.insert(presentes).values([
        {
          aniversarioId: voInes.id,
          year: now.getFullYear() - 1,
          description: "Xale azul",
          notes: "ela amou",
        },
        {
          aniversarioId: voInes.id,
          year: now.getFullYear() - 2,
          description: "Conjunto chá",
        },
      ]);
    }
  }

  // ── SONHOS ──────────────────────────────────────────────
  const existingSonhos = await db.query.sonhos.findMany({
    where: (s, { eq, like, and }) =>
      and(eq(s.householdId, householdId), like(s.title, "%(demo)%")),
    limit: 1,
  });
  if (existingSonhos.length === 0) {
    await db.insert(sonhos).values([
      {
        householdId,
        createdById: userId,
        title: "Casa na praia (demo)",
        description: "Pé na areia, sacada com vista, lugar pra família reunir",
        imageUrl: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800",
        status: "active",
      },
      {
        householdId,
        createdById: userId,
        title: "Itália em família (demo)",
        description: "Toscana, Roma, Veneza. Levar Francisco quando crescer mais um pouco",
        imageUrl: "https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800",
        status: "active",
      },
      {
        householdId,
        createdById: userId,
        title: "Maratona do Rio (demo)",
        description: "Augusto",
        imageUrl: "https://images.unsplash.com/photo-1530143584546-02191bc84eb5?w=800",
        status: "realized",
        realizedDate: dateAgo(180),
      },
    ]);
  }

  // ── VIAGENS + ROTEIROS ─────────────────────────────────────
  const existingViagens = await db.query.viagens.findMany({
    where: (v, { eq, like, and }) =>
      and(eq(v.householdId, householdId), like(v.title, "%(demo)%")),
    limit: 1,
  });
  if (existingViagens.length === 0) {
    const inserted = await db
      .insert(viagens)
      .values([
        {
          householdId,
          createdById: userId,
          title: "Buenos Aires (demo)",
          destinationCity: "Buenos Aires",
          destinationCountry: "AR",
          startDate: dateAgo(100),
          endDate: dateAgo(95),
          nights: 5,
          status: "past",
        },
        {
          householdId,
          createdById: userId,
          title: "Lisboa + Porto (demo)",
          destinationCity: "Lisboa",
          destinationCountry: "PT",
          startDate: dateStr(4),
          endDate: dateStr(18),
          nights: 14,
          status: "planned",
          ticketsBought: true,
          flightInfo: "LATAM 8084 · 22h05",
          estimatedCost: "18500.00",
        },
      ])
      .returning();

    const lisboa = inserted.find((v) => v.title.startsWith("Lisboa"));
    if (lisboa) {
      await db.insert(roteiros).values([
        {
          viagemId: lisboa.id,
          dayNumber: 1,
          date: dateStr(4),
          dayOfWeek: "Qua",
          city: "Lisboa",
          distanceKm: 0,
          programManha: "Chegada GRU → LIS, check-in hotel Chiado",
          programTarde: "Caminhar pelo Bairro Alto, pastéis de Belém",
          programNoite: "Jantar leve, dormir cedo",
          estimatedCost: "350.00",
        },
        {
          viagemId: lisboa.id,
          dayNumber: 2,
          date: dateStr(5),
          dayOfWeek: "Qui",
          city: "Lisboa",
          distanceKm: 10,
          programManha: "Mosteiro dos Jerónimos + Torre de Belém",
          programTarde: "Almoço no Time Out Market",
          programNoite: "Fado em Alfama",
          estimatedCost: "280.00",
        },
        {
          viagemId: lisboa.id,
          dayNumber: 3,
          date: dateStr(6),
          dayOfWeek: "Sex",
          city: "Sintra",
          distanceKm: 30,
          programManha: "Trem pra Sintra, Palácio da Pena",
          programTarde: "Quinta da Regaleira",
          programNoite: "Volta a Lisboa",
          estimatedCost: "190.00",
        },
      ]);
    }
  }

  // ── SUPERMERCADO ─────────────────────────────────────────
  const existingItems = await db.query.supermercadoItens.findMany({
    where: (i, { eq, like, and }) =>
      and(eq(i.householdId, householdId), like(i.name, "%(demo)%")),
    limit: 1,
  });
  if (existingItems.length === 0) {
    await db.insert(supermercadoItens).values([
      {
        householdId,
        name: "Leite integral (demo)",
        category: "Mercado",
        unit: "L",
        defaultQty: "6.00",
        currentStock: "2.00",
        estimatedPrice: "5.49",
      },
      {
        householdId,
        name: "Pão de forma (demo)",
        category: "Mercado",
        unit: "un",
        defaultQty: "2.00",
        currentStock: "0.00",
        estimatedPrice: "9.90",
      },
      {
        householdId,
        name: "Maçãs (demo)",
        category: "Frutas",
        unit: "kg",
        defaultQty: "2.00",
        currentStock: "1.00",
        estimatedPrice: "8.99",
      },
      {
        householdId,
        name: "Detergente (demo)",
        category: "Limpeza",
        unit: "un",
        defaultQty: "3.00",
        currentStock: "3.00",
        estimatedPrice: "3.99",
      },
      {
        householdId,
        name: "Café (demo)",
        category: "Mercado",
        unit: "pct",
        defaultQty: "2.00",
        currentStock: "1.00",
        estimatedPrice: "18.90",
      },
    ]);
  }

  // ── SAÚDE · EXAMES ─────────────────────────────────────────
  const existingExames = await db.query.exames.findMany({
    where: (e, { eq, like, and }) =>
      and(eq(e.householdId, householdId), like(e.name, "%(demo)%")),
    limit: 1,
  });
  if (existingExames.length === 0) {
    await db.insert(exames).values([
      {
        householdId,
        createdById: userId,
        who: "Augusto",
        name: "Check-up cardio (demo)",
        examDate: dateAgo(30),
        doctor: "Dr. Salles",
        status: "ok",
        result: "CK e CKMB normais",
      },
      {
        householdId,
        createdById: userId,
        who: "Augusto",
        name: "Colesterol total (demo)",
        examDate: dateAgo(60),
        doctor: "Lab Sabin",
        status: "atencao",
        result: "LDL no limite alto · 145mg/dL",
      },
      {
        householdId,
        createdById: userId,
        who: "Marília",
        name: "Tireoide TSH (demo)",
        examDate: dateAgo(45),
        doctor: "Lab Sabin",
        status: "ok",
        result: "2,1 mUI/L",
      },
    ]);
  }

  // ── SAÚDE · PESAGENS ─────────────────────────────────────────
  const existingPesagens = await db.query.pesagens.findMany({
    where: (p, { eq, and }) => and(eq(p.householdId, householdId)),
    limit: 1,
  });
  if (existingPesagens.length === 0) {
    const augustoWeights = [86.4, 86.0, 85.3, 84.7, 84.1, 83.6, 83.4];
    const mariliaWeights = [62.2, 62.0, 61.6, 61.3, 61.0, 60.9, 60.7];

    const rows: Array<typeof pesagens.$inferInsert> = [];
    for (let i = 0; i < augustoWeights.length; i++) {
      rows.push({
        householdId,
        createdById: userId,
        who: "Augusto",
        weighedOn: dateAgo(7 * (augustoWeights.length - 1 - i)),
        weightKg: augustoWeights[i].toFixed(1),
      });
      rows.push({
        householdId,
        createdById: userId,
        who: "Marília",
        weighedOn: dateAgo(7 * (mariliaWeights.length - 1 - i)),
        weightKg: mariliaWeights[i].toFixed(1),
      });
    }
    await db.insert(pesagens).values(rows);
  }

  // ── Revalidate todas as paths principais ─────────────────
  revalidatePath("/");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/transacoes");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/faturas");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/orcamento");
  revalidatePath("/financeiro/categorias");
  revalidatePath("/compromissos");
  revalidatePath("/finais-de-semana");
  revalidatePath("/aniversarios");
  revalidatePath("/sonhos");
  revalidatePath("/viagens");
  revalidatePath("/supermercado");
  revalidatePath("/saude-exames");
  revalidatePath("/saude-peso");
}

/**
 * Remove TODOS os dados que terminam com "(demo)" do household.
 */
export async function clearDemoData() {
  const { householdId } = await requireUserAndHousehold();
  const { and, eq, like } = await import("drizzle-orm");

  // Order matters: delete dependents first
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.householdId, householdId), like(transactions.description, "%(demo)%"))
    );
  await db
    .delete(compromissos)
    .where(
      and(eq(compromissos.householdId, householdId), like(compromissos.title, "%(demo)%"))
    );
  await db
    .delete(finsDeSemana)
    .where(
      and(eq(finsDeSemana.householdId, householdId), like(finsDeSemana.title, "%(demo)%"))
    );
  await db
    .delete(aniversarios)
    .where(
      and(eq(aniversarios.householdId, householdId), like(aniversarios.name, "%(demo)%"))
    );
  await db
    .delete(sonhos)
    .where(and(eq(sonhos.householdId, householdId), like(sonhos.title, "%(demo)%")));
  await db
    .delete(viagens)
    .where(and(eq(viagens.householdId, householdId), like(viagens.title, "%(demo)%")));
  await db
    .delete(supermercadoItens)
    .where(
      and(eq(supermercadoItens.householdId, householdId), like(supermercadoItens.name, "%(demo)%"))
    );
  await db
    .delete(exames)
    .where(and(eq(exames.householdId, householdId), like(exames.name, "%(demo)%")));
  // Pesagens não têm marca "(demo)" — remove todas as inseridas pelo seed (cuidado)
  // (deixo as do user — só remove se quiser limpar tudo manualmente)

  revalidatePath("/");
}
