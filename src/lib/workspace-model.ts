/**
 * Modelo do espaço de trabalho (Tarefas), no desenho do Notion. Tipos e
 * funções PURAS (sem banco) — usadas pelas telas, pelas server actions e
 * pela API de agentes. Ver lib/workspace.ts para a parte que grava.
 */

// ── Blocos (conteúdo de uma página) ───────────────────────────────
export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "todo"
  | "bullet"
  | "numbered"
  | "toggle"
  | "quote"
  | "callout"
  | "divider"
  | "code"
  | "page"; // link para subpágina (pageId)

export type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean; // todo
  open?: boolean; // toggle
  body?: string; // toggle: conteúdo escondido
  pageId?: string; // page
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  paragraph: "Texto",
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  todo: "Lista de tarefas",
  bullet: "Lista com marcadores",
  numbered: "Lista numerada",
  toggle: "Lista recolhível",
  quote: "Citação",
  callout: "Destaque",
  divider: "Divisória",
  code: "Código",
  page: "Página",
};

// ── Propriedades de banco ─────────────────────────────────────────
export type PropType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "person";

export const PROP_LABEL: Record<PropType, string> = {
  text: "Texto",
  number: "Número",
  select: "Seleção",
  multi_select: "Seleção múltipla",
  status: "Status",
  date: "Data",
  checkbox: "Caixa de seleção",
  url: "Link",
  person: "Pessoa",
};

export type Color =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export const COLORS: Color[] = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const COLOR_LABEL: Record<Color, string> = {
  default: "Padrão",
  gray: "Cinza",
  brown: "Marrom",
  orange: "Laranja",
  yellow: "Amarelo",
  green: "Verde",
  blue: "Azul",
  purple: "Roxo",
  pink: "Rosa",
  red: "Vermelho",
};

/** Status tem 3 grupos fixos (como no Notion): a fazer / em andamento / concluído. */
export type StatusGroup = "todo" | "doing" | "done";
export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluído",
};

export type SelectOption = { id: string; name: string; color: Color; group?: StatusGroup };

/**
 * Papel especial de uma propriedade (opcional):
 *  ai_prompt → texto com a instrução para a IA (aparece como "🤖 Pedir à IA" na tarefa)
 *  ai_status → seleção da fila da IA; a 1ª opção = "na fila" (some das listas até a IA terminar)
 */
export type PropRole = "ai_prompt" | "ai_status" | "priority";

export type Property = {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[]; // select | multi_select | status
  role?: PropRole;
};

export type DbSchema = { properties: Property[] };

// Valor guardado em row.props[propId]
export type PropValue = string | number | boolean | string[] | null;

// ── Visualizações ─────────────────────────────────────────────────
export type ViewType = "table" | "board" | "list" | "calendar";
export const VIEW_LABEL: Record<ViewType, string> = {
  table: "Tabela",
  board: "Quadro",
  list: "Lista",
  calendar: "Calendário",
};

export type FilterOp =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "checked"
  | "unchecked";

export const FILTER_OP_LABEL: Record<FilterOp, string> = {
  is: "é",
  is_not: "não é",
  contains: "contém",
  not_contains: "não contém",
  empty: "está vazio",
  not_empty: "não está vazio",
  before: "antes de",
  after: "depois de",
  on_or_before: "até",
  on_or_after: "a partir de",
  checked: "marcado",
  unchecked: "desmarcado",
};

/** "title" é a propriedade implícita do nome da linha. */
export const TITLE_PROP = "title";

export type Filter = { prop: string; op: FilterOp; value?: string };
export type Sort = { prop: string; dir: "asc" | "desc" };

export type View = {
  id: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: Sort[];
  groupBy?: string; // board: propId (select/status/person/checkbox)
  dateProp?: string; // calendar: propId (date)
  hidden?: string[]; // propIds escondidos na tabela/lista
  /** Filtros rápidos (botões acima do quadro): cada um troca os filtros da visualização. Sem escolha = `filters`. */
  modes?: ViewMode[];
};

export type ViewMode = { id: string; name: string; filters: Filter[] };

/** Data "hoje" no fuso de Brasília, AAAA-MM-DD. Valor especial dos filtros: "@hoje" (ou "@hoje+3", "@hoje-7"). */
export function todayBrt(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 864e5));
}

/** Resolve "@hoje", "@hoje+N" e "@hoje-N" para AAAA-MM-DD; outro valor volta como está. */
export function resolveDateValue(v: string | undefined): string {
  const m = /^@hoje(?:([+-])(\d{1,3}))?$/.exec(v ?? "");
  if (!m) return v ?? "";
  return todayBrt(m[1] ? (m[1] === "-" ? -1 : 1) * Number(m[2]) : 0);
}

export function opsFor(type: PropType | "title"): FilterOp[] {
  switch (type) {
    case "date":
      return ["is", "before", "after", "on_or_before", "on_or_after", "empty", "not_empty"];
    case "checkbox":
      return ["checked", "unchecked"];
    case "select":
    case "status":
    case "person":
      return ["is", "is_not", "empty", "not_empty"];
    case "multi_select":
      return ["contains", "not_contains", "empty", "not_empty"];
    case "number":
      return ["is", "is_not", "before", "after", "empty", "not_empty"];
    default:
      return ["contains", "not_contains", "is", "is_not", "empty", "not_empty"];
  }
}

export type RowLike = { id: string; title: string; props: Record<string, PropValue>; sortOrder: number; createdAt: Date | string };

function rawValue(row: RowLike, propId: string): PropValue {
  return propId === TITLE_PROP ? row.title : (row.props?.[propId] ?? null);
}

function isEmpty(v: PropValue): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function matchesFilter(row: RowLike, f: Filter, schema: DbSchema): boolean {
  const v = rawValue(row, f.prop);
  const prop = schema.properties.find((p) => p.id === f.prop);
  const type: PropType | "title" = prop?.type ?? "title";
  const target = resolveDateValue(f.value);
  switch (f.op) {
    case "empty":
      return isEmpty(v);
    case "not_empty":
      return !isEmpty(v);
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
    case "contains":
      if (Array.isArray(v)) return v.includes(target);
      return String(v ?? "").toLowerCase().includes(target.toLowerCase());
    case "not_contains":
      if (Array.isArray(v)) return !v.includes(target);
      return !String(v ?? "").toLowerCase().includes(target.toLowerCase());
    case "is":
      if (type === "text" || type === "title" || type === "url") return String(v ?? "").toLowerCase() === target.toLowerCase();
      return String(v ?? "") === target;
    case "is_not":
      return String(v ?? "") !== target;
    case "before":
    case "after":
    case "on_or_before":
    case "on_or_after": {
      if (isEmpty(v)) return false;
      const a = type === "number" ? Number(v) : String(v);
      const b = type === "number" ? Number(target) : target;
      if (f.op === "before") return a < b;
      if (f.op === "after") return a > b;
      if (f.op === "on_or_before") return a <= b;
      return a >= b;
    }
  }
  return true;
}

/** Ordem de um valor pra ordenar: select/status pela ordem das opções. */
function sortKey(row: RowLike, propId: string, schema: DbSchema): string | number {
  const v = rawValue(row, propId);
  const prop = schema.properties.find((p) => p.id === propId);
  if (prop && (prop.type === "select" || prop.type === "status")) {
    const i = (prop.options ?? []).findIndex((o) => o.id === v);
    return i < 0 ? 9999 : i;
  }
  if (prop?.type === "number") return v == null || v === "" ? Number.POSITIVE_INFINITY : Number(v);
  if (prop?.type === "checkbox") return v === true ? 0 : 1;
  if (Array.isArray(v)) return v.join(",");
  return v == null || v === "" ? "￿" : String(v).toLowerCase();
}

export function applyView<T extends RowLike>(rows: T[], view: View, schema: DbSchema): T[] {
  const filtered = rows.filter((r) => view.filters.every((f) => matchesFilter(r, f, schema)));
  const sorts = view.sorts.length ? view.sorts : [];
  return [...filtered].sort((a, b) => {
    for (const s of sorts) {
      const ka = sortKey(a, s.prop, schema);
      const kb = sortKey(b, s.prop, schema);
      if (ka < kb) return s.dir === "asc" ? -1 : 1;
      if (ka > kb) return s.dir === "asc" ? 1 : -1;
    }
    return a.sortOrder - b.sortOrder || String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

export function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
}

/** Banco "Tarefas" que nasce pra todo mundo — ponto de partida pra personalizar. */
export function defaultTasksDatabase(): { title: string; icon: string; schema: DbSchema; views: View[] } {
  const status: Property = {
    id: "status",
    name: "Status",
    type: "status",
    options: [
      { id: "s_todo", name: "A fazer", color: "gray", group: "todo" },
      { id: "s_doing", name: "Fazendo", color: "blue", group: "doing" },
      { id: "s_wait", name: "Aguardando", color: "yellow", group: "doing" },
      { id: "s_done", name: "Feito", color: "green", group: "done" },
    ],
  };
  const props: Property[] = [
    status,
    { id: "prazo", name: "Prazo", type: "date" },
    {
      id: "prioridade",
      name: "Prioridade",
      type: "select",
      options: [
        { id: "p_alta", name: "Alta", color: "red" },
        { id: "p_media", name: "Média", color: "orange" },
        { id: "p_baixa", name: "Baixa", color: "gray" },
      ],
    },
    {
      id: "area",
      name: "Área",
      type: "select",
      options: [
        { id: "a_indaia", name: "Indaiá", color: "purple" },
        { id: "a_pessoal", name: "Pessoal", color: "blue" },
        { id: "a_familia", name: "Família", color: "pink" },
      ],
    },
    {
      id: "origem",
      name: "Origem",
      type: "select",
      options: [
        { id: "o_whats", name: "WhatsApp", color: "green" },
        { id: "o_email", name: "E-mail", color: "orange" },
        { id: "o_manual", name: "Manual", color: "gray" },
      ],
    },
    { id: "pessoa", name: "Com quem", type: "text" },
    { id: "link", name: "Link", type: "url" },
  ];
  const notDone: Filter = { prop: "status", op: "is_not", value: "s_done" };
  return {
    title: "Tarefas",
    icon: "✅",
    schema: { properties: props },
    views: [
      { id: "v_board", name: "Quadro", type: "board", groupBy: "status", filters: [], sorts: [{ prop: "prazo", dir: "asc" }] },
      { id: "v_hoje", name: "Hoje", type: "list", filters: [notDone, { prop: "prazo", op: "on_or_before", value: "@hoje" }], sorts: [{ prop: "prioridade", dir: "asc" }] },
      { id: "v_tabela", name: "Tabela", type: "table", filters: [], sorts: [{ prop: "prazo", dir: "asc" }] },
      { id: "v_cal", name: "Calendário", type: "calendar", dateProp: "prazo", filters: [], sorts: [] },
    ],
  };
}

export function welcomeBlocks(): Block[] {
  const b = (type: BlockType, text: string, extra: Partial<Block> = {}): Block => ({ id: newId(), type, text, ...extra });
  return [
    b("callout", "Este espaço é seu e privado. Só você vê — a não ser que compartilhe uma página com a família."),
    b("h2", "Como funciona"),
    b("bullet", "Tudo é página. Uma página pode ter texto, listas, subpáginas e bancos de dados."),
    b("bullet", "Digite / numa linha vazia para escolher o tipo de bloco (título, lista, tarefa, destaque…)."),
    b("bullet", "Atalhos: # título · - lista · [] tarefa · > citação · --- divisória."),
    b("bullet", "O banco Tarefas tem visualizações: Quadro, Hoje, Tabela e Calendário. Crie as suas."),
    b("bullet", "O que o assistente de IA criar ou mexer aparece com o selo IA."),
    b("h2", "Primeiros passos"),
    b("todo", "Abrir o banco Tarefas e criar a primeira tarefa"),
    b("todo", "Personalizar as propriedades (Área, Prioridade…) do seu jeito"),
    b("todo", "Criar uma visualização nova com um filtro"),
  ];
}
