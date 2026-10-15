import { useState, useMemo } from 'react'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { STATUS_CFG, versieStatus } from '../lib/chainUtils.js'
import { datum, STATUS_LABEL } from '../lib/releasePlan.js'
import { Spinner, Banner, Leeg } from '../components/ui/index.jsx'
import { GEEL, BLAUW, ORANJE, ROOD, VIOLET, GRIJS } from '../lib/kleuren.js'

// Het overzicht in drie lagen: hoe staat het ervoor (één regel), wat is er
// onderweg (één tabel, per keten), en alle ketens (één tabel). Aandachtspunten
// en activiteit staan er compact naast. Kleur alleen waar iets afwijkt.

const ACTIE_TEKEN = { register: '＋', release: '↑', rollback: '↶', delete_version: '×', set_dependency: '→', remove_dependency: '⤫' }
const VOLGORDE = { BEIDE_OPEN: 0, KLAAR_VOOR_PROD: 1, IN_ONTWIKKELING: 2, LEEG: 3, STABIEL: 4 }
const FLOW = ['TST', 'ACC', 'PROD']

// Kolommen van de twee tabellen; kop en rijen delen dezelfde maat
const KOL_LOPEND = 'minmax(0,1fr) 6rem 6.5rem 6rem 4.5rem 4.5rem 4.5rem'
const KOL_KETENS = 'minmax(0,1fr) 5rem 8.5rem 5.5rem 5.5rem 5.5rem'

function Status({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-2 whitespace-nowrap" title={cfg.uitleg}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.familie.ink }} />
      {cfg.label}
    </span>
  )
}

// Een versie in een omgevingskolom: gekleurd alleen als hij afwijkt van PROD
function Versie({ v, prod, env }) {
  if (!v) return <span className="text-ink-4">—</span>
  const st = env === 'PROD' ? 'gelijk' : versieStatus(v, prod)
  const kleur = st === 'voor' ? GEEL.ink : st === 'achter' ? ORANJE.ink : st === 'anders' ? VIOLET.ink : null
  return <span className="font-mono" style={{ color: kleur ?? 'var(--ink-2)', fontWeight: kleur ? 600 : 400 }}>{v}</span>
}

// Hoe ver een versie is: een stip per omgeving
function Stip({ aan }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: aan ? 'var(--ink-2)' : 'transparent', border: aan ? 'none' : '1px solid var(--line-strong)' }} />
}

function Paneel({ titel, count, right, children }) {
  return (
    <section className="bg-card border border-line rounded-xl overflow-hidden">
      <header className="px-4 h-10 border-b border-line/80 flex items-center gap-2">
        <h3 className="text-ink text-xs font-semibold">{titel}</h3>
        {count !== undefined && <span className="text-ink-3 text-xs">{count}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </header>
      {children}
    </section>
  )
}

function TabelKop({ kolommen, labels }) {
  return (
    <div className="grid gap-x-3 px-4 h-7 items-center bg-card-2 border-b border-line/60 text-[10px] font-semibold uppercase tracking-wide text-meta"
      style={{ gridTemplateColumns: kolommen }}>
      {labels.map((l, i) => <span key={i} className={i >= labels.length - 3 ? 'text-center' : ''}>{l}</span>)}
    </div>
  )
}

const rij = 'grid gap-x-3 px-4 items-center text-xs hover:bg-hover w-full text-left'

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

  const lopend = useMemo(() => {
    if (!snap) return []
    const gezien = new Set()
    const groepen = ketens.lijst
      .filter(e => e.stats.status !== 'STABIEL')
      .sort((a, b) => VOLGORDE[a.stats.status] - VOLGORDE[b.stats.status] || a.chain.label.localeCompare(b.chain.label))
      .map(e => ({ ...e, werk: e.stats.openWerk.filter(w => { if (gezien.has(w.id)) return false; gezien.add(w.id); return true }) }))
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

  const lopendTotaal = lopend.reduce((n, g) => n + g.werk.length + (g.chain ? 1 : 0), 0)
  const AANDACHT_KORT = 4

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">

        {/* Hoe staat het ervoor */}
        <div className="flex items-center gap-5 text-xs flex-wrap h-6">
          <span className="text-ink text-sm font-semibold">{ketens.lijst.length} ketens</span>
          {['STABIEL', 'IN_ONTWIKKELING', 'KLAAR_VOOR_PROD', 'BEIDE_OPEN', 'LEEG'].map(s => {
            const n = telling(s)
            if (!n) return null
            const cfg = STATUS_CFG[s]
            return (
              <button key={s} onClick={() => setFilter(f => f === s ? null : s)} title={`${cfg.uitleg}. Klik om de ketenlijst te filteren.`}
                className={`inline-flex items-center gap-1.5 border-b-2 pb-px transition-colors ${filter === s ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.familie.ink }} />
                <span className="font-semibold text-ink">{n}</span>{cfg.label}
              </button>
            )
          })}
        </div>

        {/* Wat is er onderweg */}
        <Paneel titel="Lopende zaken" count={lopendTotaal}>
          {lopend.length === 0 ? (
            <Leeg className="px-4 py-6 text-center">Niets onderweg. Alles draait zoals het in PROD staat.</Leeg>
          ) : (
            <>
              <TabelKop kolommen={KOL_LOPEND} labels={['Keten / model', 'Wie', 'Ticket', 'Status', 'TST', 'ACC', 'PROD']} />
              {lopend.map(g => (
                <div key={g.chain?.key ?? 'los'} className="border-b border-line/40 last:border-b-0">
                  {g.chain ? (
                    <button onClick={() => ga({ tab: 'ketens', keten: g.chain.key })} className={`${rij} h-9`} style={{ gridTemplateColumns: KOL_LOPEND }}>
                      <span className="text-ink font-semibold truncate">{g.chain.label}</span>
                      <span /><span />
                      <Status status={g.stats.status} />
                      {FLOW.map(e => <span key={e} className="text-center"><Versie v={g.stats.rootVersions[e]} prod={g.stats.rootVersions.PROD} env={e} /></span>)}
                    </button>
                  ) : (
                    <div className="px-4 h-9 flex items-center text-xs text-ink-3">Werk aan versies die nu nergens in een keten draaien</div>
                  )}
                  {g.werk.map(w => (
                    <button key={w.id} onClick={() => naarModel(w.modelId, g.chain?.key)} className={`${rij} h-8`} style={{ gridTemplateColumns: KOL_LOPEND }}>
                      <span className="min-w-0 truncate pl-4" title={w.note ?? ''}>
                        <span className="text-ink">{w.modelName}</span>
                        <span className="font-mono text-ink-3 ml-2">{w.version}</span>
                        {w.note && <span className="text-ink-3 ml-2">· {w.note}</span>}
                      </span>
                      <span className="text-ink-2 truncate">{w.consultant}</span>
                      <span className="font-mono text-ink-2 truncate">{w.ticket ?? <span className="text-ink-4">—</span>}</span>
                      <span className="inline-flex items-center gap-1.5 text-ink-2 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ background: w.status === 'REVIEW' ? BLAUW.ink : GEEL.ink }} />
                        {STATUS_LABEL[w.status]}
                      </span>
                      {FLOW.map(e => <span key={e} className="text-center"><Stip aan={snap.isPresent(w.versionId, e)} /></span>)}
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </Paneel>

        {/* Aandachtspunten en activiteit */}
        <div className="grid gap-4 md:grid-cols-2 items-start">
          <Paneel titel="Aandachtspunten" count={aandacht.length}
            right={aandacht.length > AANDACHT_KORT && (
              <button onClick={() => setAandachtOpen(o => !o)} className="text-meta hover:text-ink text-xs">{aandachtOpen ? 'Minder' : `Alle ${aandacht.length}`}</button>
            )}>
            {aandacht.length === 0 && <Leeg className="px-4 py-4 text-center">Geen aandachtspunten.</Leeg>}
            {(aandachtOpen ? aandacht : aandacht.slice(0, AANDACHT_KORT)).map((a, i) => (
              <button key={i} onClick={() => naarModel(a.modelId, a.keten?.key)} title={a.tekst}
                className="w-full text-left px-4 h-8 hover:bg-hover flex items-center gap-2 text-xs border-b border-line/40 last:border-b-0">
                <span className="w-4 shrink-0 text-center" style={{ color: a.soort === 'ontbreekt' ? ROOD.ink : a.soort === 'meerdere' ? VIOLET.ink : ORANJE.ink }}>
                  {a.soort === 'ontbreekt' ? '⚠' : a.soort === 'meerdere' ? '×' : a.soort === 'opmerking' ? '✎' : '•'}
                </span>
                <span className="min-w-0 truncate">
                  {a.keten && <span className="text-ink-3">{a.keten.label} · </span>}
                  <span className="text-ink-2">{a.tekst}</span>
                </span>
              </button>
            ))}
          </Paneel>

          <Paneel titel="Recente activiteit"
            right={snap.activity.length > 5 && (
              <button onClick={() => setActiviteitOpen(o => !o)} className="text-meta hover:text-ink text-xs">{activiteitOpen ? 'Minder' : 'Meer'}</button>
            )}>
            {snap.activity.length === 0 && <Leeg className="px-4 py-4 text-center">Nog niets gelogd. Elke actie in de tool komt hier.</Leeg>}
            {snap.activity.slice(0, activiteitOpen ? 40 : 5).map(a => (
              <button key={a.id} onClick={() => a.modelId ? naarModel(a.modelId) : a.logId ? ga({ tab: 'releases' }) : null}
                title={`${a.user} · ${new Date(a.at).toLocaleString('nl-NL')}\n${a.summary}`}
                className="w-full text-left px-4 h-8 hover:bg-hover text-xs flex items-center gap-2 border-b border-line/40 last:border-b-0">
                <span className="text-ink-3 w-4 shrink-0 text-center">{ACTIE_TEKEN[a.action] ?? '·'}</span>
                <span className="text-ink min-w-0 truncate flex-1">{a.summary}</span>
                <span className="text-ink-3 whitespace-nowrap shrink-0">{a.user.split('@')[0].split('.')[0]} · {datum(a.at)}</span>
              </button>
            ))}
          </Paneel>
        </div>

        {/* Alle ketens */}
        <Paneel titel="Ketens" count={zichtbaar.length}
          right={
            <div className="flex items-center gap-2">
              {filter && <button onClick={() => setFilter(null)} className="text-ink-3 hover:text-ink text-xs">filter weg ×</button>}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input data-zoekveld placeholder="Zoek keten of model…" value={zoek} onChange={e => setZoek(e.target.value)}
                  className="w-56 bg-page border border-line rounded-lg pl-8 pr-3 py-1 text-ink text-xs focus:outline-none focus:border-accent placeholder-ink-3" />
              </div>
            </div>
          }>
          <TabelKop kolommen={KOL_KETENS} labels={['Keten', 'Modellen', 'Status', 'TST', 'ACC', 'PROD']} />
          {zichtbaar.length === 0 && <Leeg className="px-4 py-6 text-center">Geen ketens gevonden</Leeg>}
          {zichtbaar.map(({ chain, stats }) => (
            <button key={chain.key} onClick={() => ga({ tab: 'ketens', keten: chain.key })}
              className={`${rij} h-9 border-b border-line/40 last:border-b-0`} style={{ gridTemplateColumns: KOL_KETENS }}>
              <span className="min-w-0 truncate">
                <span className="text-ink font-medium">{chain.label}</span>
                {stats.openWerk.length > 0 && <span className="text-ink-3 ml-2" title={`${stats.openWerk.length} werk-item(s) lopen`}>· {stats.openWerk.length} werk</span>}
                {stats.opmerkingen.length > 0 && <span className="ml-2" style={{ color: ORANJE.ink }} title={stats.opmerkingen.map(o => `${o.model}: ${o.tekst}`).join('\n')}>✎</span>}
                {stats.ontbreekt.length > 0 && <span className="ml-2" style={{ color: ROOD.ink }} title="Aangeroepen versie ontbreekt in eCon">⚠</span>}
              </span>
              <span className="text-ink-3">{stats.models}</span>
              <Status status={stats.status} />
              {FLOW.map(e => <span key={e} className="text-center"><Versie v={stats.rootVersions[e]} prod={stats.rootVersions.PROD} env={e} /></span>)}
            </button>
          ))}
        </Paneel>
      </div>
    </div>
  )
}
