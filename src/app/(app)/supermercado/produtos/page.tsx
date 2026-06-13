import { asc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createItem,
  deleteItem,
  patchItem,
  reorderItems,
} from "@/app/actions/supermercado";
import { SortableProductsList } from "./sortable-products";
import { auth } from "@/auth";
import { db } from "@/db";
import { supermercadoItens, users } from "@/db/schema";

export default async function ProdutosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const items = await db.query.supermercadoItens.findMany({
    where: eq(supermercadoItens.householdId, dbUser.householdId),
    orderBy: [asc(supermercadoItens.sortOrder), asc(supermercadoItens.name)],
  });

  const locations = [...new Set(items.map((i) => i.location).filter(Boolean))] as string[];
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];

  return (
    <ScreenShell
      userQ="O que vocês compram normalmente?"
      insight={
        items.length === 0 ? (
          <>Cadastre o primeiro produto. Localização ajuda na hora da contagem.</>
        ) : (
          <>
            <b>{items.length}</b> produtos. Arraste pra reordenar — a contagem segue esta ordem.
          </>
        )
      }
    >
      <SectionRow icon="bag" label="Produtos cadastrados" action={`${items.length}`} />

      <BigNumber
        value={String(items.length)}
        sub={`em ${locations.length} ${locations.length === 1 ? "localização" : "localizações"} · ${categories.length} categorias`}
      />

      {/* Cadastro de novo produto */}
      <div style={{ padding: "12px 0 0" }}>
        <InlineForm buttonLabel="+ cadastrar produto">
          <form action={createItem}>
            <FormField label="Nome *">
              <input
                name="name"
                required
                autoFocus
                placeholder="Ex: leite integral"
                style={fieldStyle}
              />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Marca preferida">
                <input name="brand" placeholder="Italac, Piracanjuba…" style={fieldStyle} />
              </FormField>
              <FormField label="Localização">
                <input
                  name="location"
                  list="produtos-locations"
                  placeholder="Prateleira 1, Geladeira…"
                  style={fieldStyle}
                />
                <datalist id="produtos-locations">
                  {locations.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </FormField>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px 90px" }}>
              <FormField label="Categoria">
                <input
                  name="category"
                  list="produtos-categories"
                  placeholder="Mercado, Padaria…"
                  style={fieldStyle}
                />
                <datalist id="produtos-categories">
                  {["Mercado", "Padaria", "Frutas", "Verduras", "Carnes", "Bebidas", "Limpeza", "Higiene", "Pet"].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Unidade">
                <input
                  name="unit"
                  list="produtos-units"
                  defaultValue="un"
                  style={fieldStyle}
                />
                <datalist id="produtos-units">
                  {["un", "kg", "g", "L", "mL", "pct", "cx"].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Mínimo">
                <input
                  type="number"
                  step="0.01"
                  name="minStock"
                  placeholder="6"
                  style={fieldStyle}
                />
              </FormField>
            </div>
            <FormField label="Preço estimado (R$)" hint="opcional">
              <input
                type="number"
                step="0.01"
                name="estimatedPrice"
                placeholder="5.49"
                style={fieldStyle}
              />
            </FormField>
            <SubmitButton>Salvar produto</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* Lista com drag-and-drop */}
      <SectionRow icon="bag" label="Estoque" action={`${items.length}`} />
      <div style={{ padding: "0 16px 20px" }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum produto cadastrado.
          </div>
        ) : (
          <SortableProductsList
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              brand: i.brand,
              location: i.location,
              category: i.category,
              unit: i.unit,
              minStock: i.minStock,
              currentStock: i.currentStock,
            }))}
          />
        )}
      </div>
    </ScreenShell>
  );
}
