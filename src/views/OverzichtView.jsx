import { useState } from 'react'
import { chainStats } from '../lib/chainUtils.js'

const STATUS_CFG = {
  STABIEL:         { color: '#22c55e', bg: '#052e16', border: '#166534', label: 'Stabiel'         },
  IN_ONTWIKKELING: { color: '#fbbf24', bg: '#1c1200', border: '#92400e', label: 'In ontwikkeling' },
  KLAAR_VOOR_PROD: { color: '#60a5fa', bg: '#0c1f3d', border: '#1d4ed8', label: 'Klaar voor PROD' },
  ACTIEF:          { color: '#f97316', bg: '#1c0a00', border: '#9a3412', label: 'Meerdere open'   },
}

// ─── Keten kaart ──────────────────────────────────────────────────────────────
function ChainCard({ chainId, chain, onClick }) {
  const stats       = chainStats(chain)
  const cfg         = STATUS_CFG[stats.status]
  const workItems   = chain.nodes.filter(n => n.workItem)
  const totalModels = chain.nodes.filter(n => n.type === 'model').length
  const diffModels  = chain.nodes.filter(n => n.type === 'model' && n.versions.TST !== n.versions.PROD).length

  return (
    <button
      onClick={onClick}
      className="group text-left bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500
                 transition-all cursor-pointer w-full h-full flex flex-col"
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      {/* Titel + pijl */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-slate-200 font-semibold text-sm leading-snug flex-1 min-w-0 truncate">
          {chain.label}
        </div>
        <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-0.5"
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

      {/* Werk in uitvoering */}
      {workItems.length > 0 && (
        <div className="space-y-1 mb-3 flex-1">
          {workItems.map(n => (
            <div key={n.id} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              {n.workItem.ticket
                ? <span className="text-amber-300 text-xs font-mono">{n.workItem.ticket}</span>
                : <span className="text-amber-300 text-xs font-medium">{n.workItem.consultant}</span>
              }
              <span className="text-amber-600 text-xs truncate">{n.workItem.note}</span>
            </div>
          ))}
        </div>
      )}
      {workItems.length === 0 && <div className="flex-1" />}

      {/* Footer stats */}
      <div className="flex items-center gap-3 text-xs text-slate-500 mt-auto pt-2 border-t border-slate-700/50">
        <span>{totalModels} modellen</span>
        {diffModels > 0 && (
          <>
            <span className="text-slate-700">·</span>
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
    { label: 'Ketens',          value: chainsList.length,                                                          color: '#94a3b8' },
    { label: 'In ontwikkeling', value: allStats.filter(s => ['IN_ONTWIKKELING','ACTIEF'].includes(s.status)).length, color: '#fbbf24' },
    { label: 'Klaar voor PROD', value: allStats.filter(s => ['KLAAR_VOOR_PROD','ACTIEF'].includes(s.status)).length, color: '#60a5fa' },
    { label: 'Stabiel',         value: allStats.filter(s => s.status === 'STABIEL').length,                         color: '#22c55e' },
  ]
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function OverzichtView({ onBekijkGraph, chains, loading, error }) {
  const [zoek, setZoek] = useState('')

  if (loading && !chains) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="w-6 h-6 text-slate-500 animate-spin mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          <div className="text-slate-500 text-sm">Ketens laden…</div>
        </div>
      </div>
    )
  }

  if (error && !chains) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  const chainsList = Object.entries(chains).map(([id, c]) => ({ id, ...c }))

  const zichtbaar = chainsList.filter(c =>
    c.label.toLowerCase().includes(zoek.toLowerCase()) ||
    c.nodes.some(n => n.label.toLowerCase().includes(zoek.toLowerCase()))
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <StatsBalk chainsList={chainsList} />

        <div className="relative mb-5 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder="Zoek keten of model…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white
                       text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
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
            <div className="col-span-2 text-center py-12 text-slate-600 text-sm">
              Geen ketens gevonden
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
