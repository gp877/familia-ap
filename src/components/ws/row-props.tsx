"use client";

import { useState } from "react";

import type { DbSchema, PropValue } from "@/lib/workspace-model";

import { type Person, PropCell } from "./prop-cell";
import { AddPropertyButton, PropertyMenu } from "./schema-editor";
import { Popover } from "./ws-ui";

/** Propriedades no topo de uma linha aberta como página. */
export function RowProps({
  dbId,
  rowId,
  schema,
  props,
  people,
}: {
  dbId: string;
  rowId: string;
  schema: DbSchema;
  props: Record<string, PropValue>;
  people: Person[];
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const ctx = { dbId, schema, people };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingBottom: 12, marginBottom: 12, borderBottom: "0.5px solid var(--line-d)" }}>
      {schema.properties.map((p) => (
        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenu(p.id)}
              className="ws-menu-item"
              style={{ width: "100%", textAlign: "left", padding: "5px 6px", border: 0, background: "transparent", color: "var(--muted-d)", fontSize: 13, cursor: "pointer", borderRadius: 4, fontFamily: "inherit" }}
            >
              {p.name}
            </button>
            <Popover open={menu === p.id} onClose={() => setMenu(null)} width={260}>
              <PropertyMenu dbId={dbId} schema={schema} prop={p} onClose={() => setMenu(null)} />
            </Popover>
          </div>
          <PropCell ctx={ctx} rowId={rowId} prop={p} value={props?.[p.id] ?? null} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12.5 }}>
        <AddPropertyButton dbId={dbId} schema={schema} /> Adicionar propriedade
      </div>
    </div>
  );
}
