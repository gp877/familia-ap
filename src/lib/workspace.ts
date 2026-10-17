/**
 * Espaço de trabalho (Tarefas) — regras de leitura e escrita, sem auth nem
 * revalidatePath. Usado pelas server actions (sessão do Google) e pela API
 * de agentes. Quem chama resolve o actor.
 *
 * Acesso: a página tem que ser do household E (do próprio usuário OU
 * compartilhada com a família). Só o dono muda a visibilidade. Filhos herdam
 * a visibilidade do pai na criação; mudar a visibilidade propaga pra árvore.
 * Excluir = archived_at na página e em toda a árvore embaixo, com o MESMO
 * instante (é assim que a restauração sabe o que voltou junto).
 */
import { and, asc, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { users, wsPages } from "@/db/schema";

import {
  type Block,
  type DbSchema,
  type Property,
  type PropValue,
  type View,
  defaultTasksDatabase,
  newId,
  welcomeBlocks,
} from "./workspace-model";

export type WsActor = { userId: string; householdId: string; via?: "app" | "agent" };
export type WsPage = typeof wsPages.$inferSelect;

export class WsError extends Error {}

const stamp = (actor: WsActor) => ({
  updatedAt: new Date(),
  ...(actor.via === "agent" ? { agentUpdatedAt: new Date() } : {}),
});

function canSee(actor: WsActor) {
  return and(
    eq(wsPages.householdId, actor.householdId),
    or(eq(wsPages.ownerId, actor.userId), eq(wsPages.visibility, "household"))
  );
}

export async function getPage(actor: WsActor, id: string, opts: { archived?: boolean } = {}) {
  const page = await db.query.wsPages.findFirst({
    where: and(eq(wsPages.id, id), canSee(actor), opts.archived ? undefined : isNull(wsPages.archivedAt)),
  });
  if (!page) throw new WsError("Página não encontrada");
  return page;
}

/**
 * Cria o espaço inicial (boas-vindas + banco Tarefas) na primeira visita.
 * Idempotente mesmo com requisições simultâneas: índice único (owner, system_key)
 * + ON CONFLICT DO NOTHING.
 */
export async function ensureWorkspace(actor: WsActor) {
  const existing = await db.query.wsPages.findFirst({
    columns: { id: true },
    where: and(eq(wsPages.ownerId, actor.userId), eq(wsPages.systemKey, "tasks")),
  });
  if (existing) return;
  const t = defaultTasksDatabase();
  // espaço inicial é do sistema, mesmo quando a 1ª visita vem da API
  const base = { householdId: actor.householdId, ownerId: actor.userId, createdVia: "app" };
  const conflict = { target: [wsPages.ownerId, wsPages.systemKey], where: sql`system_key IS NOT NULL` };
  await db
    .insert(wsPages)
    .values({ ...base, kind: "page", title: "Comece aqui", icon: "👋", content: welcomeBlocks(), systemKey: "welcome", sortOrder: 0 })
    .onConflictDoNothing(conflict);
  await db
    .insert(wsPages)
    .values({ ...base, kind: "database", title: t.title, icon: t.icon, schema: t.schema, views: t.views, content: [], systemKey: "tasks", sortOrder: 1 })
    .onConflictDoNothing(conflict);
}

/** Banco Tarefas do usuário (o alvo padrão da API). */
export async function getTasksDatabase(actor: WsActor) {
  await ensureWorkspace(actor);
  const page = await db.query.wsPages.findFirst({
    where: and(
      eq(wsPages.householdId, actor.householdId),
      eq(wsPages.ownerId, actor.userId),
      eq(wsPages.systemKey, "tasks"),
      isNull(wsPages.archivedAt)
    ),
  });
  if (!page) throw new WsError("Banco Tarefas não encontrado (está na Lixeira?)");
  return page;
}

/** Páginas e bancos (sem as linhas) pra árvore lateral. */
export async function listTree(actor: WsActor) {
  return db
    .select({
      id: wsPages.id,
      parentId: wsPages.parentId,
      kind: wsPages.kind,
      title: wsPages.title,
      icon: wsPages.icon,
      visibility: wsPages.visibility,
      ownerId: wsPages.ownerId,
      sortOrder: wsPages.sortOrder,
    })
    .from(wsPages)
    .where(and(canSee(actor), isNull(wsPages.archivedAt), inArray(wsPages.kind, ["page", "database"])))
    .orderBy(asc(wsPages.sortOrder), asc(wsPages.createdAt));
}

export async function listRows(actor: WsActor, databaseId: string) {
  return db.query.wsPages.findMany({
    where: and(eq(wsPages.parentId, databaseId), eq(wsPages.kind, "row"), canSee(actor), isNull(wsPages.archivedAt)),
    orderBy: (p, { asc: a }) => [a(p.sortOrder), a(p.createdAt)],
  });
}

/** Subpáginas (não linhas) de uma página. */
export async function listSubpages(actor: WsActor, parentId: string) {
  return db.query.wsPages.findMany({
    columns: { id: true, title: true, icon: true, kind: true },
    where: and(eq(wsPages.parentId, parentId), inArray(wsPages.kind, ["page", "database"]), canSee(actor), isNull(wsPages.archivedAt)),
    orderBy: (p, { asc: a }) => [a(p.sortOrder), a(p.createdAt)],
  });
}

export async function householdPeople(householdId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.householdId, householdId));
}

/** Caminho (ancestrais) até a página, pro "breadcrumb". */
export async function breadcrumbs(actor: WsActor, page: WsPage) {
  const trail: Array<{ id: string; title: string; icon: string | null }> = [];
  let cur: WsPage | undefined = page;
  for (let i = 0; i < 12 && cur?.parentId; i++) {
    cur = await db.query.wsPages.findFirst({ where: and(eq(wsPages.id, cur.parentId), canSee(actor)) });
    if (cur) trail.unshift({ id: cur.id, title: cur.title, icon: cur.icon });
  }
  return trail;
}

async function nextSortOrder(householdId: string, parentId: string | null) {
  const [r] = await db
    .select({ m: sql<number>`coalesce(max(${wsPages.sortOrder}), -1)::int` })
    .from(wsPages)
    .where(and(eq(wsPages.householdId, householdId), parentId ? eq(wsPages.parentId, parentId) : isNull(wsPages.parentId)));
  return (r?.m ?? -1) + 1;
}

export async function createPage(
  actor: WsActor,
  input: {
    parentId?: string | null;
    kind: "page" | "database" | "row";
    title?: string;
    icon?: string | null;
    props?: Record<string, PropValue>;
    content?: Block[];
  }
) {
  let visibility = "private";
  if (input.parentId) {
    const parent = await getPage(actor, input.parentId);
    if (input.kind === "row" && parent.kind !== "database") throw new WsError("Linha só pode ser criada dentro de um banco");
    visibility = parent.visibility;
  } else if (input.kind === "row") {
    throw new WsError("Linha precisa de um banco");
  }
  const isDb = input.kind === "database";
  const [created] = await db
    .insert(wsPages)
    .values({
      householdId: actor.householdId,
      ownerId: actor.userId,
      parentId: input.parentId ?? null,
      kind: input.kind,
      title: (input.title ?? "").slice(0, 300),
      icon: input.icon ?? null,
      content: input.content ?? [],
      props: input.kind === "row" ? (input.props ?? {}) : null,
      schema: isDb ? ({ properties: [] } satisfies DbSchema) : null,
      views: isDb ? ([{ id: newId(), name: "Tabela", type: "table", filters: [], sorts: [] }] satisfies View[]) : null,
      visibility,
      sortOrder: await nextSortOrder(actor.householdId, input.parentId ?? null),
      createdVia: actor.via ?? "app",
    })
    .returning();
  return created;
}

export async function updatePage(
  actor: WsActor,
  id: string,
  patch: { title?: string; icon?: string | null; content?: Block[]; sortOrder?: number }
) {
  await getPage(actor, id);
  const set: Partial<typeof wsPages.$inferInsert> = { ...stamp(actor) };
  if (patch.title !== undefined) set.title = patch.title.slice(0, 300);
  if (patch.icon !== undefined) set.icon = patch.icon ? patch.icon.slice(0, 16) : null;
  if (patch.content !== undefined) set.content = patch.content.slice(0, 2000);
  if (patch.sortOrder !== undefined) set.sortOrder = Math.trunc(patch.sortOrder);
  await db.update(wsPages).set(set).where(eq(wsPages.id, id));
}

/** Grava valores de propriedades numa linha (merge). Valor null apaga. */
export async function setRowProps(actor: WsActor, rowId: string, values: Record<string, PropValue>) {
  const row = await getPage(actor, rowId);
  if (row.kind !== "row" || !row.parentId) throw new WsError("Não é uma linha de banco");
  const dbPage = await getPage(actor, row.parentId);
  const schema = (dbPage.schema as DbSchema) ?? { properties: [] };
  const next = { ...((row.props as Record<string, PropValue>) ?? {}) };
  for (const [propId, raw] of Object.entries(values)) {
    const prop = schema.properties.find((p) => p.id === propId);
    if (!prop) throw new WsError(`Propriedade "${propId}" não existe`);
    const v = coerce(prop, raw);
    if (v == null) delete next[propId];
    else next[propId] = v;
  }
  await db.update(wsPages).set({ props: next, ...stamp(actor) }).where(eq(wsPages.id, rowId));
  return next;
}

/** Valida/normaliza um valor conforme o tipo da propriedade. */
export function coerce(prop: Property, raw: PropValue): PropValue {
  if (raw == null || raw === "") return null;
  const optIds = new Set((prop.options ?? []).map((o) => o.id));
  switch (prop.type) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new WsError(`"${prop.name}" precisa ser número`);
      return n;
    }
    case "checkbox":
      return raw === true || raw === "true";
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new WsError(`"${prop.name}" precisa ser data AAAA-MM-DD`);
      return s;
    }
    case "select":
    case "status": {
      const s = String(raw);
      if (!optIds.has(s)) throw new WsError(`Opção inválida em "${prop.name}"`);
      return s;
    }
    case "multi_select": {
      const arr = (Array.isArray(raw) ? raw : [String(raw)]).map(String).filter((x) => optIds.has(x));
      return arr.length ? arr : null;
    }
    case "url":
    case "text":
    case "person":
      return String(raw).slice(0, 2000);
  }
}

export async function updateDatabase(actor: WsActor, dbId: string, patch: { schema?: DbSchema; views?: View[] }) {
  const page = await getPage(actor, dbId);
  if (page.kind !== "database") throw new WsError("Não é um banco");
  const set: Partial<typeof wsPages.$inferInsert> = { ...stamp(actor) };
  if (patch.schema) {
    if (!Array.isArray(patch.schema.properties)) throw new WsError("Schema inválido");
    set.schema = { properties: patch.schema.properties.slice(0, 60) };
  }
  if (patch.views) {
    if (!patch.views.length) throw new WsError("O banco precisa de ao menos uma visualização");
    set.views = patch.views.slice(0, 30);
  }
  await db.update(wsPages).set(set).where(eq(wsPages.id, dbId));
}

/** Ids da página e de todos os descendentes (CTE recursiva). */
async function subtreeIds(rootId: string, householdId: string) {
  const res = await db.execute(sql`
    with recursive t as (
      select id from ws_page where id = ${rootId}::uuid and household_id = ${householdId}::uuid
      union all
      select p.id from ws_page p join t on p.parent_id = t.id
    ) select id from t`);
  return (res.rows as Array<{ id: string }>).map((r) => r.id);
}

/** Exclui (Lixeira): a página e toda a árvore embaixo, com o mesmo instante. */
export async function archivePage(actor: WsActor, id: string) {
  await getPage(actor, id);
  const ids = await subtreeIds(id, actor.householdId);
  const when = new Date();
  await db
    .update(wsPages)
    .set({ archivedAt: when, archivedVia: actor.via ?? "app" })
    .where(and(inArray(wsPages.id, ids), isNull(wsPages.archivedAt)));
  return { archived: ids.length };
}

/** Restaura a página e o que foi pra Lixeira junto com ela. */
export async function restorePage(actor: WsActor, id: string) {
  const page = await getPage(actor, id, { archived: true });
  if (!page.archivedAt) return { restored: 0 };
  if (page.parentId) {
    const parent = await db.query.wsPages.findFirst({ columns: { archivedAt: true }, where: eq(wsPages.id, page.parentId) });
    if (parent?.archivedAt) throw new WsError("A página-mãe também está na Lixeira: restaure ela primeiro");
  }
  const ids = await subtreeIds(id, actor.householdId);
  const r = await db
    .update(wsPages)
    .set({ archivedAt: null, archivedVia: null, updatedAt: new Date() })
    .where(and(inArray(wsPages.id, ids), eq(wsPages.archivedAt, page.archivedAt)))
    .returning({ id: wsPages.id });
  return { restored: r.length };
}

/** Apaga DE VEZ (só pelas telas). Filhos vão junto pela FK em cascata. */
export async function purgePage(actor: WsActor, id: string) {
  const page = await getPage(actor, id, { archived: true });
  if (!page.archivedAt) throw new WsError("Só dá pra apagar de vez o que está na Lixeira");
  await db.delete(wsPages).where(eq(wsPages.id, id));
}

/** Itens na Lixeira: só as "raízes" (o que foi excluído, não os filhos que foram junto). */
export async function listArchived(actor: WsActor) {
  const rows = await db.query.wsPages.findMany({
    columns: { id: true, title: true, icon: true, kind: true, parentId: true, archivedAt: true, archivedVia: true },
    where: and(canSee(actor), isNotNull(wsPages.archivedAt)),
    orderBy: (p, { desc }) => [desc(p.archivedAt)],
    limit: 500,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.filter((r) => {
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    return !(parent && parent.archivedAt?.getTime() === r.archivedAt?.getTime());
  });
}

/** Compartilhar/descompartilhar (só o dono). Propaga pra toda a árvore. */
export async function setVisibility(actor: WsActor, id: string, visibility: "private" | "household") {
  const page = await getPage(actor, id);
  if (page.ownerId !== actor.userId) throw new WsError("Só quem criou a página pode mudar o compartilhamento");
  const ids = await subtreeIds(id, actor.householdId);
  await db.update(wsPages).set({ visibility, updatedAt: new Date() }).where(inArray(wsPages.id, ids));
}
