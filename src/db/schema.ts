import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ============================================================
// Enums
// ============================================================
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);
export const transactionKindEnum = pgEnum("transaction_kind", ["debit", "credit"]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "confirmed",
  "ignored",
]);
export const uploadStatusEnum = pgEnum("upload_status", [
  "pending",
  "processing",
  "completed",
  "needs_review",
  "failed",
]);
export const uploadSourceEnum = pgEnum("upload_source", [
  "bank_statement",
  "credit_card_invoice",
  "other",
]);
export const ruleMatchTypeEnum = pgEnum("rule_match_type", [
  "exact",
  "prefix",
  "contains",
  "regex",
]);
export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);
export const memoryKindEnum = pgEnum("memory_kind", [
  "fact",
  "preference",
  "goal",
  "event",
]);
export const notificationRuleTypeEnum = pgEnum("notification_rule_type", [
  "missing_statement", // extrato do mês não foi enviado
  "missing_invoice", // fatura do mês não foi enviada
  "pending_classifications", // tx pending demais
  "weekly_digest", // resumo semanal
  "pending_recurring_payments", // pgtos recorrentes ainda não marcados como pagos
]);

export const recurringPaymentFreqEnum = pgEnum("recurring_payment_freq", [
  "monthly",
  "yearly",
]);
export const notificationFrequencyEnum = pgEnum("notification_frequency", [
  "daily",
  "weekly_monday",
  "weekly_friday",
  "weekly_sunday",
  "monthly_first",
]);
export const notificationLogStatusEnum = pgEnum("notification_log_status", [
  "sent",
  "skipped", // condição não bateu (ex: extrato já foi enviado)
  "failed", // erro no provedor
]);
export const bankAccountTypeEnum = pgEnum("bank_account_type", [
  "checking", // conta corrente
  "savings", // poupança
  "credit_card", // cartão de crédito
  "investment",
  "other",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "open", // ainda nao paga
  "scheduled", // pagamento agendado mas nao quitado
  "paid", // quitada
]);
export const viagemStatusEnum = pgEnum("viagem_status", [
  "planned",
  "in_progress",
  "past",
]);
export const sonhoStatusEnum = pgEnum("sonho_status", [
  "active",
  "realized",
  "paused",
]);
export const pedidoStatusEnum = pgEnum("pedido_status", [
  "draft",
  "sent",
  "received",
  "cancelled",
]);
export const examStatusEnum = pgEnum("exam_status", [
  "ok",
  "atencao",
  "anormal",
  "pendente",
]);

// ============================================================
// Household
// ============================================================
export const households = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Auth.js tables
// ============================================================
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  householdId: uuid("household_id").references(() => households.id, {
    onDelete: "set null",
  }),
  /** Telefone E.164 (+5511…) — usado pra mapear mensagens do WhatsApp ao usuário. */
  phone: text("phone").unique(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ============================================================
// Categorias
// ============================================================
export const categories = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): import("drizzle-orm/pg-core").AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull().default("expense"),
    color: text("color"),
    icon: text("icon"),
    /** Posição entre irmãs (mesmo kind+parent). Mais baixo = primeiro. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (c) => [index("category_household_idx").on(c.householdId)]
);

// ============================================================
// Contas bancárias / cartões — fonte da transação
// ============================================================
export const bankAccounts = pgTable(
  "bank_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /**
     * Conta-mãe (só faz sentido para `type=credit_card` — cartões são
     * vinculados a uma conta corrente que paga a fatura). Null = conta
     * raiz (CC, poupança, investimento, …).
     */
    parentAccountId: uuid("parent_account_id").references(
      (): AnyPgColumn => bankAccounts.id,
      { onDelete: "set null" }
    ),
    name: text("name").notNull(), // ex: "UNICRED CC"
    type: bankAccountTypeEnum("type").notNull().default("checking"),
    institution: text("institution"), // ex: "UNICRED"
    lastFour: text("last_four"), // últimos 4 dígitos do número/cartão
    color: text("color"), // hex pra UI
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (a) => [
    index("bank_account_household_idx").on(a.householdId, a.isActive),
    index("bank_account_parent_idx").on(a.parentAccountId),
  ]
);

// ============================================================
// Faturas de cartão (uma por mês por cartão)
// ============================================================
export const invoices = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    referenceMonth: text("reference_month").notNull(), // "YYYY-MM"
    dueDate: date("due_date"), // data de vencimento
    closingDate: date("closing_date"), // data de fechamento (corte)
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    minimumAmount: numeric("minimum_amount", { precision: 14, scale: 2 }),
    status: invoiceStatusEnum("status").notNull().default("open"),
    paidByTransactionId: uuid("paid_by_transaction_id"), // FK preenchida depois
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (i) => [
    index("invoice_household_idx").on(i.householdId),
    uniqueIndex("invoice_unique_per_card_month").on(i.bankAccountId, i.referenceMonth),
  ]
);

// ============================================================
// Uploads de PDFs (extratos / faturas)
// ============================================================
export const uploads = pgTable(
  "upload",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    fileHash: text("file_hash"), // SHA-256 do BINÁRIO do arquivo
    // SHA-256 do TEXTO normalizado extraído do PDF — pega caso de re-download
    // do mesmo extrato pelo banco, que gera arquivo diferente (timestamp/IDs
    // internos) mas conteúdo idêntico. Camada de dedupe mais robusta que o
    // fileHash sozinho.
    contentHash: text("content_hash"),
    fileSize: integer("file_size"),
    sourceType: uploadSourceEnum("source_type").notNull(),
    bankSlug: text("bank_slug"),
    status: uploadStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    // Raw JSON exato que a IA devolveu — debug/auditoria, nunca perdemos a resposta original
    extractedJson: jsonb("extracted_json"),
    // Total reportado pela IA (ex: campo "TOTAL DESTA FATURA" no PDF)
    documentTotal: numeric("document_total", { precision: 14, scale: 2 }),
    // Total recalculado em código (sum de débitos) — pra cross-check
    computedTotal: numeric("computed_total", { precision: 14, scale: 2 }),
    // Avisos da IA (ex: ["páginas pareciam cortadas", "linha com data ilegível"])
    extractionWarnings: jsonb("extraction_warnings"),
    // Páginas que a IA diz ter processado, pra detectar truncamento silencioso
    pagesReported: integer("pages_reported"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (u) => [
    index("upload_household_status_idx").on(u.householdId, u.status),
    index("upload_household_hash_idx").on(u.householdId, u.fileHash),
  ]
);

// ============================================================
// Transações (extrato ou item de fatura)
// ============================================================
export const transactions = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    uploadId: uuid("upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    occurredOn: timestamp("occurred_on", { mode: "date" }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    kind: transactionKindEnum("kind").notNull(),
    description: text("description").notNull(),
    rawDescription: text("raw_description").notNull(),
    sourceAccount: text("source_account"),
    installmentCurrent: integer("installment_current"),
    installmentTotal: integer("installment_total"),
    status: transactionStatusEnum("status").notNull().default("confirmed"),
    // Transferência interna: pagamento de fatura no extrato, "Pagamento Recebido"
    // dentro da fatura, estornos PIX pareados, bonificações de anuidade pareadas.
    // NÃO entram no DRE/balanço — só servem pra fechar o saldo da conta/cartão.
    isInternalTransfer: boolean("is_internal_transfer").notNull().default(false),
    // Sub-tipo da transferência interna pra auditoria:
    // card_payment      = "DEBITO FATURA" no extrato (saída pagando fatura)
    // card_payment_received = "Pagamento Recebido" dentro da fatura
    // pix_refund        = estorno PIX (PAREADO com débito original)
    // annuity_bonus     = bonificação/desconto de anuidade (PAREADA com cobrança)
    // manual            = marcado manualmente pelo usuário (override)
    internalTransferType: text("internal_transfer_type"),
    // FK auto-referente: aponta pro PAR (estorno → débito original, bonificação
    // → anuidade cobrada). Usado pra exibir "↔ par desta linha: X" e pra
    // desfazer ambos juntos. NÃO usado em card_payment (par é a invoice, vai
    // em invoices.paidByTransactionId).
    internalPairId: uuid("internal_pair_id"),
    // Marca quando o usuário sobrescreveu o detector automático. Roda do
    // matcher automático ignora linhas com markedManuallyAt setado.
    markedManuallyAt: timestamp("marked_manually_at", { withTimezone: true }),
    // Splits de categoria — quando uma transação cobre múltiplas categorias.
    // Array [{categoryId, amount, note?}]. Sum dos amounts deve = transaction.amount.
    // Quando splits é null/[], a categoria principal (categoryId) é a única.
    // Caso raro — UI minimalista. Relatórios podem expandir via lib/splits.
    splits: jsonb("splits"),
    // Chave determinística pra dedupe: SHA-1 de
    // `${bankAccount}|${date}|${amount}|${normalizedRawDesc}`. Garantida
    // UNIQUE no banco — última linha de defesa contra duplicatas, vence
    // até race conditions de uploads simultâneos. Calculada na lib
    // computeDedupeKey (src/lib/dedupe.ts).
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_household_date_idx").on(t.householdId, t.occurredOn),
    index("transaction_household_category_idx").on(t.householdId, t.categoryId),
    index("transaction_household_status_idx").on(t.householdId, t.status),
    index("transaction_household_account_idx").on(t.householdId, t.bankAccountId),
    index("transaction_invoice_idx").on(t.invoiceId),
    // UNIQUE parcial: bloqueia 2 tx com mesma chave no mesmo household.
    // Tx lançadas manualmente podem ter dedupeKey null → ficam de fora
    // do constraint (cada manual é única por design).
    uniqueIndex("transaction_dedupe_key_unique")
      .on(t.householdId, t.dedupeKey)
      .where(sql`dedupe_key IS NOT NULL`),
  ]
);

// ============================================================
// Regras de auto-categorização
// ============================================================
export const categoryRules = pgTable(
  "category_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    matchType: ruleMatchTypeEnum("match_type").notNull().default("contains"),
    isActive: boolean("is_active").notNull().default(true),
    lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [index("rule_household_pattern_idx").on(r.householdId, r.pattern)]
);

// ============================================================
// Orçamento (planejado por categoria, por mês)
// ============================================================
export const budgets = pgTable(
  "budget",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12, 0 = anual
    plannedAmount: numeric("planned_amount", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (b) => [
    uniqueIndex("budget_unique").on(b.householdId, b.categoryId, b.year, b.month),
    index("budget_household_year_idx").on(b.householdId, b.year),
  ]
);

// ============================================================
// Agente IA — threads, mensagens, memória
// ============================================================
export const threads = pgTable(
  "thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("thread_household_idx").on(t.householdId, t.updatedAt)]
);

export const messages = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    toolCalls: jsonb("tool_calls"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (m) => [index("message_thread_idx").on(m.threadId, m.createdAt)]
);

export const memories = pgTable(
  "memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: memoryKindEnum("kind").notNull().default("fact"),
    content: text("content").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (m) => [index("memory_household_kind_idx").on(m.householdId, m.kind)]
);

// ============================================================
// Configuração do agente AP por household (alma, linguagem, etc)
// ============================================================
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .unique()
    .references(() => households.id, { onDelete: "cascade" }),
  /** Texto livre que descreve quem é a AP, valores, estilo. */
  alma: text("alma"),
  /** Tom: "intimo" | "formal" | "divertido" — preset que ajusta o system prompt. */
  tone: text("tone").notNull().default("intimo"),
  /** Tamanho de resposta: "curto" | "medio" | "detalhado". */
  responseLength: text("response_length").notNull().default("curto"),
  /** Permite emoji nas respostas. */
  allowEmoji: boolean("allow_emoji").notNull().default(false),
  /** AP pode salvar memórias automaticamente sem perguntar. */
  autoSaveMemories: boolean("auto_save_memories").notNull().default(true),
  /** AP chama os usuários pelo nome. */
  callsUserByName: boolean("calls_user_by_name").notNull().default(true),
  /** Override do modelo (default = gemini-flash-latest). */
  modelOverride: text("model_override"),
  /** Instruções adicionais customizadas. */
  customInstructions: text("custom_instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Notificações por email — régua de lembretes pra manter o sistema ativo
// ============================================================
/**
 * Destinatário de notificação. Pode ser um user do household (linked via
 * userId) ou um e-mail externo livre (ex: contador). O nome é opcional —
 * exibido no header do email.
 */
export const notificationRecipients = pgTable(
  "notification_recipient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    // Quando externo, fica null. Quando é o user do household, aponta.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [
    uniqueIndex("notification_recipient_household_email").on(r.householdId, r.email),
  ]
);

/**
 * Regra de notificação — qual evento dispara, em qual frequência, pra quem.
 * `lastSentAt` é checado pra idempotência (não manda 2x no mesmo dia/semana).
 */
export const notificationRules = pgTable(
  "notification_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    type: notificationRuleTypeEnum("type").notNull(),
    frequency: notificationFrequencyEnum("frequency").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Última vez que disparou (sent) — pra idempotência
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    // Última vez que foi AVALIADA (sent OU skipped) — debug
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    // Config específica do tipo (ex: bankAccountId pra missing_statement,
    // dias mínimos pra pending_classifications)
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [
    index("notification_rule_household_active").on(r.householdId, r.isActive),
  ]
);

/**
 * Liga regras a destinatários (N:N) — uma regra pode mandar pra 1+ pessoas,
 * e uma pessoa pode ser destinatária de 1+ regras.
 */
export const notificationRuleRecipients = pgTable(
  "notification_rule_recipient",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => notificationRules.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => notificationRecipients.id, { onDelete: "cascade" }),
  },
  (rr) => [primaryKey({ columns: [rr.ruleId, rr.recipientId] })]
);

/**
 * Log de todas as avaliações — auditoria + idempotência. Cada vez que o
 * cron roda, registra o que avaliou e o que aconteceu.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => notificationRules.id, { onDelete: "cascade" }),
    status: notificationLogStatusEnum("status").notNull(),
    // Pra cada destinatário (logs separados se múltiplos), o email enviado.
    recipientEmail: text("recipient_email"),
    // ID do Resend (pra reconciliar bounces/deliveries depois se quiser)
    providerId: text("provider_id"),
    // Snapshot do que disparou (debug): "5 tx pending há >5 dias", etc
    triggerSummary: text("trigger_summary"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (l) => [
    index("notification_log_rule_date").on(l.ruleId, l.createdAt),
  ]
);

/**
 * Notificações in-app — sino dentro do sistema. Persistente: o cron
 * sempre grava aqui (mesmo quando manda email), e o user marca como
 * lida quando vê. Permite desabilitar via household_setting.
 *
 * Diferente de notificationLog (que é o "histórico de envio do email"
 * — auditoria), esta tabela é a CAIXA DE ENTRADA do usuário.
 */
export const appNotifications = pgTable(
  "app_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // Tipo (mesmas categorias da régua de email; pode incluir "manual" no futuro)
    type: notificationRuleTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"), // descrição mais longa, opcional
    /** Link interno pra abrir ao clicar (ex: /financeiro/recorrentes) */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (n) => [
    index("app_notification_household_unread").on(n.householdId, n.readAt),
    index("app_notification_household_date").on(n.householdId, n.createdAt),
  ]
);

/**
 * Settings de notificações por household. Master toggles: liga/desliga
 * email global, in-app global, e por tipo individual.
 */
export const notificationSettings = pgTable("notification_settings", {
  householdId: uuid("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  /** JSON: { "missing_statement": false, "weekly_digest": true, ... } */
  perTypeSettings: jsonb("per_type_settings"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Pagamentos recorrentes — lembretes mensais ou anuais
// (IPVA, gás, internet, mensalidade etc.)
// ============================================================
/**
 * Definição da regra recorrente. Cada linha = um item recorrente.
 * Não cria transações automaticamente — só lembra que precisa pagar.
 * O usuário marca como pago em recurringPaymentRecords.
 */
export const recurringPayments = pgTable(
  "recurring_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(), // "IPVA Onix", "Gás botijão", "Internet Claro"
    frequency: recurringPaymentFreqEnum("frequency").notNull(),
    // Vencimento — semântica varia por frequency:
    //   monthly: dueDay = 1..31 (ex: dia 10 do mês). dueMonth = null
    //   yearly:  dueMonth = 1..12 + dueDay = 1..31 (ex: 03/abril)
    dueDay: integer("due_day").notNull(),
    dueMonth: integer("due_month"), // só usado em yearly
    // Valor esperado (referência — pode variar). Null = "varia"
    expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }),
    // Categoria pra futuro link com lançamentos (opcional)
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Conta default de débito (opcional, informativo)
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    // Dados de pagamento — usuário copia na hora de pagar.
    // pixKey aceita qualquer chave (email/cpf/telefone/aleatória/copia-cola).
    // barcodeNumber aceita linha digitável de boleto/convênio.
    pixKey: text("pix_key"),
    barcodeNumber: text("barcode_number"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [
    index("recurring_payment_household_active").on(r.householdId, r.isActive),
  ]
);

/**
 * Registro de quitação por período. Cada linha = "este recorrente foi
 * pago para o período X". UNIQUE em (paymentId, period) impede marcar 2x.
 *
 * Period format:
 *   monthly → "YYYY-MM" (ex: "2026-06")
 *   yearly  → "YYYY"     (ex: "2026")
 */
export const recurringPaymentRecords = pgTable(
  "recurring_payment_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => recurringPayments.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    markedById: text("marked_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    period: text("period").notNull(), // YYYY-MM ou YYYY
    paidOn: date("paid_on"), // dia real do pagamento (opcional)
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }),
    // Link com transação do extrato (opcional — pra rastreio)
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [
    uniqueIndex("recurring_payment_record_period_unique").on(
      r.paymentId,
      r.period
    ),
  ]
);

// ============================================================
// Compromissos (datas pontuais, curto/médio prazo)
// ============================================================
export const compromissos = pgTable(
  "compromisso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    occurredOn: date("occurred_on").notNull(),
    time: text("time"), // "HH:MM" opcional
    title: text("title").notNull(),
    who: text("who"), // "Casal", "Gabriel", "Marília", "Francisco", livre
    location: text("location"),
    notes: text("notes"),
    recurringRule: text("recurring_rule"), // ex: "weekly", "monthly", "weekly:tue"
    seriesId: uuid("series_id"), // mesmo seriesId = todas instâncias da mesma série
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (c) => [index("compromisso_household_date_idx").on(c.householdId, c.occurredOn)]
);

/**
 * Anexos de compromisso — arquivos relacionados ao evento (convite, contrato,
 * comprovante, etc). Armazenados no Vercel Blob; aqui guardamos só metadata
 * + URL pública.
 */
export const compromissoAttachments = pgTable(
  "compromisso_attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compromissoId: uuid("compromisso_id")
      .notNull()
      .references(() => compromissos.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (a) => [index("compromisso_attachment_compromisso_idx").on(a.compromissoId)]
);

// ============================================================
// Finais de Semana (uma entrada = um dia sex/sab/dom)
// ============================================================
export const finsDeSemana = pgTable(
  "fim_de_semana",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    weekendDate: date("weekend_date").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (f) => [index("fim_de_semana_household_date_idx").on(f.householdId, f.weekendDate)]
);

// ============================================================
// Aniversários
// ============================================================
export const aniversarios = pgTable(
  "aniversario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    monthDay: text("month_day").notNull(), // "MM-DD"
    birthYear: integer("birth_year"), // opcional, pra calcular idade
    relation: text("relation"), // "avó da Marília", "sobrinho"
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (a) => [index("aniversario_household_idx").on(a.householdId)]
);

// Presentes dados em aniversários (histórico)
export const presentes = pgTable("presente", {
  id: uuid("id").primaryKey().defaultRandom(),
  aniversarioId: uuid("aniversario_id")
    .notNull()
    .references(() => aniversarios.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Sonhos
// ============================================================
export const sonhos = pgTable(
  "sonho",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    status: sonhoStatusEnum("status").notNull().default("active"),
    realizedDate: date("realized_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (s) => [index("sonho_household_idx").on(s.householdId, s.status)]
);

// ============================================================
// Viagens + Roteiros
// ============================================================
export const viagens = pgTable(
  "viagem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    destinationCity: text("destination_city"),
    destinationCountry: text("destination_country"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    nights: integer("nights"),
    status: viagemStatusEnum("status").notNull().default("planned"),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
    actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
    flightInfo: text("flight_info"),
    ticketsBought: boolean("tickets_bought").notNull().default(false),
    coverImageUrl: text("cover_image_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (v) => [index("viagem_household_status_idx").on(v.householdId, v.status, v.startDate)]
);

export const roteiros = pgTable(
  "roteiro",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viagemId: uuid("viagem_id")
      .notNull()
      .references(() => viagens.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(), // 1, 2, 3…
    date: date("date"),
    dayOfWeek: text("day_of_week"), // "Seg", "Ter"…
    city: text("city"),
    distanceKm: integer("distance_km"),
    programManha: text("program_manha"),
    programTarde: text("program_tarde"),
    programNoite: text("program_noite"),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
    /** Custos discriminados por categoria — substituem o estimatedCost
        genérico quando preenchidos. */
    costAlimentacao: numeric("cost_alimentacao", { precision: 14, scale: 2 }),
    costHospedagem: numeric("cost_hospedagem", { precision: 14, scale: 2 }),
    costPasseios: numeric("cost_passeios", { precision: 14, scale: 2 }),
    costTraslados: numeric("cost_traslados", { precision: 14, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [index("roteiro_viagem_day_idx").on(r.viagemId, r.dayNumber)]
);

// ============================================================
// Passagens aéreas (segmentos de voo) ligadas à viagem
// ============================================================
export const viagemPassagens = pgTable(
  "viagem_passagem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viagemId: uuid("viagem_id")
      .notNull()
      .references(() => viagens.id, { onDelete: "cascade" }),
    segmentOrder: integer("segment_order").notNull().default(0),
    airline: text("airline"),
    flightNumber: text("flight_number"),
    departureAirport: text("departure_airport"), // IATA: "GRU"
    departureAt: timestamp("departure_at", { withTimezone: true }),
    arrivalAirport: text("arrival_airport"), // IATA: "LIS"
    arrivalAt: timestamp("arrival_at", { withTimezone: true }),
    cost: numeric("cost", { precision: 14, scale: 2 }),
    passengers: integer("passengers"),
    bookingReference: text("booking_reference"), // localizador / código de reserva
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (p) => [index("viagem_passagem_viagem_idx").on(p.viagemId, p.segmentOrder)]
);

// ============================================================
// Supermercado — itens (estoque) + pedidos (carrinho/compra)
// ============================================================
export const supermercadoItens = pgTable(
  "supermercado_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"), // tipo do produto: "Mercado", "Padaria", "Limpeza", "Frutas"
    location: text("location"), // localização física: "Prateleira 1", "Armário 2", "Geladeira"
    brand: text("brand"), // marca preferida ou obrigatória
    unit: text("unit").notNull().default("un"), // "un", "kg", "L", "pct"
    defaultQty: numeric("default_qty", { precision: 10, scale: 2 }), // qtd habitual de compra
    minStock: numeric("min_stock", { precision: 10, scale: 2 }), // estoque mínimo (alvo). Pedido = minStock - currentStock
    currentStock: numeric("current_stock", { precision: 10, scale: 2 }), // contagem atual (última)
    estimatedPrice: numeric("estimated_price", { precision: 10, scale: 2 }),
    monthlyAvg: numeric("monthly_avg", { precision: 10, scale: 2 }), // média de compra/mês (calculado)
    lastBoughtAt: timestamp("last_bought_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (i) => [
    index("supermercado_item_household_idx").on(i.householdId, i.isActive),
    index("supermercado_item_sort_idx").on(i.householdId, i.sortOrder),
  ]
);

// Contagens de estoque — registro do dia X com snapshot de cada item.
export const contagemStatusEnum = pgEnum("contagem_status", ["open", "closed"]);
export const supermercadoContagens = pgTable(
  "supermercado_contagem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contagemDate: date("contagem_date").notNull(),
    status: contagemStatusEnum("status").notNull().default("open"),
    notes: text("notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    pedidoId: uuid("pedido_id"), // FK opcional pra pedido gerado a partir da contagem
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (c) => [index("supermercado_contagem_household_idx").on(c.householdId, c.contagemDate)]
);

// Fornecedores (supermercados que recebem o pedido)
export const supermercadoFornecedores = pgTable(
  "supermercado_fornecedor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    whatsapp: text("whatsapp"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (f) => [index("supermercado_fornecedor_household_idx").on(f.householdId, f.isActive)]
);

export const supermercadoFornecedorRelations = relations(supermercadoFornecedores, ({ one }) => ({
  household: one(households, {
    fields: [supermercadoFornecedores.householdId],
    references: [households.id],
  }),
}));

export const supermercadoContagemItens = pgTable(
  "supermercado_contagem_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contagemId: uuid("contagem_id")
      .notNull()
      .references(() => supermercadoContagens.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => supermercadoItens.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    locationSnapshot: text("location_snapshot"),
    unitSnapshot: text("unit_snapshot").notNull().default("un"),
    minStockSnapshot: numeric("min_stock_snapshot", { precision: 10, scale: 2 }),
    countedQty: numeric("counted_qty", { precision: 10, scale: 2 }), // qtd contada (null = não contado)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (ci) => [index("supermercado_contagem_item_contagem_idx").on(ci.contagemId)]
);

export const supermercadoPedidos = pgTable(
  "supermercado_pedido",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title"), // ex: "Compra semanal · 23 mai"
    status: pedidoStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    totalEstimated: numeric("total_estimated", { precision: 14, scale: 2 }),
    totalActual: numeric("total_actual", { precision: 14, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (p) => [index("supermercado_pedido_household_idx").on(p.householdId, p.status, p.createdAt)]
);

export const supermercadoPedidoItens = pgTable(
  "supermercado_pedido_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => supermercadoPedidos.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => supermercadoItens.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(), // nome no momento (caso item seja deletado)
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unit: text("unit").notNull().default("un"),
    estimatedPrice: numeric("estimated_price", { precision: 10, scale: 2 }),
    notes: text("notes"),
    isChecked: boolean("is_checked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (i) => [index("pedido_item_pedido_idx").on(i.pedidoId)]
);

// ============================================================
// Relations
// ============================================================
export const householdRelations = relations(households, ({ many }) => ({
  members: many(users),
  categories: many(categories),
  bankAccounts: many(bankAccounts),
  invoices: many(invoices),
  transactions: many(transactions),
  uploads: many(uploads),
  rules: many(categoryRules),
  budgets: many(budgets),
  threads: many(threads),
  memories: many(memories),
  compromissos: many(compromissos),
  finsDeSemana: many(finsDeSemana),
  aniversarios: many(aniversarios),
  sonhos: many(sonhos),
  viagens: many(viagens),
  supermercadoItens: many(supermercadoItens),
  supermercadoPedidos: many(supermercadoPedidos),
  exames: many(exames),
  pesagens: many(pesagens),
}));

export const userRelations = relations(users, ({ one, many }) => ({
  household: one(households, {
    fields: [users.householdId],
    references: [households.id],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
  uploads: many(uploads),
  threads: many(threads),
  memories: many(memories),
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
  household: one(households, {
    fields: [categories.householdId],
    references: [households.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
  transactions: many(transactions),
  rules: many(categoryRules),
  budgets: many(budgets),
}));

export const bankAccountRelations = relations(bankAccounts, ({ one, many }) => ({
  household: one(households, {
    fields: [bankAccounts.householdId],
    references: [households.id],
  }),
  transactions: many(transactions),
  invoices: many(invoices),
}));

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  household: one(households, {
    fields: [invoices.householdId],
    references: [households.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [invoices.bankAccountId],
    references: [bankAccounts.id],
  }),
  transactions: many(transactions),
}));

export const transactionRelations = relations(transactions, ({ one }) => ({
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  upload: one(uploads, {
    fields: [transactions.uploadId],
    references: [uploads.id],
  }),
  createdBy: one(users, {
    fields: [transactions.createdById],
    references: [users.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [transactions.bankAccountId],
    references: [bankAccounts.id],
  }),
  invoice: one(invoices, {
    fields: [transactions.invoiceId],
    references: [invoices.id],
  }),
}));

export const uploadRelations = relations(uploads, ({ one, many }) => ({
  household: one(households, {
    fields: [uploads.householdId],
    references: [households.id],
  }),
  uploadedBy: one(users, {
    fields: [uploads.uploadedById],
    references: [users.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [uploads.bankAccountId],
    references: [bankAccounts.id],
  }),
  invoice: one(invoices, {
    fields: [uploads.invoiceId],
    references: [invoices.id],
  }),
  transactions: many(transactions),
}));

export const categoryRuleRelations = relations(categoryRules, ({ one }) => ({
  household: one(households, {
    fields: [categoryRules.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [categoryRules.categoryId],
    references: [categories.id],
  }),
}));

export const budgetRelations = relations(budgets, ({ one }) => ({
  household: one(households, {
    fields: [budgets.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const threadRelations = relations(threads, ({ one, many }) => ({
  household: one(households, {
    fields: [threads.householdId],
    references: [households.id],
  }),
  createdBy: one(users, {
    fields: [threads.createdById],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  thread: one(threads, {
    fields: [messages.threadId],
    references: [threads.id],
  }),
  household: one(households, {
    fields: [messages.householdId],
    references: [households.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const memoryRelations = relations(memories, ({ one }) => ({
  household: one(households, {
    fields: [memories.householdId],
    references: [households.id],
  }),
  createdBy: one(users, {
    fields: [memories.createdByUserId],
    references: [users.id],
  }),
}));

export const aniversarioRelations = relations(aniversarios, ({ one, many }) => ({
  household: one(households, {
    fields: [aniversarios.householdId],
    references: [households.id],
  }),
  presentes: many(presentes),
}));

export const presenteRelations = relations(presentes, ({ one }) => ({
  aniversario: one(aniversarios, {
    fields: [presentes.aniversarioId],
    references: [aniversarios.id],
  }),
}));

export const sonhoRelations = relations(sonhos, ({ one }) => ({
  household: one(households, {
    fields: [sonhos.householdId],
    references: [households.id],
  }),
}));

export const viagemRelations = relations(viagens, ({ one, many }) => ({
  household: one(households, {
    fields: [viagens.householdId],
    references: [households.id],
  }),
  roteiros: many(roteiros),
  passagens: many(viagemPassagens),
}));

export const roteiroRelations = relations(roteiros, ({ one }) => ({
  viagem: one(viagens, {
    fields: [roteiros.viagemId],
    references: [viagens.id],
  }),
}));

export const viagemPassagemRelations = relations(viagemPassagens, ({ one }) => ({
  viagem: one(viagens, {
    fields: [viagemPassagens.viagemId],
    references: [viagens.id],
  }),
}));

export const compromissoRelations = relations(compromissos, ({ one }) => ({
  household: one(households, {
    fields: [compromissos.householdId],
    references: [households.id],
  }),
}));

export const fimDeSemanaRelations = relations(finsDeSemana, ({ one }) => ({
  household: one(households, {
    fields: [finsDeSemana.householdId],
    references: [households.id],
  }),
}));

export const supermercadoItemRelations = relations(supermercadoItens, ({ one }) => ({
  household: one(households, {
    fields: [supermercadoItens.householdId],
    references: [households.id],
  }),
}));

export const supermercadoContagemRelations = relations(supermercadoContagens, ({ one, many }) => ({
  household: one(households, {
    fields: [supermercadoContagens.householdId],
    references: [households.id],
  }),
  items: many(supermercadoContagemItens),
  pedido: one(supermercadoPedidos, {
    fields: [supermercadoContagens.pedidoId],
    references: [supermercadoPedidos.id],
  }),
}));

export const supermercadoContagemItemRelations = relations(
  supermercadoContagemItens,
  ({ one }) => ({
    contagem: one(supermercadoContagens, {
      fields: [supermercadoContagemItens.contagemId],
      references: [supermercadoContagens.id],
    }),
    item: one(supermercadoItens, {
      fields: [supermercadoContagemItens.itemId],
      references: [supermercadoItens.id],
    }),
  })
);

export const supermercadoPedidoRelations = relations(supermercadoPedidos, ({ one, many }) => ({
  household: one(households, {
    fields: [supermercadoPedidos.householdId],
    references: [households.id],
  }),
  items: many(supermercadoPedidoItens),
}));

export const supermercadoPedidoItemRelations = relations(supermercadoPedidoItens, ({ one }) => ({
  pedido: one(supermercadoPedidos, {
    fields: [supermercadoPedidoItens.pedidoId],
    references: [supermercadoPedidos.id],
  }),
  item: one(supermercadoItens, {
    fields: [supermercadoPedidoItens.itemId],
    references: [supermercadoItens.id],
  }),
}));

// ============================================================
// Saúde · Exames (histórico clínico)
// ============================================================
export const exames = pgTable(
  "exame",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    who: text("who").notNull(), // "Gabriel", "Marília", "Francisco", livre
    name: text("name").notNull(), // "Check-up cardio", "Sangue completo"
    examDate: date("exam_date").notNull(),
    doctor: text("doctor"), // "Dr. Salles", "Lab Sabin"
    status: examStatusEnum("status").notNull().default("ok"),
    result: text("result"), // observação curta tipo "CK e CKMB normais"
    notes: text("notes"),
    attachmentUrl: text("attachment_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (e) => [index("exame_household_date_idx").on(e.householdId, e.examDate)]
);

export const exameRelations = relations(exames, ({ one, many }) => ({
  household: one(households, {
    fields: [exames.householdId],
    references: [households.id],
  }),
  resultados: many(exameResultados),
}));

// ============================================================
// Saúde · Exame Resultados (markers individuais: glicose, ldl, etc)
// ============================================================
export const flagEnum = pgEnum("exame_flag", ["low", "normal", "high", "unknown"]);

export const exameResultados = pgTable(
  "exame_resultado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exameId: uuid("exame_id")
      .notNull()
      .references(() => exames.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    who: text("who").notNull(), // copiado de exames.who pra facilitar query
    examDate: date("exam_date").notNull(), // copiado pra facilitar query/sort
    marker: text("marker").notNull(), // "glicose", "ldl", "hemoglobina", etc (normalizado)
    markerLabel: text("marker_label").notNull(), // texto bonito original ("Glicose", "LDL Colesterol")
    value: numeric("value", { precision: 12, scale: 3 }), // valor numérico (null se qualitativo)
    valueText: text("value_text"), // resultado textual ("Negativo", "Positivo", quando não numérico)
    unit: text("unit"), // "mg/dL", "g/dL", "%"
    refMin: numeric("ref_min", { precision: 12, scale: 3 }),
    refMax: numeric("ref_max", { precision: 12, scale: 3 }),
    refText: text("ref_text"), // referência textual ("até 200", "menor que 100")
    flag: flagEnum("flag").notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [
    index("exame_resultado_household_idx").on(r.householdId, r.who, r.marker, r.examDate),
    index("exame_resultado_exame_idx").on(r.exameId),
  ]
);

export const exameResultadoRelations = relations(exameResultados, ({ one }) => ({
  exame: one(exames, {
    fields: [exameResultados.exameId],
    references: [exames.id],
  }),
  household: one(households, {
    fields: [exameResultados.householdId],
    references: [households.id],
  }),
}));

// ============================================================
// Saúde · Peso (pesagens semanais)
// ============================================================
export const pesagens = pgTable(
  "pesagem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    who: text("who").notNull(), // mesma logica
    weighedOn: date("weighed_on").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }).notNull(),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1 }),
    heightCm: numeric("height_cm", { precision: 5, scale: 1 }), // altura/comprimento (útil pra crianças)
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (p) => [index("pesagem_household_who_date_idx").on(p.householdId, p.who, p.weighedOn)]
);

export const pesagemRelations = relations(pesagens, ({ one }) => ({
  household: one(households, {
    fields: [pesagens.householdId],
    references: [households.id],
  }),
}));

// ============================================================
// Cardápio + livro de receitas
// ============================================================
export const receitas = pgTable(
  "receita",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"), // link original (Insta, YouTube, blog)
    imageUrl: text("image_url"),
    prepTimeMin: integer("prep_time_min"),
    servings: integer("servings"),
    ingredients: text("ingredients"), // 1 ingrediente por linha
    steps: text("steps"), // 1 passo por linha
    notes: text("notes"),
    tags: text("tags"), // CSV: "rápido,vegetariano,frango"
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (r) => [index("receita_household_idx").on(r.householdId, r.createdAt)]
);

export const receitaRelations = relations(receitas, ({ one, many }) => ({
  household: one(households, {
    fields: [receitas.householdId],
    references: [households.id],
  }),
  cardapioEntries: many(cardapioEntries),
}));

export const cardapioEntries = pgTable(
  "cardapio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** 0=segunda .. 6=domingo. Cardápio é atemporal: fixo até mudar. */
    dayOfWeek: integer("day_of_week").notNull(),
    receitaId: uuid("receita_id").references(() => receitas.id, {
      onDelete: "set null",
    }),
    title: text("title"), // fallback quando sem receita vinculada
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (c) => [
    uniqueIndex("cardapio_household_dow_unique").on(c.householdId, c.dayOfWeek),
  ]
);

export const cardapioEntryRelations = relations(cardapioEntries, ({ one }) => ({
  household: one(households, {
    fields: [cardapioEntries.householdId],
    references: [households.id],
  }),
  receita: one(receitas, {
    fields: [cardapioEntries.receitaId],
    references: [receitas.id],
  }),
}));
