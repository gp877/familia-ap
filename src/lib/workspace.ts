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
import { and, asc, eq, inArray, isNull, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { users, wsActivity, wsPages } from "@/db/schema";

import {
  type Block,
  type DbSchema,
  type Property,
  type PropValue,
  type View,
  defaultTasksDatabase,
  radarDatabase,
  newId,
  welcomeBlocks,
  COLORS,
} from "./workspace-model";

export type WsActor = { userId: string; householdId: string; via?: "app" | "agent" };
export type WsPage = typeof wsPages.$inferSelect;

export class WsError extends Error {}

const stamp = (actor: WsActor) => ({
  updatedAt: new Date(),
  ...(actor.via === "agent" ? { agentUpdatedAt: new Date() } : {}),
});

/** Anota uma atividade (nunca derruba a operação principal se falhar). */
async function logActivity(
  actor: WsActor,
  page: { id: string; ownerId: string; parentId: string | null; title: string; props: unknown; kind: string },
  type: "created" | "completed" | "reopened" | "archived" | "restored"
) {
  try {
    await db.insert(wsActivity).values({
      householdId: actor.householdId,
      ownerId: page.ownerId,
      pageId: page.id,
      databaseId: page.kind === "row" ? page.parentId : null,
      type,
      title: page.title,
      props: page.props ?? null,
      via: actor.via ?? "app",
      userId: actor.userId,
    });
  } catch (e) {
    console.error("[workspace] registro de atividade falhou:", e);
  }
}

/** Opções de status do grupo "Concluído". */
function doneOptionIds(schema: DbSchema) {
  const status = schema.properties.find((p) => p.type === "status");
  return { status, done: new Set((status?.options ?? []).filter((o) => o.group === "done").map((o) => o.id)) };
}

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

/**
 * Banco "de sistema" (systemKey) do usuário que não mora na árvore de Tarefas — ex.: "radar"
 * (módulo Compras). Cria na 1ª vez a partir do modelo.
 */
export async function getSystemDatabase(actor: WsActor, key: "radar") {
  const find = () =>
    db.query.wsPages.findFirst({
      where: and(eq(wsPages.householdId, actor.householdId), eq(wsPages.ownerId, actor.userId), eq(wsPages.systemKey, key), isNull(wsPages.archivedAt)),
    });
  const found = await find();
  if (found) return found;
  const t = radarDatabase();
  await db
    .insert(wsPages)
    .values({ householdId: actor.householdId, ownerId: actor.userId, createdVia: "app", kind: "database", title: t.title, icon: t.icon, schema: t.schema, views: t.views, content: [], systemKey: key, sortOrder: 99 })
    .onConflictDoNothing({ target: [wsPages.ownerId, wsPages.systemKey], where: sql`system_key IS NOT NULL` });
  const created = await find();
  if (!created) throw new WsError("Radar de Compras não encontrado (está na Lixeira?)");
  return created;
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
    .where(
      and(
        canSee(actor),
        isNull(wsPages.archivedAt),
        inArray(wsPages.kind, ["page", "database"]),
        or(isNull(wsPages.systemKey), ne(wsPages.systemKey, "radar")) // Radar mora em Compras
      )
    )
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
  if (created.kind === "row") await logActivity(actor, created, "created");
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

  // concluiu / reabriu? (mudou de/para uma opção do grupo "Concluído")
  const { status, done } = doneOptionIds(schema);
  if (status && status.id in values) {
    const before = done.has(String((row.props as Record<string, PropValue> | null)?.[status.id] ?? ""));
    const after = done.has(String(next[status.id] ?? ""));
    if (before !== after) await logActivity(actor, { ...row, props: next }, after ? "completed" : "reopened");
  }
  return next;
}

/**
 * Arrastar no quadro: grava valores (ex.: a coluna nova) e a ordem final da
 * coluna de uma vez. `orderedIds` = todas as linhas da coluna, na ordem nova.
 */
export async function moveRow(
  actor: WsActor,
  rowId: string,
  values: Record<string, PropValue> | null,
  orderedIds: string[]
) {
  if (values && Object.keys(values).length) await setRowProps(actor, rowId, values);
  const row = await getPage(actor, rowId);
  const ids = [...new Set(orderedIds)].slice(0, 500);
  if (!ids.length) return;
  const own = await db
    .select({ id: wsPages.id })
    .from(wsPages)
    .where(and(inArray(wsPages.id, ids), eq(wsPages.parentId, row.parentId!), canSee(actor)));
  const ok = new Set(own.map((r) => r.id));
  const ordered = ids.filter((id) => ok.has(id));
  if (!ordered.length) return;
  await db.execute(sql`
    update ws_page as p set sort_order = v.ord, updated_at = now()
    from (values ${sql.join(ordered.map((id, i) => sql`(${id}::uuid, ${(i + 1) * 10}::int)`), sql`, `)}) as v(id, ord)
    where p.id = v.id`);
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
  const page = await getPage(actor, id, { archived: true });
  await logActivity(actor, page, "archived");
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
  if (r.length) await logActivity(actor, page, "restored");
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

/**
 * Dados da aba Registro: eventos dos últimos N dias (do dono) + linhas do banco
 * Tarefas (pra "abertas agora" e pra concluídas antigas sem evento).
 */
export async function activityReport(actor: WsActor, days = 60) {
  const since = new Date(Date.now() - days * 864e5);
  const [events, tasksDb] = await Promise.all([
    db.query.wsActivity.findMany({
      where: and(
        eq(wsActivity.householdId, actor.householdId),
        eq(wsActivity.ownerId, actor.userId),
        sql`${wsActivity.createdAt} >= ${since}`
      ),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
      limit: 3000,
    }),
    getTasksDatabase(actor).catch(() => null),
  ]);
  const rows = tasksDb ? await listRows(actor, tasksDb.id) : [];
  return { events, tasksDb, rows };
}

/**
 * Cria uma opção (nome) numa propriedade de escolha lendo o esquema ATUAL do banco — nunca uma cópia
 * da tela. Nome igual a um existente reaproveita (e desarquiva). `id` opcional vem da tela para a
 * etiqueta aparecer na hora sem piscar.
 */
export async function addOption(actor: WsActor, dbId: string, propId: string, name: string, id?: string) {
  const page = await getPage(actor, dbId);
  if (page.kind !== "database") throw new WsError("Não é um banco");
  const schema = structuredClone((page.schema as DbSchema) ?? { properties: [] });
  const prop = schema.properties.find((p) => p.id === propId);
  if (!prop || !["select", "multi_select", "status"].includes(prop.type)) throw new WsError("Essa propriedade não tem opções");
  const nome = name.trim().slice(0, 60);
  if (!nome) throw new WsError("Nome vazio");
  prop.options ??= [];
  const igual = prop.options.find((o) => o.name.trim().toLowerCase() === nome.toLowerCase());
  if (igual) {
    if (igual.archived) {
      delete igual.archived;
      await updateDatabase(actor, dbId, { schema });
    }
    return igual.id;
  }
  const optId = id && /^[A-Za-z0-9_-]{6,40}$/.test(id) && !prop.options.some((o) => o.id === id) ? id : newId();
  prop.options.push({ id: optId, name: nome, color: COLORS[1 + (prop.options.length % (COLORS.length - 1))], ...(prop.type === "status" ? { group: "todo" as const } : {}) });
  await updateDatabase(actor, dbId, { schema });
  return optId;
}

/** Arquiva (some das listas de escolha) ou devolve uma opção, lendo o esquema atual. */
export async function setOptionArchived(actor: WsActor, dbId: string, propId: string, optId: string, archived: boolean) {
  const page = await getPage(actor, dbId);
  if (page.kind !== "database") throw new WsError("Não é um banco");
  const schema = structuredClone((page.schema as DbSchema) ?? { properties: [] });
  const opt = schema.properties.find((p) => p.id === propId)?.options?.find((o) => o.id === optId);
  if (!opt) throw new WsError("Opção não encontrada");
  if (archived) opt.archived = true;
  else delete opt.archived;
  await updateDatabase(actor, dbId, { schema });
}

/**
 * "▶ Executar agora" da fila da IA: marca no banco a hora do pedido. O PC (Zap Local, rotina
 * arrastao.mjs a cada 5 min) vê pela API, executa e limpa a marca.
 */
export async function requestAiRun(actor: WsActor, dbId: string, clear = false) {
  const page = await getPage(actor, dbId);
  if (page.kind !== "database") throw new WsError("Não é um banco");
  const props = { ...((page.props as Record<string, PropValue> | null) ?? {}) };
  if (clear) delete props.ai_run_requested_at;
  else props.ai_run_requested_at = new Date().toISOString();
  await db.update(wsPages).set({ props }).where(eq(wsPages.id, dbId));
  return clear ? null : (props.ai_run_requested_at as string);
}

