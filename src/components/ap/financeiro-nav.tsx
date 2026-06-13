"use client";

import { ModuleNav, type ModuleNavItem } from "@/components/ap/module-nav";

const ITEMS: ModuleNavItem[] = [
  { href: "/financeiro", label: "Resumo" },
  {
    href: "/financeiro/documentos",
    label: "Documentos",
    // Faturas, extratos e upload "pertencem" a Documentos na navegação
    match: ["/financeiro/faturas", "/financeiro/extratos", "/financeiro/upload"],
  },
  { href: "/financeiro/transacoes", label: "Transações" },
  { href: "/financeiro/dashboard", label: "Dashboard" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/orcamento", label: "Orçamento" },
  { href: "/financeiro/recorrentes", label: "Recorrentes" },
  { href: "/financeiro/categorias", label: "Categorias" },
  { href: "/financeiro/contas", label: "Contas" },
];

export function FinanceiroNav() {
  return <ModuleNav items={ITEMS} />;
}
