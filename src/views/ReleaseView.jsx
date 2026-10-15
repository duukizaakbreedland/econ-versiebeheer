import { useState, useMemo } from 'react'
import { updateDeploymentLog } from '../lib/api.js'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { InlineEdit, Banner, Button, Spinner, EnvChip } from '../components/ui/index.jsx'
import { TerugdraaiDialoog } from '../components/dialogen.jsx'
import { ENV } from '../lib/kleuren.js'
import { ENVS } from '../lib/chainUtils.js'

// Alles waarop je een release kunt terugvinden: modellen, ticket, tester, wie,
// omgeving en de datum in de vormen waarin je hem intikt
function zoektekst(r) {
  const d = new Date(r.deployedAt)
  const p = n => String(n).padStart(2, '0')
  const dag = p(d.getDate()), maand = p(d.getMonth() + 1), jaar = String(d.getFullYear())
  const datums = [
    `${dag}-${maand}-${jaar}`, `${dag}-${maand}-${jaar.slice(2)}`, `${d.getDate()}-${d.getMonth() + 1}-${jaar}`,
    `${jaar}-${maand}-${dag}`, `${dag}/${maand}/${jaar}`,
    d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
    d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }),
  ]
  const modellen = [
    ...r.versions.map(v => `${v.modelName} ${v.version}`),
    ...r.deps.flatMap(k => [k.parentName, k.childName]),
  ]
  return [...datums, ...modellen, r.ticket, r.testedBy, r.deployedBy, r.env, r.rolledBackAt ? 'teruggedraaid' : '']
    .filter(Boolean).join(' | ').toLowerCase()
}

function formatTijd(iso) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function dagKop(iso) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function LogEntry({ r, nieuwste, onChanged, onError, onTerug }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const cfg = ENV[r.env] ?? ENV.TST
  const deployed = r.versions.filter(v => v.role === 'DEPLOYED')
  const replaced = r.versions.filter(v => v.role === 'REPLACED')
  const terug = Boolean(r.rolledBackAt)

  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message ?? 'Onbekende fout') }
    finally { setBusy(false) }
  }

  return (
    <div className={`bg-card border border-line rounded-xl overflow-hidden ${busy ? 'opacity-60' : ''} ${terug ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <EnvChip env={r.env} className="text-xs px-2 py-0.5" />
          <span className="text-ink-2 text-xs">{formatTijd(r.deployedAt)}</span>
          <span className="text-xs">
            <InlineEdit value={r.ticket} placeholder="ticket" mono textClass="text-ink-2"
              onSave={v => run(() => updateDeploymentLog({ id: r.id, ticket: v }))} />
          </span>
          <span className="text-xs flex items-center gap-1">
            <span className="text-ink-3">getest door</span>
            <InlineEdit value={r.testedBy} placeholder="—" textClass="text-ink-2"
              onSave={v => run(() => updateDeploymentLog({ id: r.id, testedBy: v }))} />
          </span>
          {r.deployedBy && <span className="text-xs text-ink-3">door {r.deployedBy.split('@')[0]}</span>}
          {terug && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-del-bg text-del border border-del-bg-2"
              title={`${new Date(r.rolledBackAt).toLocaleString('nl-NL')} door ${r.rolledBackBy ?? '?'}`}>
              teruggedraaid{r.rollbackReason ? `: ${r.rollbackReason}` : ''}
            </span>
          )}
          <span className="ml-auto text-ink-3 text-xs shrink-0">
            {deployed.length > 0 || r.deps.length === 0
              ? `${deployed.length} versie${deployed.length !== 1 ? 's' : ''}`
              : `${r.deps.length} aanroep${r.deps.length !== 1 ? 'en' : ''}`}
          </span>
          {nieuwste && !terug && <Button variant="ghost" onClick={() => onTerug(r)}>Terug</Button>}
          <button onClick={() => setOpen(o => !o)} className="text-ink-3 hover:text-ink-2 transition-colors shrink-0" title="Details">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>

        <div className="mt-2 space-y-1">
          {deployed.map(v => {
            const oud = replaced.find(x => x.modelId === v.modelId)
            return (
              <div key={v.versionId} className={`flex items-center gap-2 text-xs ${terug ? 'line-through' : ''}`}>
                <span className="text-ink truncate">{v.modelName}</span>
                {v.type === 'INTERFACE' && <span className="text-mov text-[10px]">interface</span>}
                {oud && (
                  <>
                    <span className="font-mono text-ink-3 line-through">{oud.version}</span>
                    <svg className="w-3 h-3 text-ink-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </>
                )}
                <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: cfg.bg, color: cfg.ink }}>{v.version}</span>
              </div>
            )
          })}
        </div>
      </div>

      {open && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          {r.deps.length > 0 && (
            <div>
              <div className="text-meta text-xs font-medium uppercase tracking-wide mb-1.5">Aanroepen omgezet ({r.deps.length})</div>
              <div className="space-y-1">
                {r.deps.map((k, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs flex-wrap">
                    <span className="text-ink-2">{k.parentName}</span>
                    <span className="font-mono text-ink-3">{k.parentVersion}</span>
                    <span className="text-ink-3">→</span>
                    <span className="text-ink">{k.childName}</span>
                    {k.oldVersion && <span className="font-mono text-ink-3 line-through">{k.oldVersion}</span>}
                    <span className="font-mono text-ink">{k.newVersion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-meta text-xs font-medium uppercase tracking-wide mb-1.5">Notitie</div>
            <div className="text-xs">
              <InlineEdit value={r.notes} placeholder="Klik om een notitie toe te voegen" textClass="text-ink" className="w-full"
                onSave={v => run(() => updateDeploymentLog({ id: r.id, notes: v }))} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReleaseView({ route, ga }) {
  const { snap, loading, error, refresh } = useSnapshot()
  const [actionErr, setActionErr] = useState(null)
  const [zoek, setZoek] = useState('')
  const [terug, setTerug] = useState(null)
  const envFilter = route.query?.env ?? null

  const zichtbaar = useMemo(() => {
    if (!snap) return []
    const termen = zoek.toLowerCase().split(/\s+/).filter(Boolean)
    return snap.releases
      .filter(r => !envFilter || r.env === envFilter)
      .filter(r => termen.length === 0 || termen.every(w => zoektekst(r).includes(w)))
  }, [snap, zoek, envFilter])

  // De laatste niet-teruggedraaide release per omgeving mag terug
  const nieuwste = useMemo(() => {
    const m = {}
    for (const r of snap?.releases ?? []) if (!r.rolledBackAt && !m[r.env]) m[r.env] = r.id
    return m
  }, [snap])

  if (!snap) return error ? <div className="p-6"><Banner ok={false}>{error}</Banner></div> : <Spinner />

  // Groepering per dag
  const perDag = []
  for (const r of zichtbaar) {
    const dag = new Date(r.deployedAt).toDateString()
    if (perDag.length === 0 || perDag[perDag.length - 1].dag !== dag) perDag.push({ dag, kop: dagKop(r.deployedAt), items: [] })
    perDag[perDag.length - 1].items.push(r)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ink font-semibold text-sm">Releases</h2>
          <button onClick={refresh} className="text-meta hover:text-ink text-xs flex items-center gap-1.5 transition-colors">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            Vernieuwen
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative max-w-xs flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-meta" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input data-zoekveld type="text" placeholder="Zoek op model, datum, ticket, wie…" value={zoek} onChange={e => setZoek(e.target.value)}
              className="w-full bg-card border border-line rounded-lg pl-9 pr-3 py-2 text-ink text-sm focus:outline-none focus:border-accent placeholder-ink-3" />
          </div>
          <div className="flex gap-0.5">
            {ENVS.map(e => (
              <button key={e} onClick={() => ga({ tab: 'releases', query: { env: envFilter === e ? null : e } }, { vervang: true })}
                className="px-2 py-1 text-xs font-bold rounded transition-colors"
                style={envFilter === e ? { background: ENV[e].bg, color: ENV[e].ink } : { color: 'var(--ink-3)' }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {actionErr && <div className="mb-3"><Banner ok={false} onClose={() => setActionErr(null)}>{actionErr}</Banner></div>}

        {snap.releases.length === 0 ? (
          <div className="text-center py-16 text-ink-3 text-sm">Nog geen releases. Een release ontstaat bij het promoveren van een versie.</div>
        ) : zichtbaar.length === 0 ? (
          <div className="text-center py-16 text-ink-3 text-sm">Geen releases gevonden</div>
        ) : (
          <div className="space-y-5">
            {perDag.map(g => (
              <div key={g.dag}>
                <div className="text-meta text-xs font-semibold uppercase tracking-wide mb-2">{g.kop}</div>
                <div className="space-y-2">
                  {g.items.map(r => (
                    <LogEntry key={r.id} r={r} nieuwste={nieuwste[r.env] === r.id}
                      onChanged={() => { setActionErr(null); return refresh() }} onError={setActionErr} onTerug={setTerug} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {terug && <TerugdraaiDialoog release={terug} onClose={() => setTerug(null)} />}
    </div>
  )
}
