import { useState, useMemo } from 'react'
import { chainStats } from '../../lib/chainUtils.js'

const STATUS = {
  STABIEL:         { kleur: '#22c55e', titel: 'Overal gelijk' },
  IN_ONTWIKKELING: { kleur: '#fbbf24', titel: 'Werk in TST' },
  KLAAR_VOOR_PROD: { kleur: '#60a5fa', titel: 'Klaar voor productie' },
  ACTIEF:          { kleur: '#f97316', titel: 'Loopt op meerdere plekken' },
}

const OPSLAG = 'ketenMenuOpen'

export default function KetenMenu({ chains, actief, onKies }) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPSLAG) !== 'dicht')
  const [zoek, setZoek] = useState('')

  function toggle() {
    setOpen(o => {
      localStorage.setItem(OPSLAG, o ? 'dicht' : 'open')
      return !o
    })
  }

  const lijst = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    return Object.entries(chains)
      .map(([key, chain]) => {
        const stats = chainStats(chain)
        // Zoeken op ketennaam én op modelnaam: zo vind je waar een model in zit
        const naamRaak = chain.label.toLowerCase().includes(term)
        const modelRaak = term
          ? chain.nodes.filter(n => n.label.toLowerCase().includes(term)).map(n => n.label)
          : []
        return { key, chain, stats, naamRaak, modelRaak }
      })
      .filter(r => !zoek.trim() || r.naamRaak || r.modelRaak.length > 0)
      .sort((a, b) => a.chain.label.localeCompare(b.chain.label))
  }, [chains, zoek])

  if (!open) {
    return (
      <div className="w-10 shrink-0 bg-slate-800/60 border-r border-slate-700 flex flex-col items-center pt-3">
        <button onClick={toggle} title="Ketens tonen"
          className="text-slate-500 hover:text-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <aside className="w-60 shrink-0 bg-slate-800/60 border-r border-slate-700 flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs font-semibold">Ketens</span>
          <span className="text-slate-600 text-xs">{Object.keys(chains).length}</span>
          <button onClick={toggle} title="Menu inklappen"
            className="ml-auto text-slate-600 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>

        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Keten of model zoeken…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-white
                       text-xs focus:outline-none focus:border-blue-500 placeholder-slate-600"
          />
          {zoek && (
            <button onClick={() => setZoek('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {lijst.length === 0 && (
          <div className="text-slate-600 text-xs px-2 py-4 text-center">Niets gevonden</div>
        )}

        {lijst.map(({ key, chain, stats, modelRaak }) => {
          const gekozen = key === actief
          const cfg = STATUS[stats.status] ?? STATUS.STABIEL
          return (
            <button key={key} onClick={() => onKies(key)}
              className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                gekozen ? 'bg-slate-700/60' : 'hover:bg-slate-700/30'}`}
              style={gekozen ? { boxShadow: 'inset 2px 0 0 #3b82f6' } : undefined}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: cfg.kleur }} title={cfg.titel} />
                <span className={`text-xs truncate ${gekozen ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                  {chain.label}
                </span>
                <span className="ml-auto text-slate-600 text-xs shrink-0">{stats.models}</span>
              </div>
              {modelRaak.length > 0 && (
                <div className="text-blue-400/80 text-xs mt-0.5 pl-3.5 truncate"
                  title={modelRaak.join(', ')}>
                  {modelRaak.length === 1 ? modelRaak[0] : `${modelRaak.length} modellen`}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
