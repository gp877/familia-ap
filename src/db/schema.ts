import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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

// ============================================================
// Household — a família é compartilhada por múltiplos users
// ============================================================
export const households = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Auth.js tables (formato esperado pelo @auth/drizzle-adapter)
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
// Categorias hierárquicas (categoria > subcategoria via parent_id)
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (c) => [index("category_household_idx").on(c.householdId)]
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
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    sourceType: uploadSourceEnum("source_type").notNull(),
    bankSlug: text("bank_slug"),
    status: uploadStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (u) => [
    index("upload_household_status_idx").on(u.householdId, u.status),
  ]
);

// ============================================================
// Transações
// ============================================================
export const transactions = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
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
    status: transactionStatusEnum("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_household_date_idx").on(t.householdId, t.occurredOn),
    index("transaction_household_category_idx").on(t.householdId, t.categoryId),
    index("transaction_household_status_idx").on(t.householdId, t.status),
  ]
);

// ============================================================
// Regras de auto-categorização (descrição → categoria)
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
  (r) => [
    index("rule_household_pattern_idx").on(r.householdId, r.pattern),
  ]
);

// ============================================================
// Agente IA — threads, mensagens, memória persistente
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
// Relations (para queries com joins via Drizzle relational API)
// ============================================================
export const householdRelations = relations(households, ({ many }) => ({
  members: many(users),
  categories: many(categories),
  transactions: many(transactions),
  uploads: many(uploads),
  rules: many(categoryRules),
  threads: many(threads),
  memories: many(memories),
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
