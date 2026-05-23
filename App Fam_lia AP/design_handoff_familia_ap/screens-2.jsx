// screens-2.jsx — Sonhos, Viagens, Calendário, Aniversários

// ── 5. SONHOS ──────────────────────────────────────────────────────────
function ScreenSonhos() {
  const dreams = [
    { title: 'Meia-maratona do Rio', pct: 84, sub: '12 km feitos · 4×/sem',     deadline: 'ago/26',     who: 'Augusto' },
    { title: 'Itália em maio',        pct: 62, sub: 'R$ 18.600 reservado',       deadline: 'em 12 meses', who: 'Casal' },
    { title: 'Aprender italiano',     pct: 41, sub: 'Nível A2 · Duolingo 220d',  deadline: 'sem prazo',   who: 'Camila' },
    { title: 'Casa na praia',         pct: 38, sub: 'R$ 76 mil de R$ 200 mil',   deadline: 'até 2028',    who: 'Casal' },
  ];
  return (
    <ScreenShell
      module="Sonhos"
      userQ="O que a gente mais quer pros próximos 3 anos?"
      insight={<>A <b>meia-maratona tá quase</b> — se você bater 14km no domingo, passa de 90%. E se sobrar R$ 600/mês, a Itália vira em fevereiro.</>}
    >
      <SectionRow icon="star" label="4 sonhos em andamento" action="2 com prazo" />
      <BigNumber value="84%" sub="meia-maratona do Rio · agosto" accent />

      <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dreams.map((d, i) => (
          <Card key={i} pad={14} raised>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  {d.deadline} · {d.who}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginTop: 4, letterSpacing: '-0.01em' }}>
                  {d.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{d.sub}</div>
              </div>
              <div className="num" style={{
                fontSize: 22,
                color: d.pct >= 80 ? 'var(--accent)' : 'var(--ink)',
              }}>{d.pct}%</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Progress
                value={d.pct}
                color={d.pct >= 80 ? 'var(--accent)' : 'var(--ink-d)'}
                h={3}
              />
            </div>
          </Card>
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 6. VIAGENS ─────────────────────────────────────────────────────────
function ScreenViagens() {
  const trips = [
    { city: 'Buenos Aires', country: 'AR', dates: '12–17 fev', nights: 5,  status: 'feito' },
    { city: 'Maragogi',     country: 'BR', dates: '4–10 abr',  nights: 6,  status: 'feito' },
    { city: 'Lisboa+Porto', country: 'PT', dates: '27 mai–10 jun', nights: 14, status: 'próxima' },
  ];
  return (
    <ScreenShell
      module="Viagens"
      userQ="Como tá o ano de viagens?"
      insight={<>Em 4 dias vocês embarcam pra <b>Lisboa</b>. Faltam 2 reservas de restaurante no roteiro — quer que eu liste?</>}
    >
      <SectionRow icon="plane" label="Resumo de 2026" action="3 destinos" />
      <BigNumber value="25 noites" sub="14k km · 3 cidades · 2 países" />

      <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((t, i) => (
          <Card key={i} pad={14} raised={t.status === 'próxima'} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: t.status === 'próxima' ? 'var(--accent)' : 'var(--card2)',
              color: t.status === 'próxima' ? 'var(--accent-on)' : 'var(--ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Geist', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em',
              flexShrink: 0,
            }}>{t.country}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{t.city}</span>
                {t.status === 'próxima' && <Pill tone="accent">próxima</Pill>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                {t.dates} · {t.nights} noites
              </div>
            </div>
          </Card>
        ))}
      </div>

      <SectionRow icon="bank" label="Orçamento da viagem" />
      <div style={{ padding: '0 20px' }}>
        <ListRow title="Reservado" sub="meta · R$ 12.000" value="R$ 6.450" valueSub="54%" last />
        <Progress value={54} h={3} color="var(--accent)" />
      </div>
    </ScreenShell>
  );
}

// ── 7. CALENDÁRIO ──────────────────────────────────────────────────────
function ScreenCalendario() {
  const events = [
    { d: 'Hoje',   t: '19:00', label: 'Jantar com vó Inês',     who: 'Casal',   tone: 'accent' },
    { d: 'Seg 25', t: '08:00', label: 'Check-up Dra. Reis',     who: 'Camila',  tone: 'muted' },
    { d: 'Qua 27', t: '22:05', label: 'Voo SP → Lisboa',         who: 'Casal',   tone: 'accent' },
    { d: 'Sex 29', t: '15:00', label: 'Reunião condomínio',     who: 'Augusto', tone: 'muted' },
    { d: 'Dom 31', t: '09:00', label: 'Caminhada juntos · 6km', who: 'Casal',   tone: 'muted' },
  ];
  return (
    <ScreenShell
      module="Calendário"
      userQ="O que tem essa semana?"
      insight={<>Cinco compromissos. O <b>voo pra Lisboa</b> é o mais importante — check-in já liberado pelo app da LATAM.</>}
    >
      <SectionRow icon="cal" label="Próximos 7 dias" action="23 – 31 mai" />
      <BigNumber value="Hoje · 19h" sub="jantar com vó Inês · em 4h" accent />

      <div style={{ padding: '14px 20px 0' }}>
        {events.map((e, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < events.length - 1 ? '0.5px solid var(--line-d)' : 'none',
          }}>
            <div style={{
              width: 56, textAlign: 'right',
              display: 'flex', flexDirection: 'column',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{e.d}</span>
              <span className="num" style={{ fontSize: 15, color: e.tone === 'accent' ? 'var(--accent)' : 'var(--ink)', marginTop: 2 }}>{e.t}</span>
            </div>
            <div style={{ width: 2, height: 30, background: e.tone === 'accent' ? 'var(--accent)' : 'var(--line-d)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{e.who}</div>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 8. ANIVERSÁRIOS ────────────────────────────────────────────────────
function ScreenAniversarios() {
  const dates = [
    { name: 'Vó Inês',            d: '26 mai', days: 3,   detail: 'faz 78 · avó da Camila' },
    { name: 'Augusto + Camila',   d: '14 jun', days: 22,  detail: '12 anos de casados' },
    { name: 'Pedro Piffer',       d: '02 jul', days: 40,  detail: 'sobrinho · 8 anos' },
    { name: 'Camila',             d: '11 ago', days: 80,  detail: 'esposa · 40 anos' },
    { name: 'Sogro',              d: '03 set', days: 103, detail: 'pai da Camila · 72 anos' },
  ];
  return (
    <ScreenShell
      module="Aniversários"
      userQ="Quem faz aniversário esse mês?"
      insight={<>Vó Inês <b>em 3 dias</b>. Já tem presente? Ano passado vocês deram um xale — eu lembro se quiser uma sugestão.</>}
    >
      <SectionRow icon="cake" label="Próximos 5" action="3 meses" />
      <div style={{ padding: '0 20px' }}>
        <div className="num" style={{ fontSize: 36, color: 'var(--accent)' }}>3 dias</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          até o aniversário da vó Inês · faz 78
        </div>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        {dates.map((d, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < dates.length - 1 ? '0.5px solid var(--line-d)' : 'none',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: i === 0 ? 'var(--accent)' : 'var(--card2)',
              color: i === 0 ? 'var(--accent-on)' : 'var(--ink)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span className="num" style={{ fontSize: 14, lineHeight: 1 }}>{d.d.split(' ')[0]}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{d.d.split(' ')[1]}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{d.detail}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {d.days < 10 ? `em ${d.days}d` : `${d.days}d`}
            </span>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

Object.assign(window, { ScreenSonhos, ScreenViagens, ScreenCalendario, ScreenAniversarios });
