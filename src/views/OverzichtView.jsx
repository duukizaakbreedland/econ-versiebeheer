import { useState, useMemo } from 'react'
import { chainStats, ketenOpgelost } from '../lib/chainUtils.js'
import { useDependencies } from '../hooks/useDependencies.js'
import { GROEN, GEEL, BLAUW, ORANJE } from '../lib/kleuren.js'

const kleur = f => ({ color: f.ink, bg: f.bg, border: f.line })

const STATUS_CFG = {
  STABIEL:         { ...kleur(GROEN),  label: 'Stabiel'         },
  IN_ONTWIKKELING: { ...kleur(GEEL),   label: 'In ontwikkeling' },
  KLAAR_VOOR_PROD: { ...kleur(BLAUW),  label: 'Klaar voor PROD' },
  ACTIEF:          { ...kleur(ORANJE), label: 'Meerdere open'   },
}

// ─── Keten kaart ──────────────────────────────────────────────────────────────
function ChainCard({ chainId, chain, onClick }) {
  const stats       = chainStats(chain)
  const cfg         = STATUS_CFG[stats.status]
  const workItems   = stats.workItems
  const totalModels = stats.models
  const diffModels  = stats.tstNewer

  return (
    <button
      onClick={onClick}
      className="group text-left bg-card border border-line rounded-xl p-4 hover:border-line-2
                 transition-all cursor-pointer w-full h-full flex flex-col"
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      {/* Titel + pijl */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-ink font-semibold text-sm leading-snug flex-1 min-w-0 truncate">
          {chain.label}
        </div>
        <svg className="w-4 h-4 text-ink-3 group-hover:text-ink-2 transition-colors shrink-0 mt-0.5"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>

      {/* Statusbadge op eigen regel */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
          {cfg.label}
        </span>
      </div>

      {/* Opmerkingen: hier moet iets mee gebeuren */}
      {stats.opmerkingen.length > 0 && (
        <div className="space-y-1 mb-3">
          {stats.opmerkingen.map(o => (
            <div key={o.model} className="flex items-start gap-1.5 text-xs rounded-md px-2 py-1"
              style={{ background: ORANJE.bg, color: ORANJE.ink }} title={`${o.model}: ${o.tekst}`}>
              <svg className="w-3 h-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="min-w-0 line-clamp-2">
                <span className="font-semibold">{o.model}</span> — {o.tekst}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Werk in uitvoering */}
      {workItems.length > 0 && (
        <div className="space-y-1 mb-3 flex-1">
          {workItems.map(w => (
            <div key={w.id} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-chg-bg-2 animate-pulse shrink-0" />
              {w.ticket
                ? <span className="text-chg text-xs font-mono">{w.ticket}</span>
                : <span className="text-chg text-xs font-medium">{w.consultant}</span>
              }
              <span className="text-chg text-xs truncate">{w.note}</span>
            </div>
          ))}
        </div>
      )}
      {workItems.length === 0 && <div className="flex-1" />}

      {/* Footer stats */}
      <div className="flex items-center gap-3 text-xs text-meta mt-auto pt-2 border-t border-line/50">
        <span>{totalModels} modellen</span>
        {stats.nietIn.length > 0 && (
          <>
            <span className="text-ink-4">·</span>
            <span className="text-ink-3">niet in {stats.nietIn.join(' en ')}</span>
          </>
        )}
        {diffModels > 0 && (
          <>
            <span className="text-ink-4">·</span>
            <span style={{ color: cfg.color }}>{diffModels} afwijkend van PROD</span>
          </>
        )}
      </div>
    </button>
  )
}

// ─── Stats balk ───────────────────────────────────────────────────────────────
function StatsBalk({ chainsList }) {
  const allStats = chainsList.map(c => chainStats(c))
  const stats = [
    { label: 'Ketens',          value: chainsList.length,                                                          color: 'var(--ink-2)' },
    { label: 'In ontwikkeling', value: allStats.filter(s => ['IN_ONTWIKKELING','ACTIEF'].includes(s.status)).length, color: GEEL.ink },
    { label: 'Klaar voor PROD', value: allStats.filter(s => ['KLAAR_VOOR_PROD','ACTIEF'].includes(s.status)).length, color: BLAUW.ink },
    { label: 'Stabiel',         value: allStats.filter(s => s.status === 'STABIEL').length,                         color: GROEN.ink },
  ]
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-card border border-line rounded-xl px-4 py-3">
          <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-meta text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function OverzichtView({ onBekijkGraph, chains, loading, error }) {
  const [zoek, setZoek] = useState('')
  const { deps } = useDependencies()

  // Elke keten zoals hij werkelijk wordt aangeroepen, met het werk van die versies
  const chainsList = useMemo(
    () => Object.entries(chains ?? {}).map(([id, c]) => ({ id, ...ketenOpgelost(c, deps) })),
    [chains, deps]
  )

  if (loading && !chains) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="w-6 h-6 text-meta animate-spin mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          <div className="text-meta text-sm">Ketens laden…</div>
        </div>
      </div>
    )
  }

  if (error && !chains) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-del text-sm">{error}</div>
      </div>
    )
  }

  const zichtbaar = chainsList.filter(c =>
    c.label.toLowerCase().includes(zoek.toLowerCase()) ||
    c.nodes.some(n => n.label.toLowerCase().includes(zoek.toLowerCase()))
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <StatsBalk chainsList={chainsList} />

        <div className="relative mb-5 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder="Zoek keten of model…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-full bg-card border border-line rounded-lg pl-9 pr-3 py-2 text-ink
                       text-sm focus:outline-none focus:border-accent placeholder-ink-3"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 items-stretch">
          {zichtbaar.map(({ id, ...chain }) => (
            <ChainCard
              key={id}
              chainId={id}
              chain={chain}
              onClick={() => onBekijkGraph(id)}
            />
          ))}
          {zichtbaar.length === 0 && (
            <div className="col-span-2 text-center py-12 text-ink-3 text-sm">
              Geen ketens gevonden
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
