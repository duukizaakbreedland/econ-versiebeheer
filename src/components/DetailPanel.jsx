import { useState, useEffect, useCallback, useRef } from 'react'
import { versieStatus, statusSamenvatting } from '../lib/chainUtils.js'
import {
  updateModel, removeVersionFromEnv,
  updateWorkItem, deleteWorkItem, fetchModelVersions, updateDependencyChild,
} from '../lib/api.js'
import { Section, Banner, InlineEdit, Menu, ConfirmButton, Select } from './ui/index.jsx'
import NodeActions from './NodeActions.jsx'

const ENV_ORDER = ['PROD', 'ACC', 'TST']
const ENV_COLOR = { PROD: '#22c55e', ACC: '#60a5fa', TST: '#fbbf24' }
const STATUS_LABEL = { IN_PROGRESS: 'In uitvoering', REVIEW: 'In review', DONE: 'Afgerond' }

const MIN_W = 360
const MAX_W = 680
const STORAGE_KEY = 'detailPanelWidth'

// ─── Breedte onthouden + slepen ───────────────────────────────────────────────
function useResizableWidth() {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return stored >= MIN_W && stored <= MAX_W ? stored : 440
  })
  const dragging = useRef(false)

  const onMouseDown = useCallback(e => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return
      const next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX))
      setWidth(next)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth(w => { localStorage.setItem(STORAGE_KEY, String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { width, onMouseDown }
}

// ─── Omgevingsrij ─────────────────────────────────────────────────────────────
const STATUS_TEKST = {
  voor:   { tekst: '↑ nieuwer dan PROD', kleur: '#fbbf24' },
  achter: { tekst: '↓ ouder dan PROD',   kleur: '#f97316' },
  anders: { tekst: '≠ wijkt af',         kleur: '#a855f7' },
}

function EnvRow({ env, version, eigenVersie, versionId, status, mistExport, onChanged, onError }) {
  const color = ENV_COLOR[env]
  const st    = STATUS_TEKST[status]
  // De versie die het model op zichzelf heeft, kan afwijken van hoe deze keten
  // hem aanroept — dat is normaal zodra een submodel op meerdere plekken hangt.
  const eigenAfwijkend = eigenVersie && eigenVersie !== version

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-800 first:border-t-0"
      style={{ background: st ? st.kleur + '12' : 'transparent' }}>
      <span className="text-xs font-bold w-11 shrink-0" style={{ color }}>{env}</span>

      <div className="min-w-0">
        {version ? (
          <span className="font-mono text-xs" style={{ color: st ? st.kleur : '#cbd5e1',
            fontWeight: st ? 700 : 400 }}>
            {version}
          </span>
        ) : (
          <span className="text-slate-700 text-xs italic">niet actief</span>
        )}
        {eigenAfwijkend && (
          <span className="text-slate-600 text-xs ml-2" title="De versie die dit model op zichzelf heeft">
            eigen: <span className="font-mono">{eigenVersie}</span>
          </span>
        )}
      </div>

      {mistExport && (
        <span className="text-red-400 text-xs shrink-0" title="Deze versie kwam niet voor in de eCon-export">⚠</span>
      )}
      {st && <span className="text-xs shrink-0" style={{ color: st.kleur }}>{st.tekst}</span>}

      <div className="ml-auto">
        <Menu items={[
          versionId && {
            label: `Eigen versie uit ${env} halen`,
            danger: true,
            onClick: async () => {
              try { await removeVersionFromEnv({ modelVersionId: versionId, envName: env }); await onChanged() }
              catch (e) { onError(e.message) }
            },
          },
        ]} />
      </div>
    </div>
  )
}

// ─── Werk-sectie ──────────────────────────────────────────────────────────────
// Werk ontstaat bij het registreren van een nieuwe versie; hier alleen bijwerken.
function WerkSectie({ workItem, onChanged, onError }) {
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  if (!workItem) return null

  return (
    <Section title="Werk">
      <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <InlineEdit value={workItem.consultant} textClass="text-amber-300 text-xs font-semibold"
            onSave={v => run(() => updateWorkItem({ id: workItem.id, consultant: v }))} />
          <div className="ml-auto">
            <Select value={workItem.status}
              onChange={e => run(() => updateWorkItem({ id: workItem.id, status: e.target.value }))}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        </div>

        <div className="text-xs">
          <InlineEdit value={workItem.note} placeholder="Geen omschrijving" textClass="text-amber-500/90"
            onSave={v => run(() => updateWorkItem({ id: workItem.id, description: v }))} />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-700">Ticket</span>
          <InlineEdit value={workItem.ticket} placeholder="geen" mono textClass="text-amber-400"
            onSave={v => run(() => updateWorkItem({ id: workItem.id, ticket: v }))} />
          <div className="ml-auto">
            <ConfirmButton confirmLabel="Verwijderen?"
              onConfirm={() => run(() => deleteWorkItem(workItem.id))}>
              Verwijder
            </ConfirmButton>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ─── Eén koppeling naar een submodel, met keuze van de versie ─────────────────
function KoppelingRij({ dep, env, onChanged, onError }) {
  const [versies, setVersies] = useState(null)
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchModelVersions(dep.childModelId)
      .then(r => { if (!cancelled) setVersies(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dep.childModelId])

  return (
    <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-600">via</span>
        <span className="text-blue-400">{dep.ifaceName}</span>
        <span className="font-mono text-slate-600">{dep.ifaceVersion}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-300 text-xs flex-1 min-w-0 truncate">{dep.childName}</span>
        {versies ? (
          <Select
            value={dep.childVersionId ?? ''}
            disabled={busy}
            onChange={async e => {
              setBusy(true)
              try { await updateDependencyChild({ id: dep.id, childVersionId: e.target.value }); await onChanged() }
              catch (err) { onError(err.message) }
              finally { setBusy(false) }
            }}>
            {versies.map(v => <option key={v.id} value={v.id}>{v.version}</option>)}
          </Select>
        ) : (
          <span className="font-mono text-slate-500 text-xs">{dep.childVersion}</span>
        )}
      </div>
    </div>
  )
}

// ─── Koppelingen-sectie ───────────────────────────────────────────────────────
function KoppelingenSectie({ node, chain, chains, deps, onChanged, onError }) {
  const [env, setEnv] = useState('PROD')

  const d        = node.data
  const kinderen = deps.filter(x => x.env === env && x.parentModelId === d.modelId)
  const ouders   = deps.filter(x => x.env === env && x.childModelId  === d.modelId)
  const isShared = d.sharedIn?.length > 0

  // Terugval op de vaste ketenstructuur zolang er niets is vastgelegd
  const structParents = chain.edges
    .filter(e => e.target === node.id)
    .map(e => chain.nodes.find(n => n.id === e.source))
    .filter(Boolean)
  const structChildren = chain.edges
    .filter(e => e.source === node.id)
    .map(e => chain.nodes.find(n => n.id === e.target))
    .filter(Boolean)

  const heeftKoppelingen = kinderen.length > 0 || ouders.length > 0

  if (!heeftKoppelingen && structParents.length === 0 && structChildren.length === 0 && !isShared) {
    return null
  }

  return (
    <Section title="Koppelingen"
      right={
        <div className="flex gap-0.5">
          {ENV_ORDER.map(e => (
            <button key={e} onClick={() => setEnv(e)}
              className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors"
              style={env === e
                ? { background: ENV_COLOR[e] + '25', color: ENV_COLOR[e] }
                : { color: '#475569' }}>
              {e}
            </button>
          ))}
        </div>
      }>
      <div className="space-y-3">
        {ouders.length > 0 && (
          <div>
            <div className="text-slate-600 text-xs mb-1">Wordt aangesproken door</div>
            {ouders.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className="text-slate-600">↑</span>
                <span className="text-slate-400 truncate">{o.parentName}</span>
                <span className="font-mono text-slate-600">{o.parentVersion}</span>
                <span className="ml-auto text-slate-500">
                  als <span className="font-mono text-slate-300">{o.childVersion}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {kinderen.length > 0 && (
          <div>
            <div className="text-slate-600 text-xs mb-1">Spreekt aan</div>
            <div className="space-y-1.5">
              {kinderen.map(k => (
                <KoppelingRij key={k.id} dep={k} env={env} onChanged={onChanged} onError={onError} />
              ))}
            </div>
          </div>
        )}

        {!heeftKoppelingen && (
          <div>
            <div className="text-slate-600 text-xs mb-1">
              Nog niets vastgelegd voor {env} — vaste ketenstructuur
            </div>
            {structParents.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
                <span className="text-slate-600">↑</span> {p.label}
              </div>
            ))}
            {structChildren.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
                <span className="text-slate-600">↓</span> {c.label}
              </div>
            ))}
          </div>
        )}

        {isShared && (
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-lg p-2.5">
            <div className="text-purple-400 text-xs font-semibold mb-1">Ook gebruikt in</div>
            {d.sharedIn.map(k => (
              <div key={k} className="flex items-center gap-2 text-xs text-purple-300/80 py-0.5">
                <span className="text-purple-700">•</span> {chains[k]?.label || k}
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Historie-sectie ──────────────────────────────────────────────────────────
function HistorieSectie({ modelId, refreshKey, onError }) {
  const [rows, setRows] = useState(null)
  const [alles, setAlles] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchModelVersions(modelId)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(e => onError(e.message))
    return () => { cancelled = true }
  }, [modelId, refreshKey])

  if (!rows) return <Section title="Versies"><div className="text-slate-600 text-xs">Laden…</div></Section>
  if (rows.length === 0) return <Section title="Versies"><div className="text-slate-600 text-xs">Nog geen versies</div></Section>

  const zichtbaar = alles ? rows : rows.slice(0, 5)

  return (
    <Section title={`Versies (${rows.length})`} collapsible defaultOpen>
      <div className="space-y-1">
        {zichtbaar.map(mv => (
          <div key={mv.id} className="flex items-center gap-2 text-xs py-0.5">
            <span className="font-mono text-slate-300">{mv.version}</span>
            <div className="flex gap-1">
              {ENV_ORDER.filter(e => mv.envs.some(x => x.name === e)).map(e => (
                <span key={e} className="px-1.5 rounded text-[10px] font-semibold"
                  style={{ background: ENV_COLOR[e] + '20', color: ENV_COLOR[e] }}>
                  {e}
                </span>
              ))}
            </div>
            <span className="ml-auto text-slate-600">
              {new Date(mv.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 5 && (
        <button onClick={() => setAlles(a => !a)}
          className="text-slate-500 hover:text-slate-300 text-xs mt-2 transition-colors">
          {alles ? 'Toon minder' : `Toon alle ${rows.length}`}
        </button>
      )}
    </Section>
  )
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function DetailPanel({ node, chain, chainKey, chains, deps = [], onClose, onRefresh }) {
  const { width, onMouseDown } = useResizableWidth()
  const [err, setErr] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  if (!node) return null

  const d = node.data
  const { label: statusLabel, kleur: statusColor } = statusSamenvatting(d.versions)
  const isShared = d.sharedIn?.length > 0
  const isModel  = node.type === 'model'

  async function handleChanged() {
    setErr(null)
    setRefreshKey(k => k + 1)
    await onRefresh()
  }

  return (
    <aside className="relative bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden shrink-0"
      style={{ width }}>

      {/* Sleepgreep */}
      <div onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/60 z-20 transition-colors"
        title="Sleep om de breedte aan te passen" />

      {/* Vaste kop */}
      <header className="px-4 pt-3 pb-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {isModel ? (
              <InlineEdit
                value={d.label}
                textClass="text-slate-100 font-bold text-sm"
                onSave={async next => {
                  if (!next) return
                  try { await updateModel({ modelId: d.modelId, name: next }); await handleChanged() }
                  catch (e) { setErr(e.message) }
                }}
              />
            ) : (
              <div className="text-slate-100 font-bold text-sm leading-snug break-words">{d.label}</div>
            )}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: statusColor + '20', color: statusColor, border: `1px solid ${statusColor}44` }}>
                {statusLabel}
              </span>
              <span className="text-slate-500 text-xs">{isModel ? 'Model' : 'Interface'}</span>
              {isShared && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: '#a855f720', color: '#a855f7', border: '1px solid #a855f744' }}>
                  Gedeeld
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="text-slate-600 hover:text-slate-300 text-xl leading-none transition-colors shrink-0">
            ×
          </button>
        </div>
      </header>

      {/* Inhoud */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {err && <Banner ok={false} onClose={() => setErr(null)}>{err}</Banner>}

        {/* Versies zoals ze in deze keten worden aangeroepen */}
        <Section title="Versies in deze keten">
          <div className="bg-slate-900 rounded-lg border border-slate-700/50 overflow-hidden">
            {ENV_ORDER.map(naam => (
              <EnvRow
                key={naam}
                env={naam}
                version={d.versions[naam]}
                eigenVersie={d.eigenVersies?.[naam]}
                versionId={d.versionIds?.[naam]}
                status={naam === 'PROD' ? null : versieStatus(d.versions[naam], d.versions.PROD)}
                mistExport={d.ontbreekt?.includes(naam)}
                onChanged={handleChanged}
                onError={setErr}
              />
            ))}
          </div>
          {d.ontbreekt?.length > 0 && (
            <div className="mt-2 text-xs text-red-400/90 bg-red-950/30 border border-red-900/50 rounded-lg px-2.5 py-2">
              ⚠ Deze versie wordt wel aangeroepen maar kwam niet voor in de eCon-export
              van {d.ontbreekt.join(' en ')}.
            </div>
          )}
        </Section>

        {/* Werk */}
        {isModel && (
          <WerkSectie workItem={d.workItem} onChanged={handleChanged} onError={setErr} />
        )}

        {/* Koppelingen — per omgeving te bekijken */}
        <KoppelingenSectie
          node={node} chain={chain} chains={chains} deps={deps}
          onChanged={handleChanged} onError={setErr}
        />

        {/* Versiehistorie */}
        {isModel && <HistorieSectie modelId={d.modelId} refreshKey={refreshKey} onError={setErr} />}

        {/* Acties */}
        {isModel && (
          <NodeActions
            modelName={d.label}
            modelId={d.modelId}
            versions={d.versions}
            onRefresh={handleChanged}
          />
        )}
      </div>
    </aside>
  )
}
