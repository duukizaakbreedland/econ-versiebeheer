import { useState, useMemo } from 'react'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { ENVS, STATUS_CFG } from '../lib/chainUtils.js'
import { datum, STATUS_LABEL } from '../lib/releasePlan.js'
import { Chip, EnvChip, Spinner, Banner, Leeg } from '../components/ui/index.jsx'
import { GEEL, BLAUW, ORANJE, GROEN, ROOD, VIOLET, GRIJS } from '../lib/kleuren.js'

// Bovenaan de tegels en de kaarten per keten; daaronder lopende zaken,
// aandachtspunten en activiteit als blokken in dezelfde kaartstijl.

const ACTIE_TEKEN = { register: '＋', release: '↑', rollback: '↶', delete_version: '×', set_dependency: '→', remove_dependency: '⤫' }
const VOLGORDE = { BEIDE_OPEN: 0, KLAAR_VOOR_PROD: 1, IN_ONTWIKKELING: 2, LEEG: 3, STABIEL: 4 }

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

function RootChips({ stats }) {
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {ENVS.map(e => stats.rootVersions[e]
        ? <EnvChip key={e} env={e} className="font-mono"><span className="font-normal">{stats.rootVersions[e]}</span></EnvChip>
        : <span key={e} className="px-1.5 py-0.5 rounded text-[10px] text-ink-4 border border-line/60">niet in {e}</span>)}
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
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <Chip familie={cfg.familie} title={cfg.uitleg}>{cfg.label}</Chip>
          <RootChips stats={stats} />
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

// ─── Blok in dezelfde kaartstijl ──────────────────────────────────────────────
function Blok({ titel, count, familie = GRIJS, right, children }) {
  return (
    <section className="bg-card border border-line rounded-xl p-4 flex flex-col" style={{ borderLeft: `3px solid ${familie.ink}` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-ink font-semibold text-sm">{titel}</div>
        {count !== undefined && <span className="text-ink-3 text-xs">{count}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
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

  const lopendTotaal = lopend.reduce((n, g) => n + g.werk.length, 0)
  const AANDACHT_KORT = 5

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Tegels */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tegel label="Ketens" value={ketens.lijst.length} familie={GRIJS} actief={filter === null} onClick={() => setFilter(null)} />
          <Tegel label="Stabiel" value={telling('STABIEL')} familie={GROEN} actief={filter === 'STABIEL'} onClick={() => setFilter(f => f === 'STABIEL' ? null : 'STABIEL')} />
          <Tegel label="In ontwikkeling" value={telling('IN_ONTWIKKELING') + telling('BEIDE_OPEN')} familie={GEEL} actief={filter === 'IN_ONTWIKKELING'} onClick={() => setFilter(f => f === 'IN_ONTWIKKELING' ? null : 'IN_ONTWIKKELING')} />
          <Tegel label="Klaar voor PROD" value={telling('KLAAR_VOOR_PROD') + telling('BEIDE_OPEN')} familie={BLAUW} actief={filter === 'KLAAR_VOOR_PROD'} onClick={() => setFilter(f => f === 'KLAAR_VOOR_PROD' ? null : 'KLAAR_VOOR_PROD')} />
        </div>

        {/* Zoeken */}
        <div className="relative max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input data-zoekveld placeholder="Zoek keten of model…" value={zoek} onChange={e => setZoek(e.target.value)}
            className="w-full bg-card border border-line rounded-lg pl-9 pr-3 py-2 text-ink text-sm focus:outline-none focus:border-accent placeholder-ink-3" />
        </div>

        {/* Kaarten per keten */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 items-stretch">
          {zichtbaar.map(e => (
            <ChainCard key={e.chain.key} entry={e}
              onClick={() => ga({ tab: 'ketens', keten: e.chain.key })}
              onModel={modelId => ga({ tab: 'ketens', keten: e.chain.key, model: modelId })} />
          ))}
          {zichtbaar.length === 0 && <div className="col-span-2 text-center py-12 text-ink-3 text-sm">Geen ketens gevonden</div>}
        </div>

        {/* Lopende zaken, in dezelfde kaartstijl */}
        <Blok titel="Lopende zaken" count={lopendTotaal} familie={lopendTotaal ? GEEL : GRIJS}>
          {lopend.length === 0 && <Leeg>Niets onderweg. Alles draait zoals het in PROD staat.</Leeg>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
            {lopend.map(g => (
              <div key={g.chain?.key ?? 'los'}>
                {g.chain ? (
                  <button onClick={() => ga({ tab: 'ketens', keten: g.chain.key })} className="flex items-center gap-2 mb-1 text-left">
                    <span className="text-ink font-semibold text-xs truncate">{g.chain.label}</span>
                    <Chip familie={g.stats.cfg.familie} title={g.stats.cfg.uitleg}>{g.stats.cfg.label}</Chip>
                  </button>
                ) : (
                  <div className="text-ink-3 text-xs mb-1">Werk aan versies die nu nergens in een keten draaien</div>
                )}
                <div className="space-y-1">
                  {g.werk.length === 0 && <div className="text-ink-3 text-xs pl-3">Geen lopend werk; alleen de versies verschillen.</div>}
                  {g.werk.map(w => (
                    <button key={w.id} onClick={() => naarModel(w.modelId, g.chain?.key)} className="w-full text-left flex items-center gap-2 text-xs pl-3" title={w.note ?? ''}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: w.status === 'REVIEW' ? BLAUW.ink : GEEL.ink }} />
                      <span className="text-ink truncate">{w.modelName}</span>
                      <span className="font-mono text-ink-3 shrink-0">{w.version}</span>
                      <span className="text-ink-2 shrink-0">{w.consultant}</span>
                      {w.ticket && <span className="font-mono text-ink-3 shrink-0">{w.ticket}</span>}
                      <span className="ml-auto shrink-0 flex items-center gap-2">
                        <span className="text-ink-3">{STATUS_LABEL[w.status]}</span>
                        <Voortgang snap={snap} versionId={w.versionId} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Blok>

        <div className="grid gap-3 md:grid-cols-2 items-start">
          <Blok titel="Aandachtspunten" count={aandacht.length} familie={aandacht.length ? ORANJE : GRIJS}
            right={aandacht.length > AANDACHT_KORT && (
              <button onClick={() => setAandachtOpen(o => !o)} className="text-meta hover:text-ink text-xs">{aandachtOpen ? 'Minder' : `Alle ${aandacht.length}`}</button>
            )}>
            {aandacht.length === 0 && <Leeg>Geen aandachtspunten.</Leeg>}
            <div className="space-y-1">
              {(aandachtOpen ? aandacht : aandacht.slice(0, AANDACHT_KORT)).map((a, i) => (
                <button key={i} onClick={() => naarModel(a.modelId, a.keten?.key)} title={a.tekst}
                  className="w-full text-left flex items-start gap-2 text-xs rounded-md px-2 py-1"
                  style={{ background: a.soort === 'ontbreekt' ? ROOD.bg : a.soort === 'meerdere' ? VIOLET.bg : ORANJE.bg,
                           color: a.soort === 'ontbreekt' ? ROOD.ink : a.soort === 'meerdere' ? VIOLET.ink : ORANJE.ink }}>
                  <span className="shrink-0">{a.soort === 'ontbreekt' ? '⚠' : a.soort === 'meerdere' ? '×' : a.soort === 'opmerking' ? '✎' : '•'}</span>
                  <span className="min-w-0 line-clamp-2">
                    {a.keten && <span className="font-semibold">{a.keten.label}</span>}{a.keten && ' — '}{a.tekst}
                  </span>
                </button>
              ))}
            </div>
          </Blok>

          <Blok titel="Recente activiteit" familie={GRIJS}
            right={snap.activity.length > 6 && (
              <button onClick={() => setActiviteitOpen(o => !o)} className="text-meta hover:text-ink text-xs">{activiteitOpen ? 'Minder' : 'Meer'}</button>
            )}>
            {snap.activity.length === 0 && <Leeg>Nog niets gelogd. Elke actie in de tool komt hier.</Leeg>}
            <div className="space-y-1">
              {snap.activity.slice(0, activiteitOpen ? 40 : 6).map(a => (
                <button key={a.id} onClick={() => a.modelId ? naarModel(a.modelId) : a.logId ? ga({ tab: 'releases' }) : null}
                  title={`${a.user} · ${new Date(a.at).toLocaleString('nl-NL')}\n${a.summary}`}
                  className="w-full text-left flex items-center gap-2 text-xs">
                  <span className="text-ink-3 w-4 shrink-0 text-center">{ACTIE_TEKEN[a.action] ?? '·'}</span>
                  <span className="text-ink min-w-0 truncate flex-1">{a.summary}</span>
                  <span className="text-ink-3 whitespace-nowrap shrink-0">{a.user.split('@')[0].split('.')[0]} · {datum(a.at)}</span>
                </button>
              ))}
            </div>
          </Blok>
        </div>
      </div>
    </div>
  )
}
