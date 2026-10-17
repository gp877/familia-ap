import { notFound } from "next/navigation";

import { BlockEditor } from "@/components/ws/block-editor";
import { DatabaseView } from "@/components/ws/database-view";
import { PageHeader } from "@/components/ws/page-header";
import { RowProps } from "@/components/ws/row-props";
import { getCurrentUser } from "@/lib/auth-helpers";
import { WsError, breadcrumbs, getPage, householdPeople, listRows, listSubpages } from "@/lib/workspace";
import type { Block, DbSchema, PropValue, View } from "@/lib/workspace-model";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WsPageRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = { userId: user.userId, householdId: user.householdId };

  let page;
  try {
    page = await getPage(actor, id);
  } catch (e) {
    if (e instanceof WsError) notFound();
    throw e;
  }

  const [crumbs, subpages, people] = await Promise.all([
    breadcrumbs(actor, page),
    listSubpages(actor, page.id),
    householdPeople(user.householdId),
  ]);
  const peopleLite = people.map((p) => ({ id: p.id, name: p.name }));
  const dbPage = page.kind === "row" && page.parentId ? await getPage(actor, page.parentId).catch(() => null) : null;
  const rows = page.kind === "database" ? await listRows(actor, page.id) : [];
  const views = (page.views as View[] | null) ?? [];

  return (
    <div style={{ maxWidth: page.kind === "database" ? "none" : 860, margin: "0 auto", padding: page.kind === "database" ? "16px 24px 40px" : "16px 20px 40px" }}>
      <PageHeader
        id={page.id}
        title={page.title}
        icon={page.icon}
        kind={page.kind}
        visibility={page.visibility}
        isOwner={page.ownerId === user.userId}
        createdByAgent={page.createdVia === "agent" && !page.systemKey}
        agentUpdatedAt={page.agentUpdatedAt ? page.agentUpdatedAt.toISOString() : null}
        crumbs={crumbs}
      />

      {dbPage && (
        <RowProps
          dbId={dbPage.id}
          rowId={page.id}
          schema={(dbPage.schema as DbSchema) ?? { properties: [] }}
          props={(page.props as Record<string, PropValue>) ?? {}}
          people={peopleLite}
        />
      )}

      {page.kind === "database" ? (
        <DatabaseView
          key={page.id}
          dbId={page.id}
          schema={(page.schema as DbSchema) ?? { properties: [] }}
          views={views.length ? views : [{ id: "default", name: "Tabela", type: "table", filters: [], sorts: [] }]}
          people={peopleLite}
          rows={rows.map((r) => ({
            id: r.id,
            title: r.title,
            icon: r.icon,
            props: (r.props as Record<string, PropValue>) ?? {},
            sortOrder: r.sortOrder,
            createdAt: r.createdAt.toISOString(),
            createdVia: r.createdVia,
            agentUpdatedAt: r.agentUpdatedAt ? r.agentUpdatedAt.toISOString() : null,
            content: (r.content as Block[] | null) ?? [],
          }))}
        />
      ) : (
        <BlockEditor
          key={page.id}
          pageId={page.id}
          initial={(page.content as Block[] | null) ?? []}
          subpages={subpages.map((s) => ({ id: s.id, title: s.title, icon: s.icon }))}
        />
      )}
    </div>
  );
}
