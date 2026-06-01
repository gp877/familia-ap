import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Família AP",
  description: "Site da Família AP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
      data-accent="lima"
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {/* Roda ANTES do React hydratar: desabilita scroll restoration
            do browser e snapa pro topo. Resolve "página abre no meio"
            que acontecia porque o navegador restaurava posição antiga
            antes do ScrollTopOnNav (cliente) mount.

            Next 16 + React 19 não aceitam <script> raw em componente —
            tem que usar o componente Script de next/script. */}
        <Script id="scroll-restoration-init" strategy="beforeInteractive">
          {`
            try {
              if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
              if (!location.hash) window.scrollTo(0, 0);
            } catch (e) {}
          `}
        </Script>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
