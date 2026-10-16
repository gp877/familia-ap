import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-helpers";
import { getTasksDatabase } from "@/lib/workspace";

/** /tarefas abre direto o banco Tarefas. */
export default async function TarefasHome() {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getTasksDatabase({ userId: user.userId, householdId: user.householdId });
  redirect(`/tarefas/${db.id}`);
}
