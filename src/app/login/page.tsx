import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/actions/auth";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-semibold">
            AP
          </div>
          <CardTitle>Família AP</CardTitle>
          <CardDescription>
            Plataforma privada da família. Acesso só por convite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogle}>
            <Button type="submit" className="w-full" size="lg">
              Entrar com Google
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sua sessão é gerenciada pelo Google. Não armazenamos sua senha.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
