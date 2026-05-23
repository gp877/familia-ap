import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Home,
  MoreHorizontal,
  Scale,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export const navItems: NavItem[] = [
  { title: "Início", href: "/", icon: Home },
  { title: "Financeiro", href: "/financeiro", icon: Wallet },
  { title: "Chat IA", href: "/chat", icon: Bot, comingSoon: true },
  { title: "Peso & Saúde", href: "/peso", icon: Scale, comingSoon: true },
  { title: "Metas", href: "/metas", icon: Target, comingSoon: true },
  { title: "Sonhos", href: "/sonhos", icon: Sparkles, comingSoon: true },
  { title: "Outros", href: "/outros", icon: MoreHorizontal, comingSoon: true },
];
