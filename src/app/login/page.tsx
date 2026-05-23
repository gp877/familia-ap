import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/actions/auth";
import { Logo } from "@/components/ap/logo";
import { auth } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-5"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div
          style={{
            background: "var(--surf)",
            borderRadius: 24,
            padding: "36px 28px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Logo variant="casa" size={88} />
          <p
            style={{
              marginTop: 28,
              fontSize: 14,
              color: "var(--muted-d)",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 280,
            }}
          >
            Plataforma privada da família. Acesso só por convite — login com a
            conta Google autorizada.
          </p>

          <form action={signInWithGoogle} style={{ width: "100%", marginTop: 24 }}>
            <button
              type="submit"
              style={{
                width: "100%",
                height: 46,
                borderRadius: 23,
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "-0.005em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <GoogleLogo size={18} />
              Entrar com Google
            </button>
          </form>

          <p
            style={{
              marginTop: 18,
              fontSize: 11,
              color: "var(--muted)",
              textAlign: "center",
            }}
          >
            Sua sessão é gerenciada pelo Google · senha nunca passa por aqui
          </p>
        </div>

        <p
          style={{
            marginTop: 18,
            fontSize: 11,
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          acesso restrito · só os emails autorizados conseguem entrar
        </p>
      </div>
    </div>
  );
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v3.2h5.36c-.5 2.4-2.5 4.1-5.36 4.1A6 6 0 0112 6.4c1.5 0 2.85.5 3.9 1.45l2.4-2.4A9.4 9.4 0 0012 3a9 9 0 100 18c5.2 0 8.6-3.65 8.6-8.8 0-.4-.05-.75-.1-1.1z"
      />
    </svg>
  );
}
