import { desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { appNotifications, users } from "@/db/schema";

import { NotificationBell } from "./notification-bell";

/**
 * Server wrapper que busca as notificações in-app do household logado
 * e renderiza o sino. Limita a 20 últimas pra não inflar o popover.
 */
export async function NotificationBellWrapper() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const rows = await db.query.appNotifications.findMany({
    where: eq(appNotifications.householdId, dbUser.householdId),
    orderBy: [desc(appNotifications.createdAt)],
    limit: 20,
  });

  const notifications = rows.map((n) => ({
    id: n.id,
    type: n.type as string,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationBell notifications={notifications} />;
}
