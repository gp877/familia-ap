import type { IconName } from "@/components/ap/icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  module: string; // nome do "módulo" exibido no header mobile
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Casa", icon: "home", module: "Casa" },
  { href: "/financeiro", label: "Finanças", icon: "bag", module: "Finanças" },
  { href: "/saude-exames", label: "Saúde", icon: "mask", module: "Saúde" },
  { href: "/sonhos", label: "Sonhos", icon: "star", module: "Sonhos" },
  { href: "/viagens", label: "Viagens", icon: "plane", module: "Viagens" },
  { href: "/calendario", label: "Calendário", icon: "cal", module: "Calendário" },
  { href: "/aniversarios", label: "Aniversários", icon: "cake", module: "Aniversários" },
];
