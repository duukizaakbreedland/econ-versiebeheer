import { useState } from 'react'
import { promoteChain } from '../lib/api.js'

// nodes zijn de nodes uit de graph: een model dat in de keten op meerdere
// versies hangt, telt per versie mee.
export default function ChainPromoteForm({ nodes, onRefresh }) {
  const models    = nodes.filter(n => n.type === 'model')
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
      await promoteChain({ nodes, fromEnv, toEnv: target, ticket: ticket.trim() })
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
          ${msg.ok ? 'bg-add-bg text-add border border-add-bg-2' : 'bg-del-bg text-del border border-del-bg-2'}`}>
          {msg.text}
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-line
                     hover:border-line-2 text-ink hover:text-ink rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5 text-add" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Promoveer keten
        </button>
      ) : (
        <div className="bg-card border border-line rounded-xl p-3 w-64 space-y-2 shadow-depth-2">
          <div className="text-ink-2 text-xs font-medium">Promoveer keten</div>
          <div className="flex rounded-lg overflow-hidden border border-line">
            {canToAcc && (
              <button onClick={() => setTarget('ACC')}
                className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'ACC' ? 'bg-acc-bg text-acc' : 'bg-card text-ink-2 hover:text-ink'}`}>
                TST → ACC
              </button>
            )}
            {canToProd && (
              <button onClick={() => setTarget('PROD')}
                className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'PROD' ? 'bg-prod-bg text-prod' : 'bg-card text-ink-2 hover:text-ink'}`}>
                ACC → PROD
              </button>
            )}
          </div>
          <div className="text-ink-3 text-xs">{diffCount} model{diffCount !== 1 ? 'len' : ''} worden meegenomen</div>
          <input placeholder="Ticket (optioneel)" value={ticket} onChange={e => setTicket(e.target.value)}
            className="w-full bg-page border border-line rounded-lg px-3 py-1.5 text-ink text-xs focus:outline-none focus:border-accent placeholder-ink-3" />
          <div className="flex gap-2">
            <button onClick={handlePromote} disabled={saving}
              className="flex-1 btn-ok text-xs font-medium rounded-lg px-3 py-1.5">
              {saving ? 'Bezig…' : `Naar ${target}`}
            </button>
            <button onClick={() => { setOpen(false); setMsg(null) }}
              className="text-meta hover:text-ink text-xs px-2 transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
