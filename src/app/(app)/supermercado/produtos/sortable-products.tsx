"use client";

import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { DragHandle, SortableList } from "@/components/ap/sortable-list";
import { deleteItem, patchItem, reorderItems } from "@/app/actions/supermercado";

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  location: string | null;
  category: string | null;
  unit: string;
  minStock: string | null;
  currentStock: string | null;
};

export function SortableProductsList({ items }: { items: ProductRow[] }) {
  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <SortableList
      items={items.map((i) => ({ id: i.id }))}
      action={reorderItems}
      renderItem={(id, isDragging) => {
        const item = byId.get(id);
        if (!item) return null;
        const min = item.minStock ? parseFloat(item.minStock) : null;
        const cur = item.currentStock ? parseFloat(item.currentStock) : 0;
        const low = min !== null && cur < min;
        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr",
              alignItems: "start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 12,
              background: isDragging ? "var(--card2)" : "var(--card)",
              border: `0.5px solid ${low ? "var(--alert)" : "var(--line-d)"}`,
            }}
          >
            <div style={{ paddingTop: 4 }}>
              <DragHandle />
            </div>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Linha 1: nome + marca */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineEditInput
                    initialValue={item.name}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="name"
                    fontSize={13.5}
                    fontWeight={700}
                  />
                </div>
                <DeleteBtn
                  action={deleteItem.bind(null, item.id)}
                  confirmMsg={null}
                />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
                  marca
                </span>
                <div style={{ flex: 1 }}>
                  <InlineEditInput
                    initialValue={item.brand ?? ""}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="brand"
                    placeholder="(qualquer)"
                    fontSize={12}
                    color="var(--muted-d)"
                  />
                </div>
              </div>

              {/* Linha 2: localização + categoria + unidade */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 60px",
                  gap: 6,
                  alignItems: "baseline",
                  fontSize: 11,
                }}
              >
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    localização
                  </div>
                  <InlineEditInput
                    initialValue={item.location ?? ""}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="location"
                    placeholder="—"
                    fontSize={12}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    categoria
                  </div>
                  <InlineEditInput
                    initialValue={item.category ?? ""}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="category"
                    placeholder="—"
                    fontSize={12}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    unid.
                  </div>
                  <InlineEditInput
                    initialValue={item.unit}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="unit"
                    fontSize={12}
                  />
                </div>
              </div>

              {/* Linha 3: stocks */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  paddingTop: 4,
                  borderTop: "0.5px solid var(--line-d)",
                  marginTop: 2,
                }}
              >
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    estoque mínimo
                  </div>
                  <InlineEditInput
                    initialValue={item.minStock ?? ""}
                    action={patchItem}
                    hiddenFields={{ id: item.id }}
                    fieldName="minStock"
                    placeholder="—"
                    fontSize={13}
                    fontWeight={700}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    estoque atual
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <InlineEditInput
                      initialValue={item.currentStock ?? ""}
                      action={patchItem}
                      hiddenFields={{ id: item.id }}
                      fieldName="currentStock"
                      placeholder="—"
                      fontSize={13}
                      fontWeight={700}
                      color={low ? "var(--alert)" : "var(--ink)"}
                    />
                    {low && (
                      <span style={{ fontSize: 9, color: "var(--alert)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        baixo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
