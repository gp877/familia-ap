// logos.jsx — Handwritten "AP" identity for Família AP.
// Five variations, all in Caveat (script), some paired with a tiny line drawing.
// Each accepts { size, theme, mono } and renders inline.

// ── small line-drawn glyphs (single-stroke, organic) ───────────────────
function HouseGlyph({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      stroke={color || 'currentColor'} strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 16 L 16 6 L 27 16 M 8 14 L 8 26 L 24 26 L 24 14 M 13 26 L 13 19 L 19 19 L 19 26" />
    </svg>
  );
}

function HeartGlyph({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      stroke={color || 'currentColor'} strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 27 C 10 22, 4 18, 4 12 C 4 8, 8 5, 12 5 C 14 5, 15 7, 16 8 C 17 7, 18 5, 20 5 C 24 5, 28 8, 28 12 C 28 18, 22 22, 16 27 Z" />
    </svg>
  );
}

function RingsGlyph({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 32" fill="none"
      stroke={color || 'currentColor'} strokeWidth="1.6">
      <circle cx="13" cy="16" r="9" />
      <circle cx="23" cy="16" r="9" />
    </svg>
  );
}

function SparkleGlyph({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color || 'currentColor'}>
      <path d="M16 4 C 17 11, 21 15, 28 16 C 21 17, 17 21, 16 28 C 15 21, 11 17, 4 16 C 11 15, 15 11, 16 4 Z" />
    </svg>
  );
}

// ── 1. Apenas "ap." ─────────────────────────────────────────────────────
function LogoSimple({ size = 120, theme, mono }) {
  const ink = mono || theme.ink;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span className="script" style={{
        fontFamily: 'Caveat, cursive', fontWeight: 700,
        fontSize: size * 0.95, lineHeight: 0.85,
        color: ink, letterSpacing: '-0.01em',
      }}>
        ap.
      </span>
      <span style={{
        fontSize: size * 0.085, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: theme.muted, marginTop: -4,
      }}>
        família augusto piffer
      </span>
    </div>
  );
}

// ── 2. "ap" + casa pequena ─────────────────────────────────────────────
function LogoCasa({ size = 120, theme, mono }) {
  const ink = mono || theme.ink;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.08 }}>
      <HouseGlyph size={size * 0.55} color={ink} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="script" style={{
          fontFamily: 'Caveat, cursive', fontWeight: 700,
          fontSize: size * 0.88, lineHeight: 0.85,
          color: ink, letterSpacing: '-0.01em',
        }}>
          ap
        </span>
        <span style={{
          fontSize: size * 0.082, fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: theme.muted, marginTop: 2,
        }}>
          família ap
        </span>
      </div>
    </div>
  );
}

// ── 3. Coração + AP, layout vertical ───────────────────────────────────
function LogoCoracao({ size = 120, theme, mono }) {
  const ink = mono || theme.ink;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.08 }}>
      <HeartGlyph size={size * 0.55} color={ink} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="script" style={{
          fontFamily: 'Caveat, cursive', fontWeight: 700,
          fontSize: size * 0.88, lineHeight: 0.85,
          color: ink, letterSpacing: '-0.01em',
        }}>
          ap
        </span>
        <span style={{
          fontSize: size * 0.082, fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: theme.muted, marginTop: 2,
        }}>
          família
        </span>
      </div>
    </div>
  );
}

// ── 4. "família ap" wordmark inteiro, manuscrito ───────────────────────
// SVG with a viewBox so the text auto-scales to whatever box we render in.
function LogoWordmark({ size = 120, theme, mono }) {
  const ink = mono || theme.ink;
  // viewBox sized so 'família ap' in Caveat at 88px lays out near-exactly
  // inside 240×80 — keeping a constant aspect ratio at every render size.
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <svg width={size * 1.4} height={size * 0.5} viewBox="0 0 240 84" style={{ overflow: 'visible' }}>
        <text
          x="0" y="64"
          fontFamily="Caveat, cursive"
          fontWeight="700"
          fontSize="88"
          fill={ink}
          textLength="240"
          lengthAdjust="spacingAndGlyphs"
        >família ap</text>
      </svg>
      <span style={{
        fontSize: size * 0.085, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: theme.muted, marginTop: 2,
        whiteSpace: 'nowrap',
      }}>
        augusto · piffer · 2014
      </span>
    </div>
  );
}

// ── 5. Argolas (casal) + AP ────────────────────────────────────────────
function LogoArgolas({ size = 120, theme, mono }) {
  const ink = mono || theme.ink;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.06 }}>
      <RingsGlyph size={size * 0.62} color={ink} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="script" style={{
          fontFamily: 'Caveat, cursive', fontWeight: 700,
          fontSize: size * 0.88, lineHeight: 0.85,
          color: ink, letterSpacing: '-0.01em',
        }}>
          a&p
        </span>
        <span style={{
          fontSize: size * 0.082, fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: theme.muted, marginTop: 2,
        }}>
          família ap
        </span>
      </div>
    </div>
  );
}

// Dispatcher
function Logo({ id = 'simple', size = 120, theme, mono }) {
  const map = {
    simple:    LogoSimple,
    casa:      LogoCasa,
    coracao:   LogoCoracao,
    wordmark:  LogoWordmark,
    argolas:   LogoArgolas,
  };
  const C = map[id] || LogoSimple;
  return <C size={size} theme={theme} mono={mono} />;
}

const LOGO_IDS = ['simple', 'casa', 'coracao', 'wordmark', 'argolas'];
const LOGO_LABELS = {
  simple:    'ap. · puro',
  casa:      'ap + casa',
  coracao:   'ap + coração',
  wordmark:  'família ap · manuscrito',
  argolas:   'a&p · casal',
};

Object.assign(window, {
  Logo, LogoSimple, LogoCasa, LogoCoracao, LogoWordmark, LogoArgolas,
  HouseGlyph, HeartGlyph, RingsGlyph, SparkleGlyph,
  LOGO_IDS, LOGO_LABELS,
});
