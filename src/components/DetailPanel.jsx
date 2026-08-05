import { useState, useEffect, useCallback, useRef } from 'react'
import { versieStatus, statusSamenvatting, vergelijkVersies } from '../lib/chainUtils.js'
import {
  updateModel, updateWorkItem, deleteWorkItem, addWorkItem, fetchModelVersions,
  deleteModelVersion, fetchPromotiesVoorModel, rollbackDeployment,
} from '../lib/api.js'
import { useVoornaam } from '../lib/auth.jsx'
import { Section, Banner, InlineEdit, ConfirmButton, Select, Button, TextInput } from './ui/index.jsx'
import NodeActions from './NodeActions.jsx'

const ENV_ORDER = ['PROD', 'ACC', 'TST']
const ENV_COLOR = { PROD: '#22c55e', ACC: '#60a5fa', TST: '#fbbf24' }
const STATUS_LABEL = { IN_PROGRESS: 'In uitvoering', REVIEW: 'In review', DONE: 'Afgerond' }
// De werk-kaart is verder neutraal; het bolletje draagt de status.
const STATUS_KLEUR = {
  IN_PROGRESS: { kleur: '#fbbf24' },
  REVIEW:      { kleur: '#60a5fa' },
  DONE:        { kleur: '#475569' },
}

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

// ─── Samenvatting onder de omgevingslijst ─────────────────────────────────────
// Eén regel die zegt hoe ver de nieuwste versie is doorgezet. De lijst erboven
// toont de versies zelf al — dit vat alleen samen wat er nog open staat.
function KetenSamenvatting({ versions }) {
  const stappen = ['TST', 'ACC', 'PROD']
  const nieuwste = [...stappen]
    .map(e => versions[e])
    .filter(Boolean)
    .sort((a, b) => (vergelijkVersies(a, b) ?? 0))
    .pop()

  if (!nieuwste) return null

  const heeft = e => versions[e] && vergelijkVersies(versions[e], nieuwste) === 0
  const achterstand = stappen.filter(e => !heeft(e))

  return (
    <div className="text-slate-500 text-xs mt-2">
      {achterstand.length === 0
        ? <>Overal <span className="font-mono text-slate-300">{nieuwste}</span></>
        : <><span className="font-mono text-slate-300">{nieuwste}</span> staat nog niet in {achterstand.join(' en ')}</>}
    </div>
  )
}

// ─── Omgevingsrij ─────────────────────────────────────────────────────────────

const STATUS_TEKST = {
  voor:   { tekst: '↑ nieuwer dan PROD', kleur: '#fbbf24' },
  achter: { tekst: '↓ ouder dan PROD',   kleur: '#f97316' },
  anders: { tekst: '≠ wijkt af',         kleur: '#a855f7' },
}

function EnvRow({ env, version, eigenVersie, status, mistExport }) {
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
      {st && <span className="text-xs shrink-0 ml-auto" style={{ color: st.kleur }}>{st.tekst}</span>}
    </div>
  )
}

// ─── Eén werk-item, horend bij een versie ─────────────────────────────────────
// Werk hangt aan de versie waarvoor het is gedaan en schuift daarmee mee naar
// ACC en PROD. Zijn er meerdere versies in ontwikkeling, dan zijn er dus ook
// meerdere werk-items — elk onder zijn eigen versie.
function WerkRegel({ workItem, onChanged, onError }) {
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  const status = STATUS_KLEUR[workItem.status] ?? STATUS_KLEUR.IN_PROGRESS
  const loopt  = workItem.status === 'IN_PROGRESS'

  return (
    <div className={`bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-2 space-y-1.5
                     ${busy ? 'opacity-60' : ''}`}>
      {/* Wie, wanneer, en hoe ver */}
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${loopt ? 'animate-pulse' : ''}`}
          style={{ background: status.kleur }} title={STATUS_LABEL[workItem.status]} />
        <InlineEdit value={workItem.consultant} textClass="text-slate-200 text-xs font-semibold"
          onSave={v => run(() => updateWorkItem({ id: workItem.id, consultant: v }))} />
        {workItem.createdAt && (
          <span className="text-xs text-slate-600"
            title={new Date(workItem.createdAt).toLocaleString('nl-NL')}>
            {new Date(workItem.createdAt).toLocaleDateString('nl-NL',
              { day: '2-digit', month: 'short', year: '2-digit' })}
          </span>
        )}
        <div className="ml-auto">
          <Select value={workItem.status}
            onChange={e => run(() => updateWorkItem({ id: workItem.id, status: e.target.value }))}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </div>

      {/* Gelabelde regels met een vaste labelbreedte, zodat ze uitlijnen */}
      <div className="flex items-start gap-2 text-xs">
        <span className="text-slate-600 w-20 shrink-0 pt-0.5">Omschrijving</span>
        <div className="min-w-0 flex-1">
          <InlineEdit value={workItem.note} placeholder="geen" textClass="text-slate-400"
            onSave={v => run(() => updateWorkItem({ id: workItem.id, description: v }))} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600 w-20 shrink-0">Ticket</span>
        <InlineEdit value={workItem.ticket} placeholder="geen" mono textClass="text-slate-300"
          onSave={v => run(() => updateWorkItem({ id: workItem.id, ticket: v }))} />
      </div>

      {/* Verwijdert alleen deze aantekening — de versie zelf blijft staan.
          Die neem je terug met "Verwijder versie" op de versieregel erboven. */}
      <div className="flex justify-end pt-0.5">
        <ConfirmButton confirmLabel="Werk verwijderen?"
          onConfirm={() => run(() => deleteWorkItem(workItem.id))}>
          Verwijder werk
        </ConfirmButton>
      </div>
    </div>
  )
}

// ─── Eén koppeling naar een submodel ──────────────────────────────────────────
// Puur ter informatie: welke versie hier hangt volgt uit het model zelf en komt
// via de eCon-export binnen. Hier iets anders kiezen zou de werkelijkheid niet
// veranderen, alleen het overzicht laten liegen.
function KoppelingRij({ dep }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-600">via</span>
        <span className="text-blue-400">{dep.ifaceName}</span>
        <span className="font-mono text-slate-600">{dep.ifaceVersion}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-300 text-xs flex-1 min-w-0 truncate">{dep.childName}</span>
        <span className="font-mono text-slate-400 text-xs shrink-0">{dep.childVersion}</span>
      </div>
    </div>
  )
}

// ─── Koppelingen-sectie ───────────────────────────────────────────────────────
function KoppelingenSectie({ node, chain, chains, deps }) {
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
                <KoppelingRij key={k.id} dep={k} />
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

// ─── Promoties van dit model, met terugdraaien ────────────────────────────────
function PromotieSectie({ modelId, refreshKey, onChanged, onError }) {
  const [rijen, setRijen] = useState(null)
  const [busy,  setBusy]  = useState(false)

  useEffect(() => {
    let weg = false
    fetchPromotiesVoorModel(modelId)
      .then(r => { if (!weg) setRijen(r) })
      .catch(e => onError(e.message))
    return () => { weg = true }
  }, [modelId, refreshKey])

  if (!rijen || rijen.length === 0) return null

  async function draaiTerug(logId) {
    setBusy(true)
    try { await rollbackDeployment({ logId }); await onChanged() }
    catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Section title="Promoties">
      <div className="space-y-1">
        {rijen.slice(0, 5).map(p => (
          <div key={p.logId}
            className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-1.5">
            <span className="text-xs font-bold shrink-0" style={{ color: ENV_COLOR[p.env] }}>{p.env}</span>
            {p.van && <span className="font-mono text-slate-600 text-xs line-through">{p.van}</span>}
            <span className="text-slate-600 text-xs">→</span>
            <span className="font-mono text-slate-200 text-xs">{p.naar}</span>
            <span className="text-slate-600 text-xs ml-auto shrink-0"
              title={new Date(p.wanneer).toLocaleString('nl-NL')}>
              {new Date(p.wanneer).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
            </span>
            {p.terugTeDraaien && (
              <ConfirmButton confirmLabel="Terugdraaien?" disabled={busy}
                onConfirm={() => draaiTerug(p.logId)}>
                Terug
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>
      <p className="text-slate-600 text-xs mt-1.5">
        Alleen de laatste promotie per omgeving is terug te draaien.
      </p>
    </Section>
  )
}

// Werk dat je achteraf vastlegt hoort meestal al af te zijn: staat de versie al
// in PROD, dan is het klaar; staat hij in ACC, dan ligt hij ter review.
function statusBijEnvs(envs) {
  if (envs.some(e => e.name === 'PROD')) return 'DONE'
  if (envs.some(e => e.name === 'ACC'))  return 'REVIEW'
  return 'IN_PROGRESS'
}

// ─── Eén versieregel, met werk toevoegen en terugnemen ────────────────────────
function VersieRegel({ mv, onChanged, onError }) {
  const voornaam = useVoornaam()

  const [busy,   setBusy]   = useState(false)
  const [open,   setOpen]   = useState(false)
  const [cons,   setCons]   = useState(voornaam)
  const [note,   setNote]   = useState('')
  const [ticket, setTicket] = useState('')
  const [status, setStatus] = useState(() => statusBijEnvs(mv.envs))

  async function verwijder() {
    setBusy(true)
    try { await deleteModelVersion(mv.id); await onChanged() }
    catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  async function voegWerkToe() {
    if (!cons.trim()) return
    setBusy(true)
    try {
      await addWorkItem({
        modelVersionId: mv.id, consultant: cons.trim(),
        description: note.trim(), ticket: ticket.trim(), status,
      })
      setNote(''); setTicket(''); setCons(voornaam); setOpen(false)
      await onChanged()
    } catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className={busy ? 'opacity-60' : ''}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-slate-200">{mv.version}</span>
        <div className="flex gap-1">
          {ENV_ORDER.filter(e => mv.envs.some(x => x.name === e)).map(e => (
            <span key={e} className="px-1.5 rounded text-[10px] font-semibold"
              style={{ background: ENV_COLOR[e] + '20', color: ENV_COLOR[e] }}>
              {e}
            </span>
          ))}
        </div>
        <span className="ml-auto text-slate-600">
          {new Date(mv.created_at).toLocaleDateString('nl-NL',
            { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(o => !o)}>
          {open ? 'Annuleer' : '+ Werk'}
        </Button>
        <ConfirmButton confirmLabel="Versie verwijderen?" disabled={busy} onConfirm={verwijder}>
          Verwijder versie
        </ConfirmButton>
      </div>

      {(open || mv.werk.length > 0) && (
        <div className="mt-1 space-y-1.5 pl-2 border-l border-slate-700/60">
          {open && (
            <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-2 space-y-1.5">
              <TextInput placeholder="Consultant" value={cons}
                onChange={e => setCons(e.target.value)} />
              <TextInput placeholder="Omschrijving (optioneel)" value={note}
                onChange={e => setNote(e.target.value)} />
              <TextInput placeholder="Ticket (optioneel)" value={ticket}
                onChange={e => setTicket(e.target.value)} />
              <div className="flex items-center gap-2">
                <Select className="flex-1" value={status} onChange={e => setStatus(e.target.value)}>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Button variant="primary" disabled={busy || !cons.trim()} onClick={voegWerkToe}>
                  {busy ? 'Opslaan…' : 'Voeg toe'}
                </Button>
              </div>
            </div>
          )}

          {mv.werk.map(w => (
            <WerkRegel key={w.id} workItem={w} onChanged={onChanged} onError={onError} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Versies met het werk dat eraan hangt ─────────────────────────────────────
function VersiesSectie({ modelId, refreshKey, onChanged, onError }) {
  const [rows, setRows] = useState(null)
  const [alles, setAlles] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchModelVersions(modelId)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(e => onError(e.message))
    return () => { cancelled = true }
  }, [modelId, refreshKey])

  if (!rows) return <Section title="Versies en werk"><div className="text-slate-600 text-xs">Laden…</div></Section>
  if (rows.length === 0) return <Section title="Versies en werk"><div className="text-slate-600 text-xs">Nog geen versies</div></Section>

  // Versies waar werk aan hangt of die ergens draaien eerst; de rest is ruis
  const metInhoud = rows.filter(r => r.werk.length > 0 || r.envs.length > 0)
  const zichtbaar = alles ? rows : (metInhoud.length > 0 ? metInhoud : rows.slice(0, 5))
  const werkTotaal = rows.reduce((n, r) => n + r.werk.length, 0)

  return (
    <Section title={`Versies en werk (${rows.length})`} collapsible defaultOpen>
      <div className="space-y-2">
        {zichtbaar.map(mv => (
          <VersieRegel key={mv.id} mv={mv} onChanged={onChanged} onError={onError} />
        ))}
      </div>

      {rows.length > zichtbaar.length && (
        <button onClick={() => setAlles(true)}
          className="text-slate-500 hover:text-slate-300 text-xs mt-2 transition-colors">
          Toon alle {rows.length} versies
        </button>
      )}
      {alles && rows.length > metInhoud.length && (
        <button onClick={() => setAlles(false)}
          className="text-slate-500 hover:text-slate-300 text-xs mt-2 transition-colors">
          Toon minder
        </button>
      )}

      <p className="text-slate-600 text-xs mt-2">
        Werk hoort bij een versie en schuift daarmee mee naar ACC en PROD.
        {werkTotaal === 0 && ' Met "+ Werk" hang je het alsnog aan een versie die er al staat.'}
        {' '}Neem je een versie terug, dan valt de omgeving terug op de vorige.
      </p>
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

        {/* Algemene opmerking — gaat over het model zelf, niet over een versie */}
        <Section title="Opmerking">
          <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-2.5 py-2 text-xs">
            <InlineEdit
              value={d.notes}
              multiline
              placeholder="Opmerking toevoegen…"
              textClass="text-slate-300 leading-relaxed"
              onSave={async next => {
                try { await updateModel({ modelId: d.modelId, notes: next }); await handleChanged() }
                catch (e) { setErr(e.message) }
              }}
            />
          </div>
        </Section>

        {/* Versies zoals ze in deze keten worden aangeroepen */}
        <Section title="Versies in deze keten">
          <div className="bg-slate-900 rounded-lg border border-slate-700/50 overflow-hidden">
            {ENV_ORDER.map(naam => (
              <EnvRow
                key={naam}
                env={naam}
                version={d.versions[naam]}
                eigenVersie={d.eigenVersies?.[naam]}
                status={naam === 'PROD' ? null : versieStatus(d.versions[naam], d.versions.PROD)}
                mistExport={d.ontbreekt?.includes(naam)}
              />
            ))}
          </div>
          <KetenSamenvatting versions={d.versions} />
          {d.ontbreekt?.length > 0 && (
            <div className="mt-2 text-xs text-red-400/90 bg-red-950/30 border border-red-900/50 rounded-lg px-2.5 py-2">
              ⚠ Deze versie wordt wel aangeroepen maar kwam niet voor in de eCon-export
              van {d.ontbreekt.join(' en ')}.
            </div>
          )}
        </Section>

        {/* Versies met het werk dat eraan hangt — wat er is gedaan, vóór wat je kunt doen */}
        {isModel && (
          <VersiesSectie
            modelId={d.modelId} refreshKey={refreshKey}
            onChanged={handleChanged} onError={setErr}
          />
        )}

        {/* Wat je met dit model kunt doen */}
        {isModel && (
          <NodeActions
            modelName={d.label}
            modelId={d.modelId}
            versions={d.versions}
            onRefresh={handleChanged}
          />
        )}

        {/* Wat er al gepromoveerd is, en wat daarvan terug kan */}
        {isModel && (
          <PromotieSectie
            modelId={d.modelId} refreshKey={refreshKey}
            onChanged={handleChanged} onError={setErr}
          />
        )}

        {/* Koppelingen — per omgeving te bekijken */}
        <KoppelingenSectie node={node} chain={chain} chains={chains} deps={deps} />
      </div>
    </aside>
  )
}
