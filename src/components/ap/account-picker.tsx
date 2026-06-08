import Link from "next/link";

import { Icon } from "@/components/ap/icon";

export type AccountLite = {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit_card" | "investment" | "other";
  institution: string | null;
  lastFour: string | null;
  parentAccountId: string | null;
};

/**
 * Seletor hierárquico de conta bancária.
 *
 * Nível 1 = contas raiz (CC, poupança, investimento) em cards grandes,
 *           tipo PersonPicker — sempre a primeira ação.
 * Nível 2 = cartões de crédito vinculados à conta L1 selecionada,
 *           aparecem em pills abaixo só quando uma conta está ativa.
 *
 * Filtragem de transações:
 *   - "Todas": todas as transações do household.
 *   - L1 selecionada: a conta + todos os cartões filhos dela.
 *   - L2 selecionada: só esse cartão.
 */
export function AccountPicker({
  basePath,
  accounts,
  activeAccountId,
  extraParams = {},
  paramName = "account",
  flat = false,
}: {
  basePath: string;
  accounts: AccountLite[];
  activeAccountId: string | null;
  extraParams?: Record<string, string | undefined>;
  paramName?: string;
  /**
   * Quando true, ignora hierarquia: mostra contas e cartões lado a lado
   * em grid, prefixados por "Extrato …" ou "Cartão …". Usar quando a tela
   * já separa visualmente as duas fontes (ex: /financeiro/transacoes).
   */
  flat?: boolean;
}) {
  const roots = accounts.filter((a) => a.type !== "credit_card");
  const cards = accounts.filter((a) => a.type === "credit_card");
  const cardsByParent = new Map<string, AccountLite[]>();
  for (const card of cards) {
    if (card.parentAccountId) {
      const arr = cardsByParent.get(card.parentAccountId) ?? [];
      arr.push(card);
      cardsByParent.set(card.parentAccountId, arr);
    }
  }
  const orphanCards = cards.filter((c) => !c.parentAccountId);

  const activeAccount = activeAccountId
    ? accounts.find((a) => a.id === activeAccountId)
    : null;

  // Determina a "raiz selecionada" mesmo quando o ativo é um cartão
  const activeRootId = activeAccount
    ? activeAccount.type === "credit_card"
      ? activeAccount.parentAccountId
      : activeAccount.id
    : null;

  function urlFor(accountId: string | null): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    if (accountId) sp.set(paramName, accountId);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  if (roots.length === 0 && orphanCards.length === 0) {
    return null;
  }

  // Modo flat (2 etapas):
  //   1) Chips pequenos pra escolher a CONTA (Todas | UNICRED | …)
  //   2) Cards grandes pra escolher o TIPO de visualização dessa conta:
  //      - "EXTRATO" da conta (estilo neutro, ícone bank)
  //      - "CARTÃO Visa Gold" (estilo distinto, ícone card, borda accent)
  //   Os 2 tipos têm visual diferente pra não confundir.
  if (flat) {
    const activeChildCards = activeRootId
      ? cardsByParent.get(activeRootId) ?? []
      : [];
    const showOrphans = !activeRootId && orphanCards.length > 0;

    return (
      <div
        style={{
          padding: "12px 16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Etapa 1: chips de CONTA */}
        <div>
          <StepLabel>Conta</StepLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Link href={urlFor(null)} style={accountChipStyle(activeAccountId === null)}>
              Todas
            </Link>
            {roots.map((acc) => {
              const isActive = activeRootId === acc.id;
              return (
                <Link key={acc.id} href={urlFor(acc.id)} style={accountChipStyle(isActive)}>
                  {acc.name}
                  {acc.lastFour ? ` ····${acc.lastFour}` : ""}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Etapa 2: TIPO — só faz sentido quando uma conta tá ativa.
            Mostra "Extrato" + um card por cartão filho. */}
        {activeRootId && (
          <div>
            <StepLabel>Visualizar</StepLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {/* Extrato da conta */}
              <Link
                href={urlFor(activeRootId)}
                style={statementCardStyle(activeAccountId === activeRootId)}
              >
                <Icon name="bank" size={20} stroke={1.8} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={typeBadgeStyle(activeAccountId === activeRootId)}>
                    EXTRATO
                  </span>
                  <span style={typeNameStyle(activeAccountId === activeRootId)}>
                    {roots.find((r) => r.id === activeRootId)?.name}
                  </span>
                </div>
              </Link>

              {/* Um card por cartão filho */}
              {activeChildCards.map((card) => {
                const isActive = activeAccountId === card.id;
                return (
                  <Link key={card.id} href={urlFor(card.id)} style={cardCardStyle(isActive)}>
                    <Icon name="card" size={20} stroke={1.8} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={typeBadgeStyle(isActive)}>CARTÃO</span>
                      <span style={typeNameStyle(isActive)}>
                        {card.name}
                        {card.lastFour ? ` ····${card.lastFour}` : ""}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Cartões órfãos (sem conta-mãe) — só quando "Todas" ativo */}
        {showOrphans && (
          <div>
            <StepLabel>Cartões sem conta</StepLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {orphanCards.map((card) => {
                const isActive = activeAccountId === card.id;
                return (
                  <Link key={card.id} href={urlFor(card.id)} style={cardCardStyle(isActive)}>
                    <Icon name="card" size={20} stroke={1.8} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={typeBadgeStyle(isActive)}>CARTÃO</span>
                      <span style={typeNameStyle(isActive)}>
                        {card.name}
                        {card.lastFour ? ` ····${card.lastFour}` : ""}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Nível 1: contas raiz como cards grandes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(roots.length + 1, 3)}, 1fr)`,
          gap: 8,
        }}
      >
        <Link
          href={urlFor(null)}
          style={{
            ...rootCardStyle(activeAccountId === null),
          }}
        >
          <Icon name="bank" size={20} stroke={1.8} />
          <span style={rootLabelStyle(activeAccountId === null)}>Todas</span>
        </Link>
        {roots.map((acc) => {
          const isActive = activeRootId === acc.id;
          return (
            <Link key={acc.id} href={urlFor(acc.id)} style={rootCardStyle(isActive)}>
              <Icon name="bank" size={20} stroke={1.8} />
              <span style={rootLabelStyle(isActive)}>
                {acc.name}
                {acc.lastFour ? (
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}> ····{acc.lastFour}</span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Nível 2: cartões da conta selecionada */}
      {activeRootId && (cardsByParent.get(activeRootId)?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              alignSelf: "center",
              marginRight: 4,
            }}
          >
            cartões
          </span>
          <Link
            href={urlFor(activeRootId)}
            style={pillStyle(activeAccountId === activeRootId)}
          >
            sem cartão
          </Link>
          {(cardsByParent.get(activeRootId) ?? []).map((card) => {
            const isActive = activeAccountId === card.id;
            return (
              <Link key={card.id} href={urlFor(card.id)} style={pillStyle(isActive)}>
                {card.name}
                {card.lastFour ? ` ····${card.lastFour}` : ""}
              </Link>
            );
          })}
        </div>
      )}

      {/* Cartões órfãos (sem conta-mãe) — só aparecem quando "Todas" está ativo */}
      {!activeRootId && orphanCards.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              alignSelf: "center",
              marginRight: 4,
            }}
          >
            cartões sem conta
          </span>
          {orphanCards.map((card) => {
            const isActive = activeAccountId === card.id;
            return (
              <Link key={card.id} href={urlFor(card.id)} style={pillStyle(isActive)}>
                {card.name}
                {card.lastFour ? ` ····${card.lastFour}` : ""}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function rootCardStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "10px 6px 12px",
    borderRadius: 16,
    background: isActive ? "var(--accent)" : "var(--card)",
    color: isActive ? "var(--accent-on)" : "var(--ink)",
    border: isActive ? "1.5px solid var(--accent)" : "0.5px solid var(--line-d)",
    textDecoration: "none",
    minHeight: 64,
    justifyContent: "center",
    textAlign: "center",
  };
}

function rootLabelStyle(isActive: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: isActive ? 800 : 700,
    color: isActive ? "var(--accent-on)" : "var(--ink)",
    letterSpacing: "-0.01em",
    lineHeight: 1.15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  };
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function accountChipStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: isActive ? "var(--ink)" : "var(--card)",
    color: isActive ? "var(--bg)" : "var(--muted-d)",
    border: isActive ? "none" : "0.5px solid var(--line-d)",
    textDecoration: "none",
  };
}

/**
 * Estilo unificado pros botões Extrato e Cartão. Ambos ficam:
 *   - Inativos: fundo neutro escuro, texto branco mutado
 *   - Ativos: fundo accent sólido + glow externo + texto preto bold
 *
 * A diferença entre os dois fica só no ícone e no badge ("EXTRATO" vs
 * "CARTÃO") — o que basta pra distinguir, sem perder destaque de seleção.
 */
function typeCardStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 14px",
    borderRadius: 14,
    background: isActive ? "var(--accent)" : "var(--card2)",
    border: isActive ? "1.5px solid var(--accent)" : "0.5px solid var(--line-d)",
    color: isActive ? "var(--accent-on)" : "var(--ink)",
    textDecoration: "none",
    minHeight: 64,
    boxShadow: isActive
      ? "0 0 0 3px color-mix(in oklab, var(--accent) 28%, transparent), 0 2px 8px color-mix(in oklab, var(--accent) 25%, transparent)"
      : "none",
    transition: "box-shadow 120ms",
  };
}

// Alias mantido pra compatibilidade interna — ambos os tipos usam o mesmo estilo
const statementCardStyle = typeCardStyle;
const cardCardStyle = typeCardStyle;

function typeBadgeStyle(isActive: boolean): React.CSSProperties {
  return {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: "0.14em",
    color: isActive ? "var(--accent-on)" : "var(--muted-d)",
    lineHeight: 1,
    marginBottom: 4,
    opacity: isActive ? 0.7 : 1,
  };
}

function typeNameStyle(isActive: boolean): React.CSSProperties {
  return {
    fontSize: 13.5,
    fontWeight: 800,
    color: isActive ? "var(--accent-on)" : "var(--ink)",
    letterSpacing: "-0.01em",
    lineHeight: 1.15,
  };
}

function pillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: isActive ? "var(--accent)" : "var(--card)",
    color: isActive ? "var(--accent-on)" : "var(--muted-d)",
    border: isActive ? "none" : "0.5px solid var(--line-d)",
    textDecoration: "none",
  };
}

/**
 * Retorna a lista de IDs de conta a usar como filtro em queries de transações.
 * Se a conta selecionada é raiz, retorna [raiz, ...cartões filhos].
 * Se é cartão, retorna só [cartão].
 * Se null, retorna null (sem filtro).
 */
export function expandAccountFilter(
  accounts: AccountLite[],
  selectedId: string | null
): string[] | null {
  if (!selectedId) return null;
  const sel = accounts.find((a) => a.id === selectedId);
  if (!sel) return null;
  if (sel.type === "credit_card") return [sel.id];
  // raiz: ela + filhos
  const childrenIds = accounts
    .filter((a) => a.parentAccountId === sel.id)
    .map((a) => a.id);
  return [sel.id, ...childrenIds];
}
