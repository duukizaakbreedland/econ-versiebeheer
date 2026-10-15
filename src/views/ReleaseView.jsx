import { useState, useEffect, useMemo } from 'react'
import { fetchReleases, updateDeploymentLog } from '../lib/api.js'
import { InlineEdit, Banner } from '../components/ui/index.jsx'
import { ENV } from '../lib/kleuren.js'

const ENV_CFG = {
  PROD: { color: ENV.PROD.ink, bg: ENV.PROD.bg, border: ENV.PROD.line },
  ACC:  { color: ENV.ACC.ink,  bg: ENV.ACC.bg,  border: ENV.ACC.line  },
  TST:  { color: ENV.TST.ink,  bg: ENV.TST.bg,  border: ENV.TST.line  },
}

// Alles waarop je een release kunt terugvinden: de modellen (ook die waarvan
// alleen de aanroep is omgezet), ticket, tester, omgeving en de datum in de
// vormen waarin je hem intikt (14-10, 14-10-2026, 2026-10-14, 14 okt).
function zoektekst(log) {
  const d = new Date(log.deployed_at)
  const p = n => String(n).padStart(2, '0')
  const dag = p(d.getDate()), maand = p(d.getMonth() + 1), jaar = String(d.getFullYear())
  const datums = [
    `${dag}-${maand}-${jaar}`, `${dag}-${maand}-${jaar.slice(2)}`, `${d.getDate()}-${d.getMonth() + 1}-${jaar}`,
    `${jaar}-${maand}-${dag}`, `${dag}/${maand}/${jaar}`,
    d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
    d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }),
  ]
  const modellen = [
    ...(log.deployment_log_versions ?? []).map(v => `${v.model_versions?.models?.name} ${v.model_versions?.version}`),
    ...(log.deployment_log_dependencies ?? []).flatMap(k => [k.parent?.models?.name, k.child?.name]),
  ]
  return [...datums, ...modellen, log.ticket, log.tested_by, log.environments?.name]
    .filter(Boolean).join(' | ').toLowerCase()
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
  const aanroepen = log.deployment_log_dependencies ?? []

  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message ?? 'Onbekende fout') }
    finally { setBusy(false) }
  }

  return (
    <div className={`bg-card border border-line rounded-xl overflow-hidden ${busy ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {env}
          </span>
          <span className="text-ink-2 text-xs flex-shrink-0">{formatDate(log.deployed_at)}</span>
          <span className="text-xs">
            <InlineEdit value={log.ticket} placeholder="ticket" mono textClass="text-ink-2"
              onSave={v => run(() => updateDeploymentLog({ id: log.id, ticket: v }))} />
          </span>
          <span className="text-xs flex items-center gap-1">
            <span className="text-ink-3">getest door</span>
            <InlineEdit value={log.tested_by} placeholder="—" textClass="text-ink-2"
              onSave={v => run(() => updateDeploymentLog({ id: log.id, testedBy: v }))} />
          </span>
          <span className="ml-auto text-ink-3 text-xs flex-shrink-0">
            {deployed.length > 0 || aanroepen.length === 0
              ? `${deployed.length} model${deployed.length !== 1 ? 'len' : ''}`
              : `${aanroepen.length} aanroep${aanroepen.length !== 1 ? 'en' : ''}`}
          </span>
          <button onClick={() => setOpen(o => !o)}
            className="text-ink-3 hover:text-ink-2 transition-colors shrink-0"
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
                <span className="text-ink truncate">{v.model_versions?.models?.name}</span>
                {oud && (
                  <>
                    <span className="font-mono text-ink-3 line-through">{oud.model_versions?.version}</span>
                    <svg className="w-3 h-3 text-ink-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
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
        <div className="border-t border-line px-4 py-3 space-y-3">
          {/* Welke ouder roept nu welke versie aan — dat is wat de graph toont */}
          {aanroepen.length > 0 && (
            <div>
              <div className="text-meta text-xs font-medium uppercase tracking-wide mb-1.5">
                Aanroepen omgezet ({aanroepen.length})
              </div>
              <div className="space-y-1">
                {aanroepen.map((k, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs flex-wrap">
                    <span className="text-ink-2">{k.parent?.models?.name}</span>
                    <span className="font-mono text-ink-3">{k.parent?.version}</span>
                    <span className="text-ink-3">→</span>
                    <span className="text-ink">{k.child?.name}</span>
                    {k.oud && <span className="font-mono text-ink-3 line-through">{k.oud.version}</span>}
                    <span className="font-mono text-ink">{k.nieuw?.version}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-meta text-xs font-medium uppercase tracking-wide mb-1.5">Notitie</div>
            <div className="text-xs">
              <InlineEdit value={log.notes} placeholder="Klik om een notitie toe te voegen"
                textClass="text-ink" className="w-full"
                onSave={v => run(() => updateDeploymentLog({ id: log.id, notes: v }))} />
            </div>
          </div>

          <div className="text-ink-3 text-xs pt-1 border-t border-line/60">
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
  const [zoek,      setZoek]      = useState('')

  // Elk woord moet ergens in de release voorkomen: "subkader okt" vindt de
  // releases met SubKaderModel in oktober
  const zichtbaar = useMemo(() => {
    const termen = zoek.toLowerCase().split(/\s+/).filter(Boolean)
    if (!logs || termen.length === 0) return logs
    return logs.filter(log => { const t = zoektekst(log); return termen.every(w => t.includes(w)) })
  }, [logs, zoek])

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
        <div className="text-meta text-sm">Laden…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-del text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-ink font-semibold text-sm">Release geschiedenis</h2>
          <button onClick={load}
            className="text-meta hover:text-ink text-xs flex items-center gap-1.5 transition-colors">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            Vernieuwen
          </button>
        </div>

        <div className="relative mb-4 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Zoek op model, datum of ticket…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-full bg-card border border-line rounded-lg pl-9 pr-3 py-2 text-ink
                       text-sm focus:outline-none focus:border-accent placeholder-ink-3"
          />
        </div>

        {actionErr && (
          <div className="mb-3">
            <Banner ok={false} onClose={() => setActionErr(null)}>{actionErr}</Banner>
          </div>
        )}

        {logs?.length === 0 ? (
          <div className="text-center py-16 text-ink-3 text-sm">
            Nog geen releases geregistreerd
          </div>
        ) : zichtbaar?.length === 0 ? (
          <div className="text-center py-16 text-ink-3 text-sm">
            Geen releases gevonden voor "{zoek}"
          </div>
        ) : (
          <div className="space-y-2">
            {zichtbaar?.map(log => (
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
