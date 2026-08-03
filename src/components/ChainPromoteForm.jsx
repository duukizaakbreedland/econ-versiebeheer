import { useState } from 'react'
import { promoteChain } from '../lib/api.js'

export default function ChainPromoteForm({ chainKey, chain, onRefresh }) {
  const models    = chain.nodes.filter(n => n.type === 'model')
  const canToAcc  = models.some(n => n.versions.TST && n.versions.ACC  !== n.versions.TST)
  const canToProd = models.some(n => n.versions.ACC && n.versions.PROD !== n.versions.ACC)

  const [open,   setOpen]   = useState(false)
  const [target, setTarget] = useState(canToAcc ? 'ACC' : 'PROD')
  const [ticket, setTicket] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState(null)

  if (!canToAcc && !canToProd) return null

  const fromEnv     = target === 'ACC' ? 'TST' : 'ACC'
  const diffCount   = models.filter(n =>
    target === 'ACC'
      ? n.versions.TST !== n.versions.ACC
      : n.versions.ACC !== n.versions.PROD
  ).length

  async function handlePromote() {
    setSaving(true); setMsg(null)
    try {
      await promoteChain({ chainKey, fromEnv, toEnv: target, ticket: ticket.trim() })
      setMsg({ ok: true, text: `${diffCount} modellen gepromoveerd naar ${target}` })
      setTicket(''); setOpen(false)
      await onRefresh()
    } catch (e) {
      setMsg({ ok: false, text: e.message ?? 'Onbekende fout' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      {msg && (
        <div className={`absolute top-10 right-0 z-30 text-xs px-3 py-2 rounded-lg whitespace-nowrap
          ${msg.ok ? 'bg-green-950 text-green-400 border border-green-800/40' : 'bg-red-950 text-red-400 border border-red-800/40'}`}>
          {msg.text}
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700
                     hover:border-slate-500 text-slate-300 hover:text-white rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Promoveer keten
        </button>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 w-64 space-y-2 shadow-xl">
          <div className="text-slate-400 text-xs font-medium">Promoveer keten</div>
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {canToAcc && (
              <button onClick={() => setTarget('ACC')}
                className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'ACC' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>
                TST → ACC
              </button>
            )}
            {canToProd && (
              <button onClick={() => setTarget('PROD')}
                className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'PROD' ? 'bg-green-700 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>
                ACC → PROD
              </button>
            )}
          </div>
          <div className="text-slate-600 text-xs">{diffCount} model{diffCount !== 1 ? 'len' : ''} worden meegenomen</div>
          <input placeholder="Ticket (optioneel)" value={ticket} onChange={e => setTicket(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500 placeholder-slate-600" />
          <div className="flex gap-2">
            <button onClick={handlePromote} disabled={saving}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-colors">
              {saving ? 'Bezig…' : `Naar ${target}`}
            </button>
            <button onClick={() => { setOpen(false); setMsg(null) }}
              className="text-slate-500 hover:text-slate-300 text-xs px-2 transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
