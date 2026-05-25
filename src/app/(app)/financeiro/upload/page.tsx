import { asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, users } from "@/db/schema";
import { UploadClient } from "./upload-client";

export default async function UploadPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const accounts = await db.query.bankAccounts.findMany({
    where: eq(bankAccounts.householdId, dbUser.householdId),
    orderBy: [asc(bankAccounts.type), asc(bankAccounts.name)],
  });

  return (
    <UploadClient
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
      }))}
    />
  );
}
