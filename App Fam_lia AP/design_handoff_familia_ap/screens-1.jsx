// screens-1.jsx — Casa, Finanças, Saúde·Exames, Saúde·Peso
// Pierre pattern: top header → user question → section label → hero data
// → cards/rows → insight → input.

// ── 1. CASA / HOME ─────────────────────────────────────────────────────
function ScreenCasa() {
  const modules = [
    { id: 'fin',   label: 'Finanças',     val: 'R$ 8.420',   sub: '72% do orçamento · maio',  icon: 'bag' },
    { id: 'ex',    label: 'Saúde',         val: 'Em 23 dias', sub: 'próximo check-up de Augusto', icon: 'mask' },
    { id: 'son',   label: 'Sonhos',        val: '4 ativos',   sub: '1 acima de 80%',           icon: 'star' },
    { id: 'via',   label: 'Viagens',       val: 'Lisboa',     sub: 'em 4 dias · 14 noites',    icon: 'plane' },
    { id: 'cal',   label: 'Calendário',    val: '5 datas',     sub: 'nos próximos 7 dias',     icon: 'cal' },
    { id: 'aniv',  label: 'Aniversários',  val: 'Vó Inês',     sub: 'em 3 dias · faz 78',      icon: 'cake' },
  ];
  return (
    <ScreenShell
      module="Casa"
      userQ="Fala AP, como estamos hoje?"
      insight={<>Sábado tranquilo aqui na casa — <b>R$ 3.180 ainda livres</b> no mês e dois compromissos pra semana. Quer que eu reforce a meta de Lisboa?</>}
    >
      <SectionRow icon="chart" label="Resumo de hoje" />
      <BigNumber
        value="R$ 3.180,00"
        sub="livres do orçamento · sábado, 23 mai"
      />

      <SectionRow icon="home" label="O que tá rolando" />
      <div style={{ padding: '0 20px' }}>
        {modules.map((m, i) => (
          <ListRow
            key={m.id}
            icon={m.icon}
            title={m.label}
            sub={m.sub}
            value={m.val}
            last={i === modules.length - 1}
          />
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 2. FINANÇAS — directly modeled on the Pierre reference ─────────────
function ScreenFinancas() {
  const cats = [
    { label: 'Alimentação',  pct: 28, val: 'R$ 2.358', color: 'var(--accent)',  icon: 'fork' },
    { label: 'Casa',         pct: 22, val: 'R$ 1.852', color: 'var(--alert)',   icon: 'home' },
    { label: 'Lazer',        pct: 14, val: 'R$ 1.179', color: '#5DA9FF',        icon: 'mask' },
    { label: 'Saúde',        pct: 9,  val: 'R$ 758',   color: '#B57FFF',        icon: 'mask' },
  ];
  return (
    <ScreenShell
      module="Finanças"
      userQ="Fala AP, me mostra os gastos desse mês"
      insight={<>Vocês gastaram <b>R$ 384,50 no mercado hoje</b>. Tá no ritmo de maio — sobram R$ 3.180 pro fim do mês.</>}
    >
      <SectionRow icon="chart" label="Gastos por categoria" action="maio · 26 dias" />
      <BigNumber
        value="R$ 8.420,00"
        sub="de R$ 11.600 · 27% livre"
      />

      <div style={{ padding: '12px 20px 0' }}>
        <StackBar
          h={6}
          segments={[
            { value: 28, color: 'var(--accent)' },
            { value: 22, color: 'var(--alert)' },
            { value: 14, color: '#5DA9FF' },
            { value: 9,  color: '#B57FFF' },
            { value: 27, color: 'var(--card2)' },
          ]}
        />
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        {cats.map((c, i) => (
          <ListRow
            key={i}
            icon={c.icon}
            title={c.label}
            sub={`${c.pct}% dos gastos`}
            value={c.val}
            color={c.color}
            last={i === cats.length - 1}
          />
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 3. SAÚDE · EXAMES ──────────────────────────────────────────────────
function ScreenExames() {
  const exams = [
    { d: '12 mai 26', name: 'Check-up cardio',  dr: 'Dr. Salles',  status: 'ok',     note: 'CK e CKMB normais', who: 'A' },
    { d: '04 abr 26', name: 'Sangue completo',   dr: 'Lab Sabin',   status: 'ok',     note: 'Tudo dentro',       who: 'A' },
    { d: '18 fev 26', name: 'Colesterol total',  dr: 'Lab Sabin',   status: 'atencao',note: 'LDL no limite alto', who: 'A' },
    { d: '02 mai 26', name: 'Mama · USG',        dr: 'Dra. Reis',   status: 'ok',     note: 'Sem alterações',    who: 'C' },
    { d: '14 mar 26', name: 'Tireoide · TSH',    dr: 'Lab Sabin',   status: 'ok',     note: '2,1 mUI/L',          who: 'C' },
  ];
  return (
    <ScreenShell
      module="Saúde"
      userQ="Quando foi o último check-up nosso?"
      insight={<>Próximo check-up de <b>Augusto em 15 jun</b>. Já marquei lembrete três dias antes — quer convidar a Camila pra ir junto?</>}
    >
      <SectionRow icon="file" label="Exames recentes" action="5 nos últimos 90 dias" />
      <div style={{ padding: '0 20px' }}>
        <div className="num" style={{ fontSize: 32, color: 'var(--ink)' }}>12 mai</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Check-up cardio · Augusto</span>
          <Pill tone="ok">ok</Pill>
        </div>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        {exams.map((e, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            padding: '12px 0',
            borderBottom: i < exams.length - 1 ? '0.5px solid var(--line-d)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: e.who === 'A' ? 'var(--card2)' : 'var(--accent)',
              color: e.who === 'A' ? 'var(--ink)' : 'var(--accent-on)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{e.who}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)', flexShrink: 0 }}>{e.d}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{e.dr}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill tone={e.status === 'ok' ? 'ok' : 'alert'}>{e.status === 'ok' ? 'ok' : 'atenção'}</Pill>
                <span style={{ fontSize: 11.5, color: 'var(--ink-d)', opacity: 0.85 }}>{e.note}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 4. SAÚDE · PESO ────────────────────────────────────────────────────
function ScreenPeso() {
  const augusto = [86.4, 86.0, 85.8, 85.3, 85.0, 84.7, 84.4, 84.1, 83.8, 84.0, 83.6, 83.4];
  const camila  = [62.2, 62.4, 62.0, 61.8, 61.6, 61.5, 61.3, 61.5, 61.2, 61.0, 60.9, 60.7];
  return (
    <ScreenShell
      module="Peso"
      userQ="Como tá o peso nosso essas semanas?"
      insight={<>Vocês perderam <b>4,5 kg juntos</b> em 12 semanas. Augusto a 1,4 kg da meta — manda eu lembrar de pesar no domingo?</>}
    >
      <SectionRow icon="weight" label="Últimas 12 semanas" action="12 sem" />
      <BigNumber value="−4,5 kg" sub="vocês dois · desde 1º março" />

      <div style={{ padding: '14px 20px 0' }}>
        <Card pad={14} raised>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Augusto · 83,4 kg</span>
            <span style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 700, letterSpacing: '0.08em' }}>▼ 3,0 kg</span>
          </div>
          <Sparkline data={augusto} w={320} h={48} color="var(--accent)" fill />
        </Card>
        <div style={{ height: 10 }} />
        <Card pad={14} raised>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Camila · 60,7 kg</span>
            <span style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 700, letterSpacing: '0.08em' }}>▼ 1,5 kg</span>
          </div>
          <Sparkline data={camila} w={320} h={48} color="#5DA9FF" fill />
        </Card>
      </div>

      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10 }}>
        <Card pad={12} style={{ flex: 1 }}>
          <div className="num" style={{ fontSize: 22, color: 'var(--accent)' }}>83%</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>Meta de Augusto · 82 kg</div>
        </Card>
        <Card pad={12} style={{ flex: 1 }}>
          <div className="num" style={{ fontSize: 22 }}>4×</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>Caminhadas nesta semana</div>
        </Card>
      </div>
    </ScreenShell>
  );
}

Object.assign(window, { ScreenCasa, ScreenFinancas, ScreenExames, ScreenPeso });
