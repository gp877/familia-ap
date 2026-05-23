// web-view.jsx — desktop dashboard in the same Noite Pierre language.
// 1200×760 frame: left rail with logo + modules, main content area.

function WebDashboard({ logo, theme }) {
  return (
    <div className="ap-scope" style={{
      width: '100%', height: '100%',
      background: 'var(--bg)', color: 'var(--ink)',
      display: 'grid', gridTemplateColumns: '240px 1fr',
      overflow: 'hidden',
    }}>
      {/* ── SIDEBAR ───────────────────────────────────────── */}
      <aside style={{
        background: 'var(--surf)',
        padding: '28px 20px 24px',
        display: 'flex', flexDirection: 'column', gap: 24,
        borderRight: '0.5px solid var(--line-d)',
      }}>
        <div style={{ paddingLeft: 4 }}>
          {logo}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
          {[
            { i: 'home',  l: 'Casa',         on: true },
            { i: 'bag',   l: 'Finanças' },
            { i: 'mask',  l: 'Saúde' },
            { i: 'star',  l: 'Sonhos' },
            { i: 'plane', l: 'Viagens' },
            { i: 'cal',   l: 'Calendário' },
            { i: 'cake',  l: 'Aniversários' },
          ].map(n => (
            <div key={n.l} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 10px', borderRadius: 10,
              background: n.on ? 'var(--card)' : 'transparent',
              color: n.on ? 'var(--ink)' : 'var(--muted-d)',
              fontSize: 13.5, fontWeight: n.on ? 600 : 500,
              cursor: 'pointer',
            }}>
              <Icon name={n.i} size={17} stroke={n.on ? 2 : 1.6} />
              {n.l}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 6px 4px', borderTop: '0.5px solid var(--line-d)' }}>
          <MemberChips size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Augusto + Camila</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>casa cheia · 2 contas</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────── */}
      <main style={{
        overflow: 'hidden', padding: '28px 32px 24px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Top: greeting + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div className="eyebrow">sábado · 23 maio</div>
            <h1 style={{ margin: '8px 0 0', fontSize: 36, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 }}>
              Oi, Augusto.
            </h1>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', background: 'var(--card)', color: 'var(--muted-d)',
            borderRadius: 999, width: 320, fontSize: 13,
          }}>
            <Icon name="search" size={15} color="var(--muted)" />
            <span style={{ flex: 1 }}>Pergunte ou busque…</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--card2)', padding: '2px 6px', borderRadius: 4 }}>⌘ K</span>
          </div>
        </div>

        {/* Question bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            background: 'var(--card)', padding: '10px 16px',
            borderRadius: 18, borderBottomRightRadius: 6,
            fontSize: 14, color: 'var(--ink-d)', maxWidth: '60%',
          }}>
            Fala AP, me dá um resumo da semana
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { eb: 'gasto · maio',     big: 'R$ 8.420',  sub: '72% de R$ 11.600',    accent: false },
            { eb: 'sobrou pro mês',   big: 'R$ 3.180',  sub: '27% livre',           accent: true  },
            { eb: 'próximo voo',      big: 'Lisboa',    sub: 'em 4 dias · 14 noites', accent: false },
            { eb: 'peso · 12 sem',    big: '−4,5 kg',   sub: 'vocês dois',          accent: false },
          ].map((k, i) => (
            <div key={i} style={{
              background: 'var(--card)', borderRadius: 18, padding: 18,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div className="eyebrow">{k.eb}</div>
              <div className="num" style={{
                fontSize: 32,
                color: k.accent ? 'var(--accent)' : 'var(--ink)',
              }}>{k.big}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 2-col body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Left col */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
            <div style={{ background: 'var(--card)', borderRadius: 18, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div className="eyebrow">gastos por categoria</div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>maio · 26 dias</span>
              </div>
              <StackBar
                h={8}
                segments={[
                  { value: 28, color: 'var(--accent)' },
                  { value: 22, color: 'var(--alert)' },
                  { value: 14, color: '#5DA9FF' },
                  { value: 9,  color: '#B57FFF' },
                  { value: 27, color: 'var(--card2)' },
                ]}
              />
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 24, rowGap: 4 }}>
                {[
                  { c: 'var(--accent)', l: 'Alimentação', v: 'R$ 2.358', p: '28%' },
                  { c: 'var(--alert)',  l: 'Casa',        v: 'R$ 1.852', p: '22%' },
                  { c: '#5DA9FF',       l: 'Lazer',       v: 'R$ 1.179', p: '14%' },
                  { c: '#B57FFF',       l: 'Saúde',       v: 'R$ 758',   p: '9%' },
                ].map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: c.c }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-d)' }}>{c.l}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32, textAlign: 'right' }}>{c.p}</span>
                    <span className="num" style={{ fontSize: 13, minWidth: 76, textAlign: 'right' }}>{c.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>
              <div style={{ background: 'var(--card)', borderRadius: 18, padding: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>peso · 12 sem</div>
                <Sparkline
                  data={[86.4,86,85.8,85.3,85,84.7,84.4,84.1,83.8,84,83.6,83.4]}
                  w={260} h={56} color="var(--accent)" fill
                />
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>83,4 kg</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>Augusto · ▼ 3,0 kg</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 22 }}>60,7 kg</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>Camila · ▼ 1,5 kg</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--card)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column' }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>sonhos · em andamento</div>
                {[
                  { t: 'Meia-maratona do Rio', pct: 84 },
                  { t: 'Itália em maio/27',    pct: 62 },
                  { t: 'Casa na praia',        pct: 38 },
                ].map((d, i) => (
                  <div key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-d)' }}>{d.t}</span>
                      <span className="num" style={{ fontSize: 13, color: d.pct >= 80 ? 'var(--accent)' : 'var(--ink)' }}>{d.pct}%</span>
                    </div>
                    <Progress value={d.pct} h={3} color={d.pct >= 80 ? 'var(--accent)' : 'var(--ink-d)'} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right col */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
            <div style={{ background: 'var(--card)', borderRadius: 18, padding: 18, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="eyebrow">próximas datas</div>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>ver tudo →</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                {[
                  { d: 26, m: 'mai', t: 'Niver da vó Inês',  sub: 'em 3 dias · faz 78',   accent: true },
                  { d: 27, m: 'mai', t: 'Voo SP → Lisboa',    sub: '22h05 · LATAM 8084',   accent: true },
                  { d: 29, m: 'mai', t: 'Reunião condomínio', sub: '15h · Augusto',        accent: false },
                  { d: 14, m: 'jun', t: '12 anos de casados', sub: 'em 22 dias',           accent: false },
                  { d: 11, m: 'ago', t: 'Camila faz 40',       sub: 'em 80 dias',           accent: false },
                ].map((u, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '8px 0' }}>
                    <div style={{
                      width: 42, height: 46, borderRadius: 10,
                      background: u.accent ? 'var(--accent)' : 'var(--card2)',
                      color: u.accent ? 'var(--accent-on)' : 'var(--ink)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span className="num" style={{ fontSize: 16, lineHeight: 1 }}>{u.d}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>{u.m}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.t}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{u.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'var(--card)', borderRadius: 18, padding: 16,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <Icon name="spark" size={20} color="var(--accent)" />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: 'var(--ink-d)' }}>
                Sábado tranquilo. Vocês ainda têm <b>R$ 3.180 livres</b> esse mês — dá pra reforçar a meta de Lisboa antes do voo de quarta.
              </div>
            </div>
          </div>
        </div>

        {/* Bottom chat input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'var(--card)', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="plus" size={18} />
          </div>
          <div style={{
            flex: 1, height: 40, borderRadius: 20,
            background: 'var(--card)', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', padding: '0 18px',
            fontSize: 13.5,
          }}>
            Converse com a AP
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'var(--accent)', color: 'var(--accent-on)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="mic" size={16} color="var(--accent-on)" stroke={2} />
          </div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { WebDashboard });
