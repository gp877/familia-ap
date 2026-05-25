import type { IconName } from "@/components/ap/icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  module: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "home", module: "Início" },
  { href: "/financeiro", label: "Finanças", icon: "bank", module: "Finanças" },
  { href: "/compromissos", label: "Compromissos", icon: "cal", module: "Compromissos" },
  { href: "/aniversarios", label: "Aniversários", icon: "cake", module: "Aniversários" },
  { href: "/viagens", label: "Viagens", icon: "plane", module: "Viagens" },
  { href: "/sonhos", label: "Sonhos", icon: "star", module: "Sonhos" },
  { href: "/supermercado", label: "Supermercado", icon: "bag", module: "Supermercado" },
  { href: "/saude-exames", label: "Saúde", icon: "mask", module: "Saúde" },
  { href: "/chat", label: "Chat com a AP", icon: "spark", module: "Chat" },
];
