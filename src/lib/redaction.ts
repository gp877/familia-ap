/**
 * Mascara dados sensíveis antes de mandar texto pro Gemini.
 * Conservador: prefere mascarar a mais que a menos.
 */
export function redactSensitive(text: string): string {
  return text
    // CNPJ formatado: 00.000.000/0000-00
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[CNPJ]")
    // CPF formatado: 000.000.000-00
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]")
    // Cartão de crédito: 4 grupos de 4 dígitos separados
    .replace(/\b(?:\d{4}[ -]){3}\d{4}\b/g, "[CARTAO]")
    // Cartão mascarado: asteriscos/X + últimos 4
    .replace(/\b[*X]{4,}\s*\d{4}\b/gi, "[CARTAO]")
    // Conta corrente após label
    .replace(/(conta\s*(?:corrente)?\s*:?\s*)(\d{4,12}-?\d?)/gi, "$1[CONTA]")
    // Agência após label
    .replace(/(ag(?:[ê.]|ência|encia)?\s*:?\s*)(\d{4,6}-?\d?)/gi, "$1[AGENCIA]")
    // E-mail
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    // Telefone BR
    .replace(/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[TELEFONE]");
}
