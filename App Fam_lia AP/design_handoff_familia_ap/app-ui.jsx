// app-ui.jsx — atoms for the Noite Pierre design language.
// Conversational layout: top header → optional user-bubble → section row →
// big number → cards/rows → insight bar with sparkle → input.

// ── Icons (line, 1.6px, currentColor) ──────────────────────────────────
function Icon({ name, size = 18, color, stroke = 1.7 }) {
  const c = color || 'currentColor';
  const paths = {
    menu:    <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    chev:    <polyline points="9,18 15,12 9,6"/>,
    chevD:   <polyline points="6,9 12,15 18,9"/>,
    plus:    <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    mic:     <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/></>,
    photo:   <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M3 17l5-4 4 3 4-4 5 4"/></>,
    stop:    <rect x="6" y="6" width="12" height="12" rx="2" fill={c} stroke="none"/>,
    chart:   <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 019 9h-9z" fill={c} stroke="none" opacity="0.4"/></>,
    fork:    <><path d="M7 3v8a3 3 0 003 3v7"/><path d="M11 3v8M14 3a3 3 0 013 3v3a3 3 0 01-3 3v9"/></>,
    home:    <path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z"/>,
    mask:    <><path d="M3 7v6c0 4 4 8 9 8s9-4 9-8V7"/><circle cx="9" cy="11" r="1.2" fill={c} stroke="none"/><circle cx="15" cy="11" r="1.2" fill={c} stroke="none"/></>,
    bag:     <><path d="M5 8h14l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></>,
    file:    <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/></>,
    weight:  <><circle cx="12" cy="13" r="6"/><path d="M9 7h6l-1 1H10z"/></>,
    star:    <path d="M12 3l2.5 5.5 6 .5-4.5 4 1.5 6L12 16l-5.5 3 1.5-6L3.5 9l6-.5z"/>,
    plane:   <path d="M2 13l8-2 1.5-7 2 .5L12 11l7-1.5 1 1.5-6.5 4 1 7-2 .5-3-6L3 14z"/>,
    cal:     <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    cake:    <><path d="M5 11v9h14v-9"/><path d="M3 20h18"/><path d="M8 11V8m4 3V7m4 4V8"/></>,
    heart:   <path d="M12 21s-7-5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6-7 11-7 11z"/>,
    spark:   <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z" fill={c} stroke="none"/>,
    search:  <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></>,
    bank:    <><polygon points="3,9 12,4 21,9"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="5" y1="9" x2="5" y2="18"/><line x1="9" y1="9" x2="9" y2="18"/><line x1="15" y1="9" x2="15" y2="18"/><line x1="19" y1="9" x2="19" y2="18"/><line x1="3" y1="20" x2="21" y2="20"/></>,
    bell:    <><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// ── Member chip — overlapping circles (top-right of header) ─────────────
function MemberChips({ size = 26 }) {
  return (
    <div style={{ display: 'flex' }}>
      <div style={{
        width: size, height: size, borderRadius: size,
        background: 'var(--card2)',
        border: '1.5px solid var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color: 'var(--ink)',
      }}>A</div>
      <div style={{
        width: size, height: size, borderRadius: size,
        background: 'var(--accent)',
        border: '1.5px solid var(--bg)',
        marginLeft: -size * 0.4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color: 'var(--accent-on)',
      }}>C</div>
    </div>
  );
}

// ── Top header — hamburger + module name + chev + member chips ─────────
function ScreenTop({ module = 'Casa' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px 8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 17,
          background: 'var(--card)', color: 'var(--ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="menu" size={18} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{module}</span>
          <Icon name="chev" size={14} color="var(--muted)" stroke={2.2} />
        </div>
      </div>
      <MemberChips size={28} />
    </div>
  );
}

// ── Chat bubble — user-side, right-aligned (the question) ──────────────
function UserBubble({ children, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px 4px', ...style }}>
      <div style={{
        maxWidth: '82%',
        background: 'var(--card)',
        padding: '10px 14px',
        borderRadius: 18,
        borderBottomRightRadius: 6,
        fontSize: 14,
        lineHeight: 1.4,
        color: 'var(--ink-d)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Section row — small icon + label + chev (clickable category) ───────
function SectionRow({ icon, label, action = 'chev', style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px 8px', color: 'var(--muted)',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={15} color="var(--muted)" stroke={1.8} />}
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--muted-d)' }}>{label}</span>
      </div>
      {action === 'chev' && <Icon name="chev" size={13} color="var(--muted)" stroke={2} />}
      {typeof action === 'string' && action !== 'chev' && action !== 'none' && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{action}</span>
      )}
    </div>
  );
}

// ── Big number — hero data, Geist Black ────────────────────────────────
function BigNumber({ value, sub, style, accent }) {
  return (
    <div style={{ padding: '0 20px 6px', ...style }}>
      <div className="num" style={{
        fontSize: 36, color: accent ? 'var(--accent)' : 'var(--ink)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Insight bar — sparkle + AI text, sits above the input ──────────────
function Insight({ children, dot = 'spark' }) {
  return (
    <div style={{
      margin: '12px 20px 6px',
      padding: '12px 14px',
      background: 'var(--card)',
      borderRadius: 16,
      display: 'flex', gap: 10, alignItems: 'flex-start',
      fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-d)',
    }}>
      <Icon name={dot} size={16} color="var(--accent)" />
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

// ── Input row — "Converse com a AP" pinned just above home indicator ───
function ChatInput() {
  return (
    <div style={{
      margin: '8px 20px 0',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18,
        background: 'var(--card)', color: 'var(--muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="plus" size={18} />
      </div>
      <div style={{
        flex: 1, height: 36, borderRadius: 18,
        background: 'var(--card)', color: 'var(--muted)',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        fontSize: 13,
      }}>
        Converse com a AP
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: 18,
        background: 'var(--accent)', color: 'var(--accent-on)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="mic" size={16} color="var(--accent-on)" stroke={2} />
      </div>
    </div>
  );
}

// ── Card — rounded raised surface ──────────────────────────────────────
function Card({ children, style, pad = 14, raised }) {
  return (
    <div style={{
      background: raised ? 'var(--card)' : 'var(--surf)',
      borderRadius: 16,
      padding: pad,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Small pill — used sparingly for status (no rainbow chips) ──────────
function Pill({ children, tone = 'muted' }) {
  const tones = {
    muted: { bg: 'var(--card2)', fg: 'var(--muted-d)' },
    ok:    { bg: 'transparent',  fg: 'var(--ok)', border: 'var(--ok)' },
    alert: { bg: 'transparent',  fg: 'var(--alert)', border: 'var(--alert)' },
    accent:{ bg: 'transparent',  fg: 'var(--accent)', border: 'var(--accent)' },
  };
  const t = tones[tone] || tones.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 9.5, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      background: t.bg, color: t.fg,
      border: t.border ? `1px solid ${t.border}` : 'none',
    }}>{children}</span>
  );
}

// ── Money helper — formats "R$ 8.420,00" w/ Geist Black ────────────────
function Money({ value, size = 36, accent, prefix = 'R$', sign }) {
  const abs = Math.abs(value);
  const reais = Math.floor(abs).toLocaleString('pt-BR');
  const cents = String(Math.round((abs - Math.floor(abs)) * 100)).padStart(2, '0');
  return (
    <span className="num" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      fontSize: size,
      color: accent ? 'var(--accent)' : 'var(--ink)',
    }}>
      <span style={{ fontSize: size * 0.55 }}>
        {sign}{value < 0 ? '−' : ''}{prefix}
      </span>
      <span>{reais}<span style={{ opacity: 0.55 }}>,{cents}</span></span>
    </span>
  );
}

// ── List row — icon · title/sub · trailing value ───────────────────────
function ListRow({ icon, title, sub, value, valueSub, color, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0',
      borderBottom: last ? 'none' : '0.5px solid var(--line-d)',
    }}>
      {icon && (
        <div style={{
          width: 32, height: 32, borderRadius: 16,
          background: 'var(--card2)', color: color || 'var(--ink-d)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name={icon} size={15} stroke={1.8} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      {value && (
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 14, color: 'var(--ink)' }}>{value}</div>
          {valueSub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{valueSub}</div>}
        </div>
      )}
    </div>
  );
}

// ── Progress dot line ──────────────────────────────────────────────────
function Progress({ value, h = 4, color = 'var(--accent)' }) {
  return (
    <div style={{ background: 'var(--card2)', height: h, borderRadius: h/2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
    </div>
  );
}

// ── Stacked colored bar (categories) ───────────────────────────────────
function StackBar({ segments, h = 6, gap = 2 }) {
  return (
    <div style={{ display: 'flex', height: h, borderRadius: h/2, overflow: 'hidden', gap }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: s.value, background: s.color, borderRadius: 1 }} />
      ))}
    </div>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────
function Sparkline({ data, w = 100, h = 28, color = 'var(--accent)', fill = false, dot = true }) {
  const max = Math.max(...data), min = Math.min(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 2 - ((v - min) / r) * (h - 4);
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      {fill && <path d={path + ` L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {dot && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  );
}

// ── Screen shell — wraps an iOS device with the Pierre layout ──────────
// children = the in-screen content (between header and input).
function ScreenShell({ module = 'Casa', userQ, children, insight }) {
  return (
    <div className="ap-scope" style={{
      width: '100%', height: '100%',
      background: 'var(--bg)', color: 'var(--ink)',
      paddingTop: 54, paddingBottom: 34,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <ScreenTop module={module} />
      {userQ && <UserBubble>{userQ}</UserBubble>}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
      </div>
      {insight && <Insight>{insight}</Insight>}
      <ChatInput />
    </div>
  );
}

Object.assign(window, {
  Icon, MemberChips, ScreenTop, UserBubble, SectionRow, BigNumber,
  Insight, ChatInput, Card, Pill, Money, ListRow, Progress, StackBar,
  Sparkline, ScreenShell,
});
