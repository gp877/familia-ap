import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, SectionRow, Sparkline } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { PersonPicker } from "@/components/ap/person-picker";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createPesagem, deletePesagem, patchPesagem } from "@/app/actions/saude";
import { SubNav } from "@/app/(app)/saude-exames/page";
import { auth } from "@/auth";
import { db } from "@/db";
import { pesagens, users } from "@/db/schema";
import { HOUSEHOLD_PEOPLE, personColor, personInitial } from "@/lib/people";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

type Period = { key: string; label: string; from: string | null; to: string | null };

function buildPeriods(now: Date): Period[] {
  const year = now.getFullYear();
  const todayStr = now.toISOString().slice(0, 10);
  const ystart = (y: number) => `${y}-01-01`;
  const yend = (y: number) => `${y}-12-31`;
  return [
    { key: "current", label: "Este ano", from: ystart(year), to: todayStr },
    { key: String(year - 1), label: String(year - 1), from: ystart(year - 1), to: yend(year - 1) },
    { key: String(year - 2), label: String(year - 2), from: ystart(year - 2), to: yend(year - 2) },
    { key: "5y", label: "5 anos", from: ystart(year - 4), to: todayStr },
    { key: "all", label: "Todo", from: null, to: null },
  ];
}

type SearchParams = Promise<{ who?: string; period?: string }>;

export default async function PesoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.pesagens.findMany({
    where: eq(pesagens.householdId, dbUser.householdId),
    orderBy: [asc(pesagens.weighedOn)],
  });

  const activeWho =
    sp.who && (HOUSEHOLD_PEOPLE as readonly string[]).includes(sp.who)
      ? sp.who
      : HOUSEHOLD_PEOPLE[0];

  const periods = buildPeriods(new Date());
  const activePeriod =
    periods.find((p) => p.key === sp.period) ?? periods[0];

  const personAll = all.filter((p) => p.who === activeWho);
  const filtered = personAll.filter((p) => {
    if (activePeriod.from && p.weighedOn < activePeriod.from) return false;
    if (activePeriod.to && p.weighedOn > activePeriod.to) return false;
    return true;
  });

  const last = filtered[filtered.length - 1];
  const first = filtered[0];
  const weightData = filtered.map((p) => parseFloat(p.weightKg));
  const delta = weightData.length >= 2 ? weightData[weightData.length - 1] - weightData[0] : 0;

  const lastHeight =
    [...personAll].reverse().find((p) => p.heightCm)?.heightCm ?? null;

  const isBaby = activeWho === "Francisco";
  const today = new Date().toISOString().slice(0, 10);
  const color = personColor(activeWho);

  return (
    <ScreenShell
      userQ="Como tá o peso essas semanas?"
      insight={
        personAll.length === 0 ? (
          <>
            Sem pesagens de <b>{activeWho}</b> ainda. Registre a primeira logo abaixo.
          </>
        ) : filtered.length === 0 ? (
          <>
            Sem registros de <b>{activeWho}</b> em {activePeriod.label.toLowerCase()}.
          </>
        ) : delta < 0 ? (
          <>
            {activeWho} perdeu <b>{Math.abs(delta).toFixed(1)} kg</b> em{" "}
            {activePeriod.label.toLowerCase()}.
          </>
        ) : delta > 0 ? (
          <>
            {activeWho} ganhou <b>{delta.toFixed(1)} kg</b> em{" "}
            {activePeriod.label.toLowerCase()}.
          </>
        ) : (
          <>
            {activeWho}: estável em <b>{(last && parseFloat(last.weightKg)).toFixed(1)} kg</b>.
          </>
        )
      }
    >
      <SubNav active="peso" />

      <PersonPicker
        basePath="/saude-peso"
        activeWho={activeWho}
        extraParams={{ period: sp.period }}
      />

      <PeriodChips
        basePath="/saude-peso"
        activeKey={activePeriod.key}
        activeWho={activeWho}
        periods={periods}
      />

      <SectionRow
        icon="weight"
        label={`Peso · ${activeWho}`}
        action={`${filtered.length}/${personAll.length}`}
      />

      {/* Bloco principal: último peso + altura (se houver) + sparkline */}
      <div style={{ padding: "0 16px" }}>
        <div
          style={{
            background: "var(--card)",
            borderRadius: 20,
            border: `0.5px solid ${last ? color : "var(--line-d)"}`,
            padding: "18px 18px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: color,
                  color: "var(--accent-on)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {personInitial(activeWho)}
              </span>
              <div>
                {last ? (
                  <>
                    <div className="ap-num" style={{ fontSize: 30, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.04em", lineHeight: 1 }}>
                      {parseFloat(last.weightKg).toFixed(1)}
                      <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>kg</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                      {formatDate(last.weighedOn)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>sem pesagens no período</div>
                )}
              </div>
            </div>

            {lastHeight && (
              <div style={{ textAlign: "right" }}>
                <div className="ap-num" style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-d)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {parseFloat(lastHeight).toFixed(0)}
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginLeft: 3 }}>cm</span>
                </div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                  {isBaby ? "comprimento" : "altura"}
                </div>
              </div>
            )}

            {weightData.length >= 2 && (
              <div style={{ textAlign: "right", minWidth: 70 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--alert)" : "var(--muted)",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {delta < 0 ? "▼" : delta > 0 ? "▲" : "→"} {Math.abs(delta).toFixed(1)} kg
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 3, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                  no período
                </div>
              </div>
            )}
          </div>

          {weightData.length >= 2 && (
            <div style={{ marginTop: 14 }}>
              <Sparkline data={weightData} w={520} h={70} color={color} fill />
              {first && last && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 9.5,
                    color: "var(--muted)",
                    marginTop: 4,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  <span>{formatDate(first.weighedOn)}</span>
                  <span>{formatDate(last.weighedOn)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick-add: peso + altura */}
      <div style={{ padding: "0 16px 4px", marginTop: 14 }}>
        <form
          action={createPesagem}
          style={{
            background: "var(--surf)",
            borderRadius: 14,
            border: "0.5px solid var(--line-d)",
            padding: "10px 14px",
            display: "grid",
            gridTemplateColumns: isBaby ? "110px 1fr 1fr 80px" : "110px 1fr 1fr 80px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input type="hidden" name="who" value={activeWho} />
          <input
            type="date"
            name="weighedOn"
            required
            defaultValue={today}
            style={addFieldStyle}
          />
          <input
            type="number"
            step="0.1"
            name="weightKg"
            required
            placeholder={isBaby ? "9.4 kg" : "83.4 kg"}
            style={addFieldStyle}
          />
          <input
            type="number"
            step="0.1"
            name="heightCm"
            placeholder={isBaby ? "72 cm" : "175 cm"}
            style={addFieldStyle}
          />
          <button type="submit" style={addBtnStyle}>
            registrar
          </button>
        </form>
      </div>

      {/* Histórico filtrado */}
      {filtered.length > 0 && (
        <>
          <SectionRow icon="weight" label="Histórico" action={`${filtered.length}`} />
          <div style={{ padding: "0 20px 20px" }}>
            {[...filtered]
              .reverse()
              .slice(0, 40)
              .map((p, i, arr) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "92px 1fr 88px 28px",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: i < arr.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  }}
                >
                  <InlineEditInput
                    initialValue={p.weighedOn}
                    action={patchPesagem}
                    hiddenFields={{ id: p.id }}
                    fieldName="weighedOn"
                    fontSize={11}
                    color="var(--muted-d)"
                  />
                  <InlineEditInput
                    initialValue={p.weightKg}
                    action={patchPesagem}
                    hiddenFields={{ id: p.id }}
                    fieldName="weightKg"
                    fontSize={13}
                    fontWeight={700}
                  />
                  <InlineEditInput
                    initialValue={p.heightCm ?? ""}
                    action={patchPesagem}
                    hiddenFields={{ id: p.id }}
                    fieldName="heightCm"
                    fontSize={12}
                    placeholder={isBaby ? "cm" : "altura"}
                    color="var(--muted-d)"
                  />
                  <DeleteBtn
                    action={deletePesagem.bind(null, p.id)}
                    confirmMsg={null}
                  />
                </div>
              ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function PeriodChips({
  basePath,
  activeKey,
  activeWho,
  periods,
}: {
  basePath: string;
  activeKey: string;
  activeWho: string;
  periods: Period[];
}) {
  return (
    <div
      style={{
        padding: "4px 16px 10px",
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {periods.map((p) => {
        const isActive = p.key === activeKey;
        const sp = new URLSearchParams();
        sp.set("who", activeWho);
        if (p.key !== "current") sp.set("period", p.key);
        return (
          <Link
            key={p.key}
            href={`${basePath}?${sp.toString()}`}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: isActive ? "var(--accent)" : "var(--card)",
              color: isActive ? "var(--accent-on)" : "var(--muted-d)",
              border: isActive ? "none" : "0.5px solid var(--line-d)",
              textDecoration: "none",
            }}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

const addFieldStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--line-d)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const addBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
