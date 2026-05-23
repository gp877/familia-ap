import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { MobileTop } from "@/components/ap/mobile-top";
import { WebSidebar } from "@/components/ap/web-sidebar";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  let partnerName: string | null = null;
  if (session.user.id) {
    const me = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (me?.householdId) {
      const householdUsers = await db.query.users.findMany({
        where: eq(users.householdId, me.householdId),
      });
      const partner = householdUsers.find((u) => u.id !== session.user!.id);
      partnerName = partner?.name?.split(" ")[0] ?? null;
    }
  }

  const myFirstName = session.user.name?.split(" ")[0] ?? null;

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <WebSidebar userName={myFirstName} partnerName={partnerName} />
      <div className="flex min-h-screen flex-1 flex-col" style={{ minWidth: 0 }}>
        <MobileTop />
        <main className="flex-1" style={{ minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
