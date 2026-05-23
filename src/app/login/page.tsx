import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand-mark";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-cream p-4">
      {/* Ornamentos de fundo */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(at 22% 18%, oklch(0.92 0.10 35 / 0.65) 0%, transparent 50%), radial-gradient(at 80% 92%, oklch(0.92 0.08 195 / 0.45) 0%, transparent 55%), radial-gradient(at 60% 50%, oklch(0.95 0.05 75 / 0.45) 0%, transparent 70%)",
        }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-40" />

      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border/60 bg-card/85 p-8 shadow-warm-lg backdrop-blur-md sm:p-10">
          <div className="flex flex-col items-center text-center">
            <BrandMark size="2xl" />
            <h1 className="mt-7 font-display text-5xl leading-none">
              Olá! <span className="italic">Família AP</span>
            </h1>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Um espaço para a família organizar dinheiro, sonhos e tudo mais —
              com a ajuda de uma IA que conhece o contexto de vocês.
            </p>
          </div>

          <form action={signInWithGoogle} className="mt-8">
            <Button
              type="submit"
              size="lg"
              className="w-full bg-gradient-brand text-white hover:opacity-95"
            >
              <GoogleLogo className="size-5" />
              Entrar com Google
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Sua sessão é gerenciada pelo Google. Nunca armazenamos sua senha.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          Acesso restrito · Apenas emails autorizados pela família entram
        </p>
      </div>
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.30c-1.65 4.66-6.08 8-11.30 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="M6.31 14.69l6.57 4.82C14.65 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.16 0 9.86-1.98 13.41-5.20l-6.19-5.24C29.21 35.09 26.71 36 24 36c-5.20 0-9.61-3.31-11.28-7.93l-6.52 5.02C9.50 39.55 16.23 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.30c-.79 2.23-2.23 4.15-4.09 5.56.01-.01.01-.01.02-.02l6.19 5.24C36.97 39.04 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  );
}
