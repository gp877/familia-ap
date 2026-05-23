// tokens.jsx — Noite Pierre design tokens for App Família AP.
// Dark-first, monochromatic with pointed color accents.

// Single base palette — accent is tweakable.
const NIGHT = {
  bg:    '#0A0A0A',
  surf:  '#141414',   // first card layer
  card:  '#1C1C1C',   // raised card
  card2: '#262626',   // bubble / chip
  ink:   '#FAFAFA',
  inkD:  '#E8E8E8',
  muted: '#7A7A7A',
  mutedD:'#9C9C9C',
  line:  '#262626',
  lineD: '#333333',
  // Persistent semantic colors used regardless of accent
  alert: '#FF7A35',
  ok:    '#7BD86F',
};

// Light alternative — single toggle, mirrors the structure.
const DAY = {
  bg:    '#F4F0E4',
  surf:  '#ECE7D6',
  card:  '#FFFFFF',
  card2: '#E0DAC4',
  ink:   '#0F0E0C',
  inkD:  '#26241F',
  muted: '#7A7367',
  mutedD:'#5E5950',
  line:  '#DCD5C0',
  lineD: '#C4BCA3',
  alert: '#C84E1F',
  ok:    '#4A6B3A',
};

const ACCENTS = {
  lima:    { label: 'Lima',     night: '#B8FF5C', day: '#5A8533', textOn: '#0A0A0A' },
  azul:    { label: 'Azul',     night: '#5DA9FF', day: '#1E5FAB', textOn: '#0A0A0A' },
  ambar:   { label: 'Âmbar',    night: '#FFB85C', day: '#A36A1A', textOn: '#0A0A0A' },
  coral:   { label: 'Coral',    night: '#FF8866', day: '#B84926', textOn: '#0A0A0A' },
};

function getTheme(dark, accentKey) {
  const base = dark ? NIGHT : DAY;
  const a = ACCENTS[accentKey] || ACCENTS.lima;
  return {
    ...base,
    accent: dark ? a.night : a.day,
    accentOn: a.textOn,
    accentLabel: a.label,
  };
}

function applyTokens(theme, dark) {
  const css = `
    .ap-scope {
      --bg: ${theme.bg};
      --surf: ${theme.surf};
      --card: ${theme.card};
      --card2: ${theme.card2};
      --ink: ${theme.ink};
      --ink-d: ${theme.inkD};
      --muted: ${theme.muted};
      --muted-d: ${theme.mutedD};
      --line: ${theme.line};
      --line-d: ${theme.lineD};
      --accent: ${theme.accent};
      --accent-on: ${theme.accentOn};
      --alert: ${theme.alert};
      --ok: ${theme.ok};
      --font-display: 'Geist', system-ui, sans-serif;
      --font-body: 'Geist', system-ui, sans-serif;
      --font-script: 'Caveat', cursive;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      color-scheme: ${dark ? 'dark' : 'light'};
    }
    .ap-scope * { box-sizing: border-box; }
    .ap-scope .num,
    .ap-scope .display {
      font-family: var(--font-display);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.0;
      font-variant-numeric: tabular-nums;
    }
    .ap-scope .eyebrow {
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .ap-scope .script {
      font-family: var(--font-script);
      font-weight: 700;
      letter-spacing: 0.005em;
    }
  `;
  let el = document.getElementById('ap-tokens');
  if (!el) {
    el = document.createElement('style');
    el.id = 'ap-tokens';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

Object.assign(window, { NIGHT, DAY, ACCENTS, getTheme, applyTokens });
