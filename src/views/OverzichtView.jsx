import { useState, useMemo } from 'react'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { ENVS, STATUS_CFG } from '../lib/chainUtils.js'
import { datum, STATUS_LABEL } from '../lib/releasePlan.js'
import { Chip, EnvChip, Spinner, Banner, Leeg } from '../components/ui/index.jsx'
import { GEEL, BLAUW, ORANJE, ROOD, VIOLET } from '../lib/kleuren.js'

// Het overzicht in drie lagen: hoe staat het ervoor (één strook), wat is er
// onderweg (één tabel, per keten), en alle ketens (één lijst). Aandachtspunten
// en activiteit staan er compact naast en klappen uit als je ze nodig hebt.

const ACTIE_TEKEN = { register: '＋', release: '↑', rollback: '↶', delete_version: '×', set_dependency: '→', remove_dependency: '⤫' }
const VOLGORDE = { BEIDE_OPEN: 0, KLAAR_VOOR_PROD: 1, IN_ONTWIKKELING: 2, LEEG: 3, STABIEL: 4 }

// ─── Hoe ver is een versie ────────────────────────────────────────────────────
function Voortgang({ snap, versionId }) {
  const envs = snap.presentEnvs(versionId)
  return (
    <span className="inline-flex gap-0.5">
      {['TST', 'ACC', 'PROD'].map(e => (
        <span key={e} className="px-1 rounded text-[9px] font-bold"
          style={envs.includes(e)
            ? { background: `var(--env-${e.toLowerCase()}-bg)`, color: `var(--env-${e.toLowerCase()})` }
            : { background: 'var(--off-bg)', color: 'var(--ink-4)' }}>{e}</span>
      ))}
    </span>
  )
}

function Kop({ titel, count, right }) {
  return (
    <header className="px-4 py-2.5 border-b border-line/80 flex items-center gap-2">
      <h3 className="text-ink text-xs font-semibold">{titel}</h3>
      {count !== undefined && <span className="text-ink-3 text-xs">{count}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </header>
  )
}

function Paneel({ children, className = '' }) {
  return <section className={`bg-card border border-line rounded-xl overflow-hidden ${className}`}>{children}</section>
}

function RootChips({ stats }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {ENVS.map(e => stats.rootVersions[e]
        ? <EnvChip key={e} env={e} className="font-mono"><span className="font-normal">{stats.rootVersions[e]}</span></EnvChip>
        : <span key={e} className="px-1.5 py-0.5 rounded text-[10px] text-ink-4 border border-line/60">{e} —</span>)}
    </span>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function OverzichtView({ ga }) {
  const { snap, ketens, error } = useSnapshot()
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState(null)
  const [aandachtOpen, setAandachtOpen] = useState(false)
  const [activiteitOpen, setActiviteitOpen] = useState(false)

  const naarModel = (modelId, voorkeurKeten) => {
    const keys = ketens.ketensVanModel(modelId)
    const key = voorkeurKeten && keys.includes(voorkeurKeten) ? voorkeurKeten : keys[0]
    if (key) ga({ tab: 'ketens', keten: key, model: modelId })
  }

  // Lopende zaken: per keten die niet stabiel is, het hoofdmodel en het lopende werk
  const lopend = useMemo(() => {
    if (!snap) return []
    const gezien = new Set()
    const groepen = ketens.lijst
      .filter(e => e.stats.status !== 'STABIEL')
      .sort((a, b) => VOLGORDE[a.stats.status] - VOLGORDE[b.stats.status] || a.chain.label.localeCompare(b.chain.label))
      .map(e => ({ ...e, werk: e.stats.openWerk.filter(w => { if (gezien.has(w.id)) return false; gezien.add(w.id); return true }) }))
    // Werk aan versies die in geen enkele keten draaien
    const los = snap.workItems.filter(w => w.status !== 'DONE' && !gezien.has(w.id))
    return los.length ? [...groepen, { chain: null, werk: los }] : groepen
  }, [snap, ketens])

  const aandacht = useMemo(() => {
    if (!snap) return []
    const lijst = []
    for (const e of ketens.lijst) {
      for (const m of e.stats.meerdereVersies) lijst.push({ soort: 'meerdere', keten: e.chain, modelId: m.modelId, tekst: `${m.model} draait op ${m.versies.length} versies naast elkaar (${m.versies.join(', ')})` })
      for (const o of e.stats.ontbreekt) lijst.push({ soort: 'ontbreekt', keten: e.chain, modelId: o.modelId, tekst: `${o.model}: aangeroepen versie ontbreekt in eCon (${o.envs.join(', ')})` })
      for (const o of e.stats.opmerkingen) lijst.push({ soort: 'opmerking', keten: e.chain, modelId: o.modelId, tekst: `${o.model}: ${o.tekst}` })
      if (e.stats.status === 'LEEG') lijst.push({ soort: 'nietin', keten: e.chain, modelId: e.chain.rootModelId, tekst: 'draait nergens' })
    }
    for (const w of snap.workItems.filter(w => w.status === 'DONE' && !snap.isPresent(w.versionId, 'PROD'))) {
      lijst.push({ soort: 'werk', keten: null, modelId: w.modelId, tekst: `${w.modelName} ${w.version}: werk afgerond, maar de versie staat niet in PROD` })
    }
    return lijst
  }, [snap, ketens])

  if (!snap || !ketens) return error ? <div className="p-6"><Banner ok={false}>{error}</Banner></div> : <Spinner tekst="Ketens laden…" />

  const telling = s => ketens.lijst.filter(e => e.stats.status === s).length
  const term = zoek.toLowerCase()
  const zichtbaar = ketens.lijst
    .filter(e => !filter || e.stats.status === filter)
    .filter(e => !term || e.chain.label.toLowerCase().includes(term) || e.graaf.nodes.some(n => n.label.toLowerCase().includes(term)))
    .sort((a, b) => VOLGORDE[a.stats.status] - VOLGORDE[b.stats.status] || a.chain.label.localeCompare(b.chain.label))

  const statusChip = s => {
    const n = telling(s)
    if (!n && s !== 'STABIEL') return null
    const cfg = STATUS_CFG[s]
    const actief = filter === s
    return (
      <button key={s} onClick={() => setFilter(f => f === s ? null : s)} title={cfg.uitleg}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${actief ? 'border-accent' : 'border-transparent hover:border-line-2'}`}
        style={{ background: cfg.familie.bg, color: cfg.familie.ink }}>
        <span className="font-bold">{n}</span>{cfg.label}
      </button>
    )
  }

  const lopendTotaal = lopend.reduce((n, g) => n + g.werk.length + (g.chain ? 1 : 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-5 space-y-5">

        {/* Hoe staat het ervoor */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ink text-sm font-semibold mr-1">{ketens.lijst.length} ketens</span>
          {statusChip('STABIEL')}
          {statusChip('IN_ONTWIKKELING')}
          {statusChip('KLAAR_VOOR_PROD')}
          {statusChip('BEIDE_OPEN')}
          {statusChip('LEEG')}
          {filter && <button onClick={() => setFilter(null)} className="text-ink-3 hover:text-ink text-xs">filter weg ×</button>}
        </div>

        {/* Wat is er onderweg */}
        <Paneel>
          <Kop titel="Lopende zaken" count={lopendTotaal} />
          {lopend.length === 0 && <Leeg className="px-4 py-6 text-center">Niets onderweg. Alles draait zoals het in PROD staat.</Leeg>}
          {lopend.map(g => (
            <div key={g.chain?.key ?? 'los'} className="border-b border-line/40 last:border-b-0">
              {g.chain ? (
                <button onClick={() => ga({ tab: 'ketens', keten: g.chain.key })}
                  className="w-full text-left px-4 py-2 hover:bg-hover flex items-center gap-3 text-xs">
                  <span className="text-ink font-semibold truncate">{g.chain.label}</span>
                  <Chip familie={g.stats.cfg.familie} title={g.stats.cfg.uitleg}>{g.stats.cfg.label}</Chip>
                  <span className="ml-auto"><RootChips stats={g.stats} /></span>
                </button>
              ) : (
                <div className="px-4 py-2 text-xs text-ink-3">Werk aan versies die nu nergens in een keten draaien</div>
              )}
              {g.werk.map(w => (
                <button key={w.id} onClick={() => naarModel(w.modelId, g.chain?.key)}
                  className="w-full text-left pl-8 pr-4 py-1.5 hover:bg-hover grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-3 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="w-1.5 h-1.5 rounded-full inline-block mr-2 align-middle" style={{ background: w.status === 'REVIEW' ? BLAUW.ink : GEEL.ink }} title={STATUS_LABEL[w.status]} />
                    <span className="text-ink">{w.modelName}</span>
                    <span className="font-mono text-ink-3 ml-2">{w.version}</span>
                    {w.note && <span className="text-ink-3 ml-2">· {w.note}</span>}
                  </span>
                  <span className="text-ink-2">{w.consultant}</span>
                  <span className="font-mono text-ink-3 w-24 text-right">{w.ticket ?? ''}</span>
                  <span className="text-ink-3 w-20 text-right">{STATUS_LABEL[w.status]}</span>
                  <Voortgang snap={snap} versionId={w.versionId} />
                </button>
              ))}
            </div>
          ))}
        </Paneel>

        {/* Aandachtspunten en activiteit, compact */}
        <div className="grid gap-4 md:grid-cols-2 items-start">
          <Paneel>
            <Kop titel="Aandachtspunten" count={aandacht.length}
              right={aandacht.length > 4 && (
                <button onClick={() => setAandachtOpen(o => !o)} className="text-meta hover:text-ink text-xs">{aandachtOpen ? 'Inklappen' : `Toon alle ${aandacht.length}`}</button>
              )} />
            {aandacht.length === 0 && <Leeg className="px-4 py-4 text-center">Geen aandachtspunten.</Leeg>}
            <div className="divide-y divide-line/40">
              {(aandachtOpen ? aandacht : aandacht.slice(0, 4)).map((a, i) => (
                <button key={i} onClick={() => naarModel(a.modelId, a.keten?.key)}
                  className="w-full text-left px-4 py-1.5 hover:bg-hover flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-px" style={{ color: a.soort === 'ontbreekt' ? ROOD.ink : a.soort === 'meerdere' ? VIOLET.ink : ORANJE.ink }}>
                    {a.soort === 'ontbreekt' ? '⚠' : a.soort === 'meerdere' ? '×' : a.soort === 'opmerking' ? '✎' : '•'}
                  </span>
                  <span className="min-w-0">
                    {a.keten && <span className="text-ink-3">{a.keten.label} · </span>}
                    <span className="text-ink-2">{a.tekst}</span>
                  </span>
                </button>
              ))}
            </div>
          </Paneel>

          <Paneel>
            <Kop titel="Recente activiteit"
              right={snap.activity.length > 5 && (
                <button onClick={() => setActiviteitOpen(o => !o)} className="text-meta hover:text-ink text-xs">{activiteitOpen ? 'Inklappen' : 'Toon meer'}</button>
              )} />
            {snap.activity.length === 0 && <Leeg className="px-4 py-4 text-center">Nog niets gelogd. Elke actie in de tool komt hier.</Leeg>}
            <div className="divide-y divide-line/40">
              {snap.activity.slice(0, activiteitOpen ? 40 : 5).map(a => (
                <button key={a.id} onClick={() => a.modelId ? naarModel(a.modelId) : a.logId ? ga({ tab: 'releases' }) : null}
                  className="w-full text-left px-4 py-1.5 hover:bg-hover text-xs flex items-start gap-2">
                  <span className="text-ink-3 w-4 shrink-0 text-center">{ACTIE_TEKEN[a.action] ?? '·'}</span>
                  <span className="min-w-0">
                    <span className="text-ink break-words">{a.summary}</span>
                    <span className="text-ink-3 ml-2 whitespace-nowrap">{a.user.split('@')[0]} · {datum(a.at, true)}</span>
                  </span>
                </button>
              ))}
            </div>
          </Paneel>
        </div>

        {/* Alle ketens */}
        <Paneel>
          <Kop titel="Ketens" count={zichtbaar.length}
            right={
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input data-zoekveld placeholder="Zoek keten of model…" value={zoek} onChange={e => setZoek(e.target.value)}
                  className="w-56 bg-page border border-line rounded-lg pl-8 pr-3 py-1 text-ink text-xs focus:outline-none focus:border-accent placeholder-ink-3" />
              </div>
            } />
          {zichtbaar.length === 0 && <Leeg className="px-4 py-6 text-center">Geen ketens gevonden</Leeg>}
          <div className="divide-y divide-line/40">
            {zichtbaar.map(({ chain, stats }) => (
              <button key={chain.key} onClick={() => ga({ tab: 'ketens', keten: chain.key })}
                className="w-full text-left px-4 py-2 hover:bg-hover grid grid-cols-[minmax(0,1fr)_8.5rem_auto_auto] items-center gap-x-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="text-ink font-medium">{chain.label}</span>
                  <span className="text-ink-3 ml-2">{stats.models} modellen</span>
                  {stats.openWerk.length > 0 && <span className="text-ink-3 ml-2">· {stats.openWerk.length} werk</span>}
                  {stats.opmerkingen.length > 0 && <span className="ml-2" style={{ color: ORANJE.ink }} title={stats.opmerkingen.map(o => `${o.model}: ${o.tekst}`).join('\n')}>✎</span>}
                  {stats.ontbreekt.length > 0 && <span className="ml-2" style={{ color: ROOD.ink }} title="Aangeroepen versie ontbreekt in eCon">⚠</span>}
                </span>
                <span><Chip familie={stats.cfg.familie} title={stats.cfg.uitleg}>{stats.cfg.label}</Chip></span>
                <RootChips stats={stats} />
                <svg className="w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            ))}
          </div>
        </Paneel>
      </div>
    </div>
  )
}
