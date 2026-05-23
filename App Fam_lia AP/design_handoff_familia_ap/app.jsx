// app.jsx — Noite Pierre · final assembly
// Logos + 8 mobile screens + web dashboard inside a DesignCanvas,
// with a TweaksPanel for accent / logo / light-mode swaps.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "lima",
  "logo": "simple",
  "dark": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = getTheme(t.dark, t.accent);

  React.useEffect(() => { applyTokens(theme, t.dark); }, [theme, t.dark]);

  // Logo helpers — pass the active theme so logo retones live.
  const logoFor = (id, size, mono) =>
    <Logo id={id} size={size} theme={theme} mono={mono} />;

  const phoneScreen = (Comp) => (
    <div className="ap-scope" style={{ width: '100%', height: '100%' }}>
      <IOSDevice width={402} height={874} dark={t.dark}>
        <Comp />
      </IOSDevice>
    </div>
  );

  return (
    <>
      <DesignCanvas>
        {/* ── LOGO ─────────────────────────────────────────── */}
        <DCSection
          id="logo"
          title="Logotipo"
          subtitle="Cinco variações manuscritas (Caveat). Use o painel Tweaks pra alternar a ativa — ela aparece no header da web e nos arquivos de marca."
        >
          {LOGO_IDS.map(id => (
            <DCArtboard
              key={id}
              id={id}
              label={LOGO_LABELS[id] + (id === t.logo ? ' · ATIVA' : '')}
              width={300}
              height={380}
            >
              <div className="ap-scope" style={{
                width: '100%', height: '100%', background: 'var(--bg)',
                display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 24, position: 'relative',
              }}>
                <div className="eyebrow">
                  {id === t.logo ? '— em uso —' : 'opção'}
                </div>

                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Logo id={id} size={160} theme={theme} />
                </div>

                {/* On-accent + on-light samples */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, background: 'var(--accent)', color: 'var(--accent-on)',
                    borderRadius: 12, padding: 12, height: 64,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Logo id={id} size={50} theme={{ ...theme, ink: theme.accentOn, muted: theme.accentOn }} mono={theme.accentOn} />
                  </div>
                  <div style={{
                    flex: 1, background: '#F4F0E4', color: '#0F0E0C',
                    borderRadius: 12, padding: 12, height: 64,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Logo id={id} size={50} theme={{ ...theme, ink: '#0F0E0C', muted: '#7A7367' }} mono="#0F0E0C" />
                  </div>
                </div>
              </div>
            </DCArtboard>
          ))}

          {/* Applications board */}
          <DCArtboard id="aplic" label="Aplicações · ícone, marca, paleta" width={340} height={380}>
            <div className="ap-scope" style={{
              width: '100%', height: '100%', background: 'var(--bg)',
              padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <div className="eyebrow">Aplicações</div>

              {/* App icons */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {[
                  { bg: 'var(--bg)',     fg: 'var(--ink)' },
                  { bg: 'var(--accent)', fg: 'var(--accent-on)' },
                  { bg: '#F4F0E4',       fg: '#0F0E0C' },
                ].map((s, i) => (
                  <div key={i} style={{
                    width: 64, height: 64, borderRadius: 14,
                    background: s.bg, color: s.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: s.bg === 'var(--bg)' ? '0.5px solid var(--line-d)' : 'none',
                  }}>
                    <Logo id={t.logo} size={40} theme={{ ...theme, ink: s.fg, muted: s.fg }} mono={s.fg} />
                  </div>
                ))}
              </div>

              {/* Marca + tagline */}
              <div style={{
                padding: 16, background: 'var(--card)', borderRadius: 14,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <Logo id={t.logo} size={80} theme={theme} />
              </div>

              {/* Palette */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Paleta</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    ['var(--bg)',     'bg'],
                    ['var(--surf)',   'surf'],
                    ['var(--card)',   'card'],
                    ['var(--ink)',    'ink'],
                    ['var(--accent)', theme.accentLabel.toLowerCase()],
                    ['var(--alert)',  'alert'],
                  ].map(([c, label], i) => (
                    <div key={i} style={{
                      flex: 1, aspectRatio: '1.4 / 1',
                      borderRadius: 8, background: c,
                      border: c === 'var(--bg)' ? '0.5px solid var(--line-d)' : 'none',
                      display: 'flex', alignItems: 'flex-end',
                      padding: 6,
                      fontSize: 9, fontWeight: 600, color: 'var(--muted)',
                      letterSpacing: '0.05em',
                    }}>{label}</div>
                  ))}
                </div>
              </div>
            </div>
          </DCArtboard>
        </DCSection>

        {/* ── MOBILE ───────────────────────────────────────── */}
        <DCSection
          id="mobile"
          title="App · iOS"
          subtitle="Tour completo dos módulos. Cada tela segue o mesmo ritmo: header → pergunta → categoria → dado grande → cards → insight da AP."
        >
          <DCArtboard id="casa"      label="01 · Casa"           width={402} height={874}>{phoneScreen(ScreenCasa)}</DCArtboard>
          <DCArtboard id="financas"  label="02 · Finanças"        width={402} height={874}>{phoneScreen(ScreenFinancas)}</DCArtboard>
          <DCArtboard id="exames"    label="03 · Saúde · Exames"  width={402} height={874}>{phoneScreen(ScreenExames)}</DCArtboard>
          <DCArtboard id="peso"      label="04 · Saúde · Peso"     width={402} height={874}>{phoneScreen(ScreenPeso)}</DCArtboard>
          <DCArtboard id="sonhos"    label="05 · Sonhos"           width={402} height={874}>{phoneScreen(ScreenSonhos)}</DCArtboard>
          <DCArtboard id="viagens"   label="06 · Viagens"          width={402} height={874}>{phoneScreen(ScreenViagens)}</DCArtboard>
          <DCArtboard id="cal"       label="07 · Calendário"       width={402} height={874}>{phoneScreen(ScreenCalendario)}</DCArtboard>
          <DCArtboard id="aniv"      label="08 · Aniversários"     width={402} height={874}>{phoneScreen(ScreenAniversarios)}</DCArtboard>
        </DCSection>

        {/* ── WEB ──────────────────────────────────────────── */}
        <DCSection
          id="web"
          title="Web · desktop"
          subtitle="Mesma linguagem em 1200×760. O input de chat fica fixo no rodapé, igual no app."
        >
          <DCArtboard id="dash" label="Dashboard · Casa" width={1200} height={760}>
            <WebDashboard logo={logoFor(t.logo, 38)} theme={theme} />
          </DCArtboard>
        </DCSection>

        <DCPostIt top={-10} left={70} rotate={-2} width={220}>
          Painel <b>Tweaks</b> (canto inferior direito) → troca acento, logo e modo claro/escuro ao vivo.
        </DCPostIt>
      </DesignCanvas>

      <TweaksPanel title="Família AP">
        <TweakSection label="Identidade">
          <TweakSelect
            label="Logo ativa"
            value={t.logo}
            options={LOGO_IDS.map(id => ({ value: id, label: LOGO_LABELS[id] }))}
            onChange={v => setTweak('logo', v)}
          />
        </TweakSection>

        <TweakSection label="Cor de acento">
          <AccentChips value={t.accent} onChange={v => setTweak('accent', v)} dark={t.dark} />
        </TweakSection>

        <TweakSection label="Modo">
          <TweakToggle label="Escuro" value={t.dark} onChange={v => setTweak('dark', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Curated chip row for accents — each chip is a solid swatch of the
// active-mode color so users see exactly what they'll get.
function AccentChips({ value, onChange, dark }) {
  const opts = Object.keys(ACCENTS);
  return (
    <div className="twk-chips" role="radiogroup">
      {opts.map(k => {
        const a = ACCENTS[k];
        const c = dark ? a.night : a.day;
        const on = k === value;
        return (
          <button
            key={k}
            type="button"
            className="twk-chip"
            role="radio"
            aria-checked={on}
            data-on={on ? '1' : '0'}
            aria-label={a.label}
            title={a.label}
            style={{ background: c }}
            onClick={() => onChange(k)}
          />
        );
      })}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
