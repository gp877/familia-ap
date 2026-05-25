import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function requireUserAndHousehold() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return {
    userId: dbUser.id,
    householdId: dbUser.householdId,
    email: dbUser.email,
    name: dbUser.name,
  };
}
