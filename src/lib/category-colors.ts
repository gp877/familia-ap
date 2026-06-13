/**
 * Resolução CANÔNICA da cor de uma categoria — usada por TODAS as telas
 * (cadastro detalhado/compacto, transações, faturas, regras, dashboard).
 *
 * Antes cada tela tinha seu próprio fallback (hash colorido, cinza,
 * laranja fixo…) e a mesma categoria aparecia com cores diferentes
 * dependendo da tela.
 *
 * Regra:
 *   1. cor própria da categoria
 *   2. cor da categoria-mãe (subcategoria herda)
 *   3. fallback determinístico por hash do id — usa o id da MÃE quando
 *      existe, pra todas as irmãs caírem na mesma cor da família.
 */
export function resolveCategoryColor(
  cat: { id: string; color?: string | null; kind: "expense" | "income"; parentId?: string | null },
  parent?: { id: string; color?: string | null } | null
): string {
  if (cat.color) return cat.color;
  if (parent?.color) return parent.color;
  const anchorId = parent?.id ?? cat.parentId ?? cat.id;
  return fallbackColorFor(anchorId, cat.kind);
}

/** Cor determinística pra categorias sem cor definida (estável por id). */
export function fallbackColorFor(id: string, kind: "expense" | "income"): string {
  const palette =
    kind === "income"
      ? ["#7BD86F", "#5DA9FF", "#B8FF5C", "#FFB85C", "#9DDFD3"]
      : ["#FF7A35", "#FF4FA3", "#B57FFF", "#FFB85C", "#5DA9FF", "#FF8866"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
