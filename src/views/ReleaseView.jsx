import { useState, useEffect } from 'react'
import { fetchReleases, updateDeploymentLog } from '../lib/api.js'
import { InlineEdit, Banner } from '../components/ui/index.jsx'

const ENV_CFG = {
  PROD: { color: '#22c55e', bg: '#052e16', border: '#166534' },
  ACC:  { color: '#60a5fa', bg: '#0c1f3d', border: '#1d4ed8' },
  TST:  { color: '#fbbf24', bg: '#1c1200', border: '#92400e' },
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function LogEntry({ log, onChanged, onError }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const env      = log.environments?.name ?? '?'
  const cfg      = ENV_CFG[env] ?? ENV_CFG.TST
  const deployed = log.deployment_log_versions?.filter(v => v.role === 'DEPLOYED') ?? []
  const replaced = log.deployment_log_versions?.filter(v => v.role === 'REPLACED') ?? []

  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message ?? 'Onbekende fout') }
    finally { setBusy(false) }
  }

  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl overflow-hidden ${busy ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {env}
          </span>
          <span className="text-slate-400 text-xs flex-shrink-0">{formatDate(log.deployed_at)}</span>
          <span className="text-xs">
            <InlineEdit value={log.ticket} placeholder="ticket" mono textClass="text-slate-400"
              onSave={v => run(() => updateDeploymentLog({ id: log.id, ticket: v }))} />
          </span>
          <span className="ml-auto text-slate-600 text-xs flex-shrink-0">
            {deployed.length} model{deployed.length !== 1 ? 'len' : ''}
          </span>
          <button onClick={() => setOpen(o => !o)}
            className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
            title="Details">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>

        {/* Wat er verving wat, meteen zichtbaar */}
        <div className="mt-2 space-y-1">
          {deployed.map((v, i) => {
            const oud = replaced.find(
              r => r.model_versions?.models?.name === v.model_versions?.models?.name)
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-slate-300 truncate">{v.model_versions?.models?.name}</span>
                {oud && (
                  <>
                    <span className="font-mono text-slate-600 line-through">{oud.model_versions?.version}</span>
                    <svg className="w-3 h-3 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
                <span className="font-mono px-1.5 py-0.5 rounded"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  {v.model_versions?.version}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          <div>
            <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1.5">Notitie</div>
            <div className="text-xs">
              <InlineEdit value={log.notes} placeholder="Klik om een notitie toe te voegen"
                textClass="text-slate-300" className="w-full"
                onSave={v => run(() => updateDeploymentLog({ id: log.id, notes: v }))} />
            </div>
          </div>

          <div className="text-slate-600 text-xs pt-1 border-t border-slate-700/60">
            Terugdraaien doe je bij het model zelf, in de Dependency Graph.
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReleaseView() {
  const [logs,      setLogs]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [actionErr, setActionErr] = useState(null)

  function load() {
    setLoading(true)
    return fetchReleases()
      .then(setLogs)
      .catch(e => setError(e.message ?? 'Fout bij laden'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading && !logs) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500 text-sm">Laden…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-200 font-semibold text-sm">Release geschiedenis</h2>
          <button onClick={load}
            className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1.5 transition-colors">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            Vernieuwen
          </button>
        </div>

        {actionErr && (
          <div className="mb-3">
            <Banner ok={false} onClose={() => setActionErr(null)}>{actionErr}</Banner>
          </div>
        )}

        {logs?.length === 0 ? (
          <div className="text-center py-16 text-slate-600 text-sm">
            Nog geen releases geregistreerd
          </div>
        ) : (
          <div className="space-y-2">
            {logs?.map(log => (
              <LogEntry key={log.id} log={log}
                onChanged={() => { setActionErr(null); return load() }}
                onError={setActionErr} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
