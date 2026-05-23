import type { InferInsertModel } from "drizzle-orm";

import type { categories } from "./schema";

type CategoryInsert = InferInsertModel<typeof categories>;
type SeedCategory = Omit<CategoryInsert, "householdId" | "parentId"> & {
  children?: Array<Omit<CategoryInsert, "householdId" | "parentId">>;
};

/**
 * Conjunto inicial de categorias brasileiras comuns para famílias.
 * Inserido junto com a criação do household no primeiro login do casal.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // ============ DESPESAS ============
  {
    name: "Alimentação",
    kind: "expense",
    icon: "utensils",
    color: "#ef4444",
    children: [
      { name: "Mercado", kind: "expense" },
      { name: "Restaurante / Delivery", kind: "expense" },
      { name: "Padaria / Café", kind: "expense" },
    ],
  },
  {
    name: "Transporte",
    kind: "expense",
    icon: "car",
    color: "#f59e0b",
    children: [
      { name: "Combustível", kind: "expense" },
      { name: "Uber / 99 / Táxi", kind: "expense" },
      { name: "Estacionamento", kind: "expense" },
      { name: "Pedágio", kind: "expense" },
      { name: "Manutenção / Oficina", kind: "expense" },
    ],
  },
  {
    name: "Moradia",
    kind: "expense",
    icon: "home",
    color: "#3b82f6",
    children: [
      { name: "Aluguel / Financiamento", kind: "expense" },
      { name: "Condomínio", kind: "expense" },
      { name: "Energia elétrica", kind: "expense" },
      { name: "Água", kind: "expense" },
      { name: "Gás", kind: "expense" },
      { name: "Internet / TV", kind: "expense" },
      { name: "Manutenção da casa", kind: "expense" },
    ],
  },
  {
    name: "Saúde",
    kind: "expense",
    icon: "heart-pulse",
    color: "#ec4899",
    children: [
      { name: "Plano de saúde", kind: "expense" },
      { name: "Farmácia", kind: "expense" },
      { name: "Médico / Exames", kind: "expense" },
      { name: "Dentista", kind: "expense" },
      { name: "Academia / Esporte", kind: "expense" },
    ],
  },
  {
    name: "Educação",
    kind: "expense",
    icon: "graduation-cap",
    color: "#8b5cf6",
    children: [
      { name: "Escola / Faculdade", kind: "expense" },
      { name: "Cursos", kind: "expense" },
      { name: "Livros / Material", kind: "expense" },
    ],
  },
  {
    name: "Lazer",
    kind: "expense",
    icon: "sparkles",
    color: "#06b6d4",
    children: [
      { name: "Streaming (Netflix, Spotify, etc.)", kind: "expense" },
      { name: "Cinema / Shows", kind: "expense" },
      { name: "Viagens", kind: "expense" },
      { name: "Hobbies", kind: "expense" },
    ],
  },
  {
    name: "Vestuário",
    kind: "expense",
    icon: "shirt",
    color: "#a855f7",
  },
  {
    name: "Cuidados pessoais",
    kind: "expense",
    icon: "sparkles",
    color: "#ec4899",
    children: [
      { name: "Salão / Barbearia", kind: "expense" },
      { name: "Cosméticos", kind: "expense" },
    ],
  },
  {
    name: "Filhos",
    kind: "expense",
    icon: "baby",
    color: "#f97316",
    children: [
      { name: "Escola", kind: "expense" },
      { name: "Atividades extras", kind: "expense" },
      { name: "Brinquedos / Roupas", kind: "expense" },
    ],
  },
  {
    name: "Pets",
    kind: "expense",
    icon: "paw-print",
    color: "#84cc16",
    children: [
      { name: "Ração / Petisco", kind: "expense" },
      { name: "Veterinário", kind: "expense" },
    ],
  },
  {
    name: "Impostos e taxas",
    kind: "expense",
    icon: "receipt",
    color: "#64748b",
  },
  {
    name: "Investimentos (aportes)",
    kind: "expense",
    icon: "trending-up",
    color: "#10b981",
  },
  {
    name: "Doações",
    kind: "expense",
    icon: "heart",
    color: "#f43f5e",
  },
  {
    name: "Outros",
    kind: "expense",
    icon: "more-horizontal",
    color: "#64748b",
  },

  // ============ RECEITAS ============
  {
    name: "Salário",
    kind: "income",
    icon: "wallet",
    color: "#22c55e",
  },
  {
    name: "Renda extra / Freela",
    kind: "income",
    icon: "briefcase",
    color: "#16a34a",
  },
  {
    name: "Rendimentos de investimentos",
    kind: "income",
    icon: "trending-up",
    color: "#10b981",
  },
  {
    name: "Reembolsos",
    kind: "income",
    icon: "rotate-ccw",
    color: "#06b6d4",
  },
  {
    name: "Outras receitas",
    kind: "income",
    icon: "circle-dollar-sign",
    color: "#65a30d",
  },
];
