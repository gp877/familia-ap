# Handoff · App Família AP

> Pacote de design pronto pra implementação. Os arquivos aqui são **referências de design em HTML** — protótipos que mostram o look-and-feel e o comportamento pretendidos, **não código de produção pra copiar direto**. A tarefa é recriar essas telas no seu codebase (React Native / Swift / Flutter / web — o que fizer mais sentido) usando as bibliotecas e padrões que você já adota. Se ainda não tem codebase, escolha o framework mais apropriado e implemente os designs lá.

---

## Fidelidade

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, microcomponentes e copy estão todos definidos. Recreie pixel-perfect — usando os componentes do seu sistema.

---

## Visão geral

App pessoal pra família (casal, ~40 anos) cobrindo:
1. **Casa** — visão consolidada do dia
2. **Finanças** — orçamento mensal, gastos por categoria
3. **Saúde · Exames** — histórico clínico de cada membro
4. **Saúde · Peso** — peso e medidas com gráfico de tendência
5. **Sonhos** — bucket list com progresso
6. **Viagens** — resumo anual + próximas viagens
7. **Calendário** — agenda semanal
8. **Aniversários** — datas importantes

**Plataformas:** iOS (mobile prioritário) + Web desktop.
**Idioma:** Português (BR).
**Moeda:** BRL · formato `R$ 1.234,56`.

---

## Sistema visual — "Noite Pierre"

Inspirado no app Pierre (CloudWalk). Dark-first, conversacional, números grandes, pouca cor.

### Princípios

- **Conversa como espinha dorsal.** Cada tela tem o padrão: header → pergunta do usuário (bubble) → label da categoria → número grande (hero) → cards/lista → insight da AP → input no rodapé.
- **Tipografia bold sans grotesque.** Geist Black pros números/títulos.
- **Cor restrita.** Preto + branco + 1 cor de acento (configurável). Cores semânticas (alerta/ok) usadas só onde necessário.
- **Sem chips coloridos. Sem display chunky. Sem emoji ornamental.**
- **Cards de cantos suaves** (radius 16-18px).
- **Espaçamento generoso** — preferir respiro a densidade.

---

## Design Tokens

### Cores · Modo escuro (default)

| Token         | Hex        | Uso                                     |
|---------------|------------|------------------------------------------|
| `--bg`        | `#0A0A0A`  | Fundo principal da tela                  |
| `--surf`      | `#141414`  | Primeira camada (sidebar, headers)       |
| `--card`      | `#1C1C1C`  | Card padrão                              |
| `--card2`     | `#262626`  | Chip / bubble / pílula                   |
| `--ink`       | `#FAFAFA`  | Texto principal                          |
| `--ink-d`     | `#E8E8E8`  | Texto principal sutil                    |
| `--muted`     | `#7A7A7A`  | Texto secundário                         |
| `--muted-d`   | `#9C9C9C`  | Texto secundário com mais contraste      |
| `--line`      | `#262626`  | Divisor sutil                            |
| `--line-d`    | `#333333`  | Divisor visível                          |
| `--alert`     | `#FF7A35`  | Atenção / lembrete urgente               |
| `--ok`        | `#7BD86F`  | Status positivo                          |

### Cores · Modo claro (alternativa)

| Token         | Hex        |
|---------------|------------|
| `--bg`        | `#F4F0E4`  |
| `--surf`      | `#ECE7D6`  |
| `--card`      | `#FFFFFF`  |
| `--card2`     | `#E0DAC4`  |
| `--ink`       | `#0F0E0C`  |
| `--muted`     | `#7A7367`  |
| `--line-d`    | `#C4BCA3`  |

### Cor de acento (4 opções)

| Nome    | Escuro     | Claro      | Texto on-accent |
|---------|------------|------------|------------------|
| **Lima** (default) | `#B8FF5C` | `#5A8533` | `#0A0A0A` |
| **Azul**  | `#5DA9FF`  | `#1E5FAB`  | `#0A0A0A`        |
| **Âmbar** | `#FFB85C`  | `#A36A1A`  | `#0A0A0A`        |
| **Coral** | `#FF8866`  | `#B84926`  | `#0A0A0A`        |

> O acento é usado pra: **sparkle dos insights da AP**, **botão de mic no input**, **destaques de dados positivos** (% acima de 80%, próximas viagens, hoje no calendário). Use com parcimônia.

### Tipografia

- **Geist** (Google Fonts) — `400, 500, 600, 700, 800, 900`
- **Caveat** (Google Fonts) — `500, 600, 700` — exclusivamente para o wordmark/logo handwritten

| Uso                  | Font          | Peso | Tamanho | Letter-spacing |
|----------------------|---------------|------|---------|----------------|
| Big number (hero)    | Geist         | 800  | 36px    | -0.025em       |
| Big number (XL)      | Geist         | 800  | 44-56px | -0.030em       |
| Título de seção (h1) | Geist         | 800  | 30-36px | -0.025em       |
| Card title           | Geist         | 700  | 17px    | -0.01em        |
| Body                 | Geist         | 500  | 13-14px | normal         |
| Subtitle             | Geist         | 500  | 11-12px | normal         |
| Eyebrow              | Geist         | 600  | 10.5px  | 0.18em UPPER   |
| Wordmark (logo)      | Caveat        | 700  | variável | -0.005em      |

> **Importante:** números em geral usam `font-variant-numeric: tabular-nums` pra alinhar verticalmente.

### Espaçamento

Padding horizontal padrão das telas mobile: **20px**.
Gap entre cards: **10-14px**.
Gap entre seções: **14-18px**.

### Border radius

| Elemento              | Radius |
|-----------------------|--------|
| Card / surface        | 16px   |
| Hero / KPI card       | 18px   |
| Pílula / pill         | 999px  |
| Botão circular        | 50%    |
| Bubble (chat)         | 18px com canto inferior do lado oposto em 6px |

### Sombras

**Não usar sombras** nesta direção. Os cards diferenciam-se pelo `background-color`.

---

## Logotipo

Cinco variações manuscritas (todas usando Caveat). Implementadas em `logos.jsx`. Conceito comum: glifo de linha + script "ap" + subtítulo opcional em uppercase tracked.

| ID         | Descrição                                    |
|------------|----------------------------------------------|
| `simple`   | só "ap." + tagline (mais minimal)            |
| `casa`     | casa em traço linear + "ap" + "família ap"   |
| `coracao`  | coração linear + "ap" + "família"            |
| `wordmark` | "família ap" inteira em manuscrita (SVG)     |
| `argolas`  | duas argolas entrelaçadas (casal) + "a&p"    |

**Recomendação:** comece com `simple` ou `casa`. Os glifos de linha são desenhados em SVG inline em `logos.jsx`, com `stroke-width: 1.6`, `linecap: round`, `linejoin: round` — copie os paths quando for portar.

---

## Componentes / Átomos

Todos definidos em `app-ui.jsx`. Lista pra portar:

### `Icon`
Sistema de ícones em linha (1.7px stroke padrão, `currentColor`). Names disponíveis: `menu, chev, chevD, plus, mic, photo, stop, chart, fork, home, mask, bag, file, weight, star, plane, cal, cake, heart, spark, search, bank, bell`. **Use uma biblioteca como Lucide Icons** no codebase — os names mapeiam direto pra `Menu`, `ChevronRight`, `Plus`, `Mic`, etc.

### `MemberChips`
Dois círculos sobrepostos (A + C) no canto superior direito do header. Tamanho padrão 28px. Borda do bg pra separar. C usa cor de acento.

### `ScreenTop`
Header consistente: `[≡ hamburger]` + `Módulo › ` + spacer + `[A][C]`.

### `UserBubble`
Mensagem do usuário (alinhada à direita). Background `--card`, radius 18 com `border-bottom-right-radius: 6` (canto "puxado"). Padding `10px 14px`. Fonte 14px.

### `SectionRow`
Label de seção: ícone pequeno + texto cinza + chevron à direita. Padding `14px 20px 8px`.

### `BigNumber`
O hero — `font-family: Geist`, `weight: 800`, `size: 36px`, `color: --ink` (ou `--accent` quando se quer destacar). Subtitle 12px `--muted`.

### `Insight`
Caixa especial sticky-ish acima do input. Background `--card`, padding `12-14px`, radius 16. Inicia com ícone `spark` na cor de acento + texto 12.5px. **Sempre escrito em tom conversacional**, como se a AP estivesse falando.

Exemplo: _"Vocês ainda têm **R$ 3.180 livres** esse mês — dá pra reforçar a meta de Lisboa antes do voo de quarta."_

### `ChatInput`
Sticky no rodapé. `[+ icon] [input pill "Converse com a AP"] [mic colorido]`. O mic usa background `--accent`. Altura 36px.

### `Card`
Box arredondado. Padding 14px default, radius 16. `raised={true}` puxa pra `--card`; default usa `--surf`.

### `Pill`
Pequena tag. Tons: `muted` (filled), `ok` (outline verde), `alert` (outline laranja), `accent` (outline). Sempre uppercase, letter-spacing 0.12em, 9.5px.

### `Money`
Format `R$ 1.234,56` com `R$` em tamanho 0.55x e centavos em opacity 0.55. Tabular nums.

### `ListRow`
Linha de lista: ícone (32×32 chip cinza) + título + sub + valor direito (+ valueSub). Divisor `0.5px solid --line-d` no bottom (exceto última).

### `Progress`
Barra de progresso fina (3-6px). Background `--card2`, fill `--accent` ou `--ink-d`.

### `StackBar`
Barra empilhada por categoria — array de `{value, color}` segments. Usa flex gap.

### `Sparkline`
SVG linha simples + dot no fim. `data` array de números. Opcional `fill={true}` pra área translúcida (opacity 0.12).

### `ScreenShell`
Wrapper que combina tudo: `ScreenTop → UserBubble → children (scrollable) → Insight → ChatInput`.

---

## Padrão de uma tela mobile

Layout vertical fixo numa device frame de **402×874** (iPhone 14/15 Pro):

```
┌─────────────────────────────┐
│  iOS status bar (54px)      │
├─────────────────────────────┤
│  [≡] Módulo ›       [A][C]  │  ← ScreenTop
├─────────────────────────────┤
│                  ┌────────┐ │
│                  │bubble  │ │  ← UserBubble (pergunta)
│                  └────────┘ │
├─────────────────────────────┤
│  ◔ Label da seção       ›  │  ← SectionRow
│                             │
│  R$ 8.420,00                │  ← BigNumber
│  de R$ 11.600 · 27% livre   │
│                             │
│  ▓▓▓▓░░░░░░ (StackBar)      │
│                             │
│  🍴 Alimentação    R$ 2.358 │  ← ListRow ×N
│  🏠 Casa           R$ 1.852 │
│  …                          │
├─────────────────────────────┤
│  ✦ Vocês ainda têm R$ 3.180 │  ← Insight
│     livres esse mês — …     │
├─────────────────────────────┤
│  [+] Converse com a AP [🎤] │  ← ChatInput
└─────────────────────────────┘
```

---

## Detalhe por tela

### 01 · Casa
Pergunta: _"Fala AP, como estamos hoje?"_
Hero: saldo livre do mês.
Conteúdo: lista dos 6 módulos com summary curto cada (icon + label + sub + valor).
Insight: resumo do dia / próximo compromisso.

### 02 · Finanças
Pergunta: _"Fala AP, me mostra os gastos desse mês"_
Hero: gasto acumulado · `R$ 8.420,00` + subtitle `de R$ 11.600 · 27% livre`.
StackBar das categorias (5 cores).
Lista de 4 categorias top com `% dos gastos` + valor.
Insight: comparação com ritmo + recomendação.

### 03 · Saúde · Exames
Pergunta: _"Quando foi o último check-up nosso?"_
Hero: data + nome do último exame.
Lista de exames de A e C misturados, com:
- Avatar (A ou C, C usa accent)
- Nome do exame + data
- Doutor / lab
- Pill de status (`ok` verde / `atenção` laranja) + nota curta
Insight: próximo check-up + lembrete inteligente.

### 04 · Saúde · Peso
Pergunta: _"Como tá o peso nosso essas semanas?"_
Hero: delta combinado (`−4,5 kg juntos · desde 1º março`).
Dois cards raised, um por pessoa: nome + peso atual + ▼ delta + sparkline (12 semanas).
Dois small cards: % da meta de Augusto + frequência de caminhada.
Insight: lembrete proativo.

### 05 · Sonhos
Pergunta: _"O que a gente mais quer pros próximos 3 anos?"_
Hero: maior % de progresso atual (em accent).
Lista de cards raised, cada um:
- Eyebrow `DEADLINE · QUEM`
- Título do sonho
- Subtitle (valor reservado, etc)
- % grande à direita (accent se ≥80%)
- Progress bar (accent se ≥80%, senão `--ink-d`)
Insight: nudge sobre o sonho mais próximo.

### 06 · Viagens
Pergunta: _"Como tá o ano de viagens?"_
Hero: `25 noites · 14k km · 3 cidades · 2 países`.
Lista de cards: `[país-code box] cidade + datas + status pill se "próxima"` (com background accent).
SectionRow de orçamento + linha com progress.
Insight: próxima viagem.

### 07 · Calendário
Pergunta: _"O que tem essa semana?"_
Hero: próximo evento em accent (`Hoje · 19h - jantar com vó Inês · em 4h`).
Lista de eventos: `[d t]` à esquerda + barra vertical (accent ou linha) + título + quem.
Insight: highlight do compromisso mais importante.

### 08 · Aniversários
Pergunta: _"Quem faz aniversário esse mês?"_
Hero: countdown grande (`3 dias`) + descrição.
Lista: [data card 44×44, primeiro item em accent] + nome + relação/idade + countdown em dias.
Insight: lembrete contextual.

---

## Web Dashboard (1200×760)

Layout split **240px sidebar + main content**:

- **Sidebar** (`--surf`): logo no topo + nav vertical (7 itens com ícone) + footer com `MemberChips` + nome do casal.
- **Top**: greeting `Oi, Augusto.` (Geist Black 36px) à esquerda, search pill à direita com atalho `⌘K`.
- **Question bubble** (right-aligned).
- **KPI row** (4 cards iguais 1:1, um deles em accent): gasto, sobrou, próxima viagem, peso 12sem.
- **2-col body**: 
  - Esquerda 1.4fr: card grande de "Gastos por categoria" (StackBar + grid 2 col de categorias) + 2 cards menores (peso + sonhos).
  - Direita 1fr: card "Próximas datas" (lista de 5) + insight card.
- **Bottom**: `ChatInput` ocupando largura total do main.

---

## Interações & Comportamento

### Modo escuro
- Toggle no Tweaks (default: `dark: true`).
- Em modo claro, paleta inteira espelha (ver tokens DAY acima).

### Cor de acento
- 4 opções no Tweaks. Persistente.
- Afeta: sparkle do insight, mic, destaques de dado, hover de item da nav, KPI "sobrou" no web, barras de progresso ≥80%.

### Animações sugeridas (não implementadas no protótipo)
- Bubble entrando: fade + slide-up 200ms ease-out.
- Insight aparecendo: idem, com pequeno delay.
- Sparkle do insight: pulse sutil (opacity 1 → 0.7 → 1) a cada 4s.
- Trocar de tela: cross-fade rápido (150ms) — sem swipes pesados, mantém vibe "calma".

### Estados
- **Loading**: skeleton dos cards com `--card2` (sem shimmer agressivo).
- **Empty**: mensagem conversacional no centro (e.g. "Ainda não tem nada por aqui. Conta um sonho pra AP?").
- **Erro**: insight com sparkle em `--alert` + texto pedindo retry.

### Responsivo
- Mobile-first sempre. Tablet = mobile layout esticado (max-width 480px no container).
- Desktop: usa layout dedicado conforme `web-view.jsx` (≥ 1024px).

---

## Conteúdo / Copy

**Tom da AP (o "assistente da família"):**
- Sempre íntimo, em primeira pessoa do plural quando relevante ("vocês", "a gente").
- Curto e útil — nunca didático.
- Cita números específicos pra dar confiança.
- Pode propor ações (`"Quer que eu liste?"`, `"Mando lembrar?"`).
- **Nunca formal**. **Nunca empolgado**.
- **Nunca usar emoji.**

**Perguntas do usuário** (na bubble) sempre soam como mensagem real, não query estruturada:
- ✅ "Fala AP, me mostra os gastos desse mês"
- ✅ "Quando foi o último check-up nosso?"
- ❌ "Visualizar relatório de despesas mensal"

**Placeholders:** os nomes "Camila" e "vó Inês" são placeholders — substitua pelos reais antes de subir pra produção.

---

## Stack sugerida pra implementação

### Mobile (recomendado)
- **React Native** + Expo
- `react-native-svg` pros logos e sparklines
- `expo-font` pra carregar Geist + Caveat
- Bibliotecas: `lucide-react-native` (ícones), `react-native-reanimated` (animações), `victory-native` ou `react-native-svg-charts` (gráficos)
- State: Zustand ou Context

### Web
- **Next.js 14** App Router
- Tailwind CSS + os tokens acima como CSS variables
- Lucide React (ícones)
- Framer Motion (animações)

### Logos
- Exportar cada variante pra SVG estática (pode usar Inkscape ou Figma re-import) pra ter como asset isolado nos repositórios.

---

## Arquivos neste pacote

```
design_handoff_familia_ap/
├── README.md                ← este documento
├── App Família AP.html      ← entry point — abra no navegador pra ver o protótipo completo
├── tokens.jsx               ← paleta + tipografia + applyTokens()
├── logos.jsx                ← 5 variantes de logo (Caveat + glifos SVG)
├── app-ui.jsx               ← todos os átomos (Icon, Card, BigNumber, etc)
├── screens-1.jsx            ← Casa, Finanças, Saúde·Exames, Saúde·Peso
├── screens-2.jsx            ← Sonhos, Viagens, Calendário, Aniversários
├── web-view.jsx             ← dashboard desktop
├── app.jsx                  ← assembly + Tweaks
├── design-canvas.jsx        ← (auxiliar) wrapper de apresentação
├── ios-frame.jsx            ← (auxiliar) device frame iOS
└── tweaks-panel.jsx         ← (auxiliar) painel de toggles
```

> Os três últimos são scaffolds só pra apresentação — não precisa portar.

---

## Como rodar o protótipo localmente

```sh
# qualquer servidor estático funciona
npx serve design_handoff_familia_ap/
# abre http://localhost:3000/App%20Fam%C3%ADlia%20AP.html
```

Não há build — tudo é React via Babel inline.

---

## Checklist pra implementação

- [ ] Criar projeto novo (RN ou Next)
- [ ] Carregar Geist + Caveat
- [ ] Definir tokens como CSS variables ou theme object
- [ ] Criar átomos: Icon, Card, Pill, MemberChips, BigNumber, Insight, ChatInput
- [ ] Implementar ScreenShell + ScreenTop + UserBubble
- [ ] Construir tela 01 (Casa) — referência de toda a linguagem
- [ ] Construir telas 02-08 reusando os átomos
- [ ] Implementar logo escolhido como componente
- [ ] Construir Web dashboard
- [ ] Adicionar transições de tela
- [ ] Conectar dados reais (Open Finance pra Finanças, manual pros outros módulos)
- [ ] Implementar chat com a AP (LLM no backend)

---

Boa sorte. Qualquer dúvida sobre intenção de design, abre o protótipo no navegador e usa o painel de Tweaks pra ver as variações ao vivo.
