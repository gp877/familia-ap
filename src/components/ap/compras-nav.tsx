import { ModuleNavBar } from "@/components/ap/module-nav";

/** Módulos de Compras: o Radar (pesquisa de preço) e o Supermercado (contagem → pedido). */
export function ComprasNav() {
  return (
    <ModuleNavBar
      items={[
        { href: "/compras", label: "📡 Radar de Compras" },
        { href: "/supermercado", label: "🛒 Supermercado", match: ["/supermercado"] },
      ]}
    />
  );
}
