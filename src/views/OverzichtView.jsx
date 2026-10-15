import { useState, useMemo } from 'react'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { ENVS, STATUS_CFG } from '../lib/chainUtils.js'
import { datum, STATUS_LABEL } from '../lib/releasePlan.js'
import { Chip, EnvChip, Spinner, Banner, Leeg } from '../components/ui/index.jsx'
import { GEEL, BLAUW, ORANJE, GROEN, ROOD, VIOLET, GRIJS } from '../lib/kleuren.js'

const ACTIE_TEKEN = { register: '＋', release: '↑', rollback: '↶', delete_version: '×', set_dependency: '→', remove_dependency: '⤫' }

// ─── Tegel ────────────────────────────────────────────────────────────────────
function Tegel({ label, value, familie, actief, onClick }) {
  return (
    <button onClick={onClick}
      className={`bg-card border rounded-xl px-4 py-3 text-left transition-colors ${actief ? 'border-accent' : 'border-line hover:border-line-2'}`}>
      <div className="text-2xl font-bold" style={{ color: familie.ink }}>{value}</div>
      <div className="text-meta text-xs mt-0.5">{label}</div>
    </button>
  )
}

// ─── Hoe ver is een versie ────────────────────────────────────────────────────
function Voortgang({ snap, versionId }) {
  const envs = snap.presentEnvs(versionId)
  return (
    <span className="flex gap-0.5">
      {['TST', 'ACC', 'PROD'].map(e => (
        <span key={e} className={`px-1 rounded text-[9px] font-bold ${envs.includes(e) ? '' : 'opacity-30'}`}
          style={{ background: ENVS && (envs.includes(e) ? `var(--env-${e.toLowerCase()}-bg)` : 'var(--off-bg)'),
                   color: envs.includes(e) ? `var(--env-${e.toLowerCase()})` : 'var(--ink-3)' }}>{e}</span>
      ))}
    </span>
  )
}

// ─── Ketenkaart ───────────────────────────────────────────────────────────────
function ChainCard({ entry, onClick, onModel }) {
  const { chain, stats } = entry
  const cfg = stats.cfg
  return (
    <div className="group bg-card border border-line rounded-xl p-4 hover:border-line-2 transition-all w-full h-full flex flex-col"
      style={{ borderLeft: `3px solid ${cfg.familie.ink}` }}>
      <button onClick={onClick} className="text-left">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="text-ink font-semibold text-sm leading-snug flex-1 min-w-0 truncate">{chain.label}</div>
          <svg className="w-4 h-4 text-ink-3 group-hover:text-ink-2 transition-colors shrink-0 mt-0.5"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <Chip familie={cfg.familie} title={cfg.uitleg}>{cfg.label}</Chip>
          {ENVS.map(e => stats.rootVersions[e]
            ? <EnvChip key={e} env={e} className="font-mono"><span className="font-normal">{stats.rootVersions[e]}</span></EnvChip>
            : <span key={e} className="px-1.5 py-0.5 rounded text-[10px] text-ink-4 border border-line/60">niet in {e}</span>)}
        </div>
      </button>

      {stats.opmerkingen.length > 0 && (
        <div className="space-y-1 mb-2">
          {stats.opmerkingen.map(o => (
            <button key={o.modelId} onClick={() => onModel(o.modelId)} className="w-full text-left flex items-start gap-1.5 text-xs rounded-md px-2 py-1"
              style={{ background: ORANJE.bg, color: ORANJE.ink }} title={`${o.model}: ${o.tekst}`}>
              <span className="shrink-0">✎</span>
              <span className="min-w-0 line-clamp-2"><span className="font-semibold">{o.model}</span> — {o.tekst}</span>
            </button>
          ))}
        </div>
      )}

      {stats.openWerk.length > 0 && (
        <div className="space-y-1 mb-2">
          {stats.openWerk.map(w => (
            <button key={w.id} onClick={() => onModel(w.modelId)} className="w-full text-left flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: w.status === 'REVIEW' ? BLAUW.ink : GEEL.ink }} />
              <span className="text-ink truncate">{w.node.label}</span>
              <span className="font-mono text-ink-3">{w.version}</span>
              <span className="text-ink-3 truncate">{w.ticket ?? w.consultant}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-meta mt-auto pt-2 border-t border-line/50">
        <span>{stats.models} modellen</span>
        {stats.tstAfwijkend.length > 0 && <span style={{ color: GEEL.ink }}>{stats.tstAfwijkend.length} in TST anders dan ACC</span>}
        {stats.accAfwijkend.length > 0 && <span style={{ color: BLAUW.ink }}>{stats.accAfwijkend.length} in ACC anders dan PROD</span>}
        {stats.ontbreekt.length > 0 && <span style={{ color: ROOD.ink }}>⚠ {stats.ontbreekt.length}</span>}
      </div>
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function OverzichtView({ ga }) {
  const { snap, ketens, loading, error } = useSnapshot()
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState(null)   // null | status | 'AANDACHT'

  const naarModel = (modelId, voorkeurKeten) => {
    const keys = ketens.ketensVanModel(modelId)
    const key = voorkeurKeten && keys.includes(voorkeurKeten) ? voorkeurKeten : keys[0]
    if (key) ga({ tab: 'ketens', keten: key, model: modelId })
  }

  const lopend = useMemo(() => {
    if (!snap) return { werk: [], klaar: [], aandacht: [] }
    const werk = snap.workItems.filter(w => w.status !== 'DONE')
      .sort((a, b) => (a.status === 'REVIEW') - (b.status === 'REVIEW') || new Date(b.createdAt) - new Date(a.createdAt))
    const klaar = ketens.lijst.filter(e => ['KLAAR_VOOR_PROD', 'BEIDE_OPEN'].includes(e.stats.status))

    const aandacht = []
    for (const e of ketens.lijst) {
      for (const m of e.stats.meerdereVersies) aandacht.push({ soort: 'meerdere', tekst: `${m.model} draait in ${e.chain.label} op ${m.versies.length} versies naast elkaar (${m.versies.join(', ')}) in ${m.envs.join(', ')}`, modelId: m.modelId, keten: e.chain.key })
      for (const o of e.stats.ontbreekt) aandacht.push({ soort: 'ontbreekt', tekst: `${o.model}: aangeroepen versie ontbreekt in eCon (${o.envs.join(', ')})`, modelId: o.modelId, keten: e.chain.key })
      for (const env of e.stats.nietIn) if (env !== 'TST' || e.stats.nietIn.length < 3) aandacht.push({ soort: 'nietin', tekst: `${e.chain.label} draait niet in ${env}`, modelId: e.chain.rootModelId, keten: e.chain.key })
    }
    for (const w of snap.workItems.filter(w => w.status === 'DONE')) {
      if (!snap.isPresent(w.versionId, 'PROD')) aandacht.push({ soort: 'werk', tekst: `Werk aan ${w.modelName} ${w.version} is afgerond, maar die versie staat niet in PROD`, modelId: w.modelId })
    }
    for (const e of ketens.lijst) for (const o of e.stats.opmerkingen) aandacht.push({ soort: 'opmerking', tekst: `${o.model}: ${o.tekst}`, modelId: o.modelId, keten: e.chain.key })
    return { werk, klaar, aandacht }
  }, [snap, ketens])

  if (!snap || !ketens) return error ? <div className="p-6"><Banner ok={false}>{error}</Banner></div> : <Spinner tekst="Ketens laden…" />

  const telling = s => ketens.lijst.filter(e => e.stats.status === s).length
  const term = zoek.toLowerCase()
  const zichtbaar = ketens.lijst.filter(e =>
    (!filter || filter === 'AANDACHT' || e.stats.status === filter) &&
    (!term || e.chain.label.toLowerCase().includes(term) || e.graaf.nodes.some(n => n.label.toLowerCase().includes(term))))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tegel label="Ketens" value={ketens.lijst.length} familie={GRIJS} actief={filter === null} onClick={() => setFilter(null)} />
          <Tegel label="Stabiel" value={telling('STABIEL')} familie={GROEN} actief={filter === 'STABIEL'} onClick={() => setFilter(f => f === 'STABIEL' ? null : 'STABIEL')} />
          <Tegel label="In ontwikkeling" value={telling('IN_ONTWIKKELING') + telling('BEIDE_OPEN')} familie={GEEL} actief={filter === 'IN_ONTWIKKELING'} onClick={() => setFilter(f => f === 'IN_ONTWIKKELING' ? null : 'IN_ONTWIKKELING')} />
          <Tegel label="Klaar voor PROD" value={telling('KLAAR_VOOR_PROD') + telling('BEIDE_OPEN')} familie={BLAUW} actief={filter === 'KLAAR_VOOR_PROD'} onClick={() => setFilter(f => f === 'KLAAR_VOOR_PROD' ? null : 'KLAAR_VOOR_PROD')} />
          <Tegel label="Aandachtspunten" value={lopend.aandacht.length} familie={lopend.aandacht.length ? ORANJE : GRIJS} actief={filter === 'AANDACHT'} onClick={() => setFilter(f => f === 'AANDACHT' ? null : 'AANDACHT')} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_20rem] items-start">
          {/* Lopende zaken */}
          <section className="bg-card border border-line rounded-xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-line/80 flex items-center gap-2">
              <h3 className="text-ink text-xs font-semibold">Lopende zaken</h3>
              <span className="text-ink-3 text-xs">{lopend.werk.length + lopend.klaar.length}</span>
            </header>
            <div className="divide-y divide-line/40 max-h-[26rem] overflow-y-auto">
              {lopend.werk.length === 0 && lopend.klaar.length === 0 && <Leeg className="px-4 py-6 text-center">Niets onderweg. Alles draait zoals het in PROD staat.</Leeg>}
              {lopend.klaar.map(e => (
                <button key={e.chain.key} onClick={() => ga({ tab: 'ketens', keten: e.chain.key })}
                  className="w-full text-left px-4 py-2 hover:bg-hover flex items-center gap-2 text-xs">
                  <Chip familie={BLAUW}>Klaar voor PROD</Chip>
                  <span className="text-ink truncate">{e.chain.label}</span>
                  <span className="ml-auto font-mono text-ink-3">{e.stats.rootVersions.ACC} → PROD</span>
                </button>
              ))}
              {lopend.werk.map(w => (
                <button key={w.id} onClick={() => naarModel(w.modelId)}
                  className="w-full text-left px-4 py-2 hover:bg-hover flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: w.status === 'REVIEW' ? BLAUW.ink : GEEL.ink }} title={STATUS_LABEL[w.status]} />
                  <span className="text-ink truncate">{w.modelName}</span>
                  <span className="font-mono text-ink-3 shrink-0">{w.version}</span>
                  <span className="text-ink-2 truncate">{w.consultant}</span>
                  {w.ticket && <span className="font-mono text-ink-3 shrink-0">{w.ticket}</span>}
                  <span className="ml-auto shrink-0"><Voortgang snap={snap} versionId={w.versionId} /></span>
                </button>
              ))}
            </div>
          </section>

          {/* Aandachtspunten */}
          <section className="bg-card border border-line rounded-xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-line/80 flex items-center gap-2">
              <h3 className="text-ink text-xs font-semibold">Aandachtspunten</h3>
              <span className="text-ink-3 text-xs">{lopend.aandacht.length}</span>
            </header>
            <div className="divide-y divide-line/40 max-h-[26rem] overflow-y-auto">
              {lopend.aandacht.length === 0 && <Leeg className="px-4 py-6 text-center">Geen aandachtspunten.</Leeg>}
              {lopend.aandacht.map((a, i) => (
                <button key={i} onClick={() => naarModel(a.modelId, a.keten)}
                  className="w-full text-left px-4 py-2 hover:bg-hover flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-0.5" style={{ color: a.soort === 'ontbreekt' ? ROOD.ink : a.soort === 'meerdere' ? VIOLET.ink : ORANJE.ink }}>
                    {a.soort === 'ontbreekt' ? '⚠' : a.soort === 'meerdere' ? '×' : a.soort === 'opmerking' ? '✎' : '•'}
                  </span>
                  <span className="text-ink-2 min-w-0">{a.tekst}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recente activiteit */}
          <section className="bg-card border border-line rounded-xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-line/80 flex items-center gap-2">
              <h3 className="text-ink text-xs font-semibold">Recente activiteit</h3>
            </header>
            <div className="divide-y divide-line/40 max-h-[26rem] overflow-y-auto">
              {snap.activity.length === 0 && <Leeg className="px-4 py-6 text-center">Nog niets gelogd. Elke actie in de tool komt hier.</Leeg>}
              {snap.activity.slice(0, 40).map(a => (
                <button key={a.id} onClick={() => a.modelId ? naarModel(a.modelId) : a.logId ? ga({ tab: 'releases' }) : null}
                  className="w-full text-left px-4 py-2 hover:bg-hover text-xs">
                  <div className="flex items-center gap-2 text-ink-3 text-[11px]">
                    <span>{ACTIE_TEKEN[a.action] ?? '·'}</span>
                    <span className="text-ink-2 font-medium">{a.user.split('@')[0]}</span>
                    <span title={new Date(a.at).toLocaleString('nl-NL')}>{datum(a.at, true)}</span>
                  </div>
                  <div className="text-ink mt-0.5 break-words">{a.summary}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input data-zoekveld placeholder="Zoek keten of model…" value={zoek} onChange={e => setZoek(e.target.value)}
              className="w-full bg-card border border-line rounded-lg pl-9 pr-3 py-2 text-ink text-sm focus:outline-none focus:border-accent placeholder-ink-3" />
          </div>
          {filter && filter !== 'AANDACHT' && <Chip familie={STATUS_CFG[filter].familie}>{STATUS_CFG[filter].label} ×</Chip>}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 items-stretch">
          {zichtbaar.map(e => (
            <ChainCard key={e.chain.key} entry={e}
              onClick={() => ga({ tab: 'ketens', keten: e.chain.key })}
              onModel={modelId => ga({ tab: 'ketens', keten: e.chain.key, model: modelId })} />
          ))}
          {zichtbaar.length === 0 && <div className="col-span-2 text-center py-12 text-ink-3 text-sm">Geen ketens gevonden</div>}
        </div>
      </div>
    </div>
  )
}
