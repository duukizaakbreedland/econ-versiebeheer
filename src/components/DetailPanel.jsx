import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { versieStatus, statusSamenvatting, ENVS, STATUS_TEKEN } from '../lib/chainUtils.js'
import { promotieRichtingen, datum, STATUS_LABEL } from '../lib/releasePlan.js'
import { updateModel, updateWorkItem, addWorkItem, deleteWorkItem, removeDependency } from '../lib/api.js'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { useVoornaam } from '../lib/auth.jsx'
import { Section, Banner, InlineEdit, ConfirmButton, Select, Button, TextInput, EnvChip, Chip, Leeg, useToast } from './ui/index.jsx'
import { RegistreerDialoog, PromoveerDialoog, AanroepDialoog, TerugdraaiDialoog, VerwijderDialoog, statusBijEnvs } from './dialogen.jsx'
import { ENV, GEEL, BLAUW, ORANJE, VIOLET, GRIJS, tint } from '../lib/kleuren.js'

const STATUS_KLEUR = { IN_PROGRESS: GEEL.ink, REVIEW: BLAUW.ink, DONE: GRIJS.ink }

const MIN_W = 360
const MAX_W = 720
const STORAGE_KEY = 'detailPanelWidth'

// ─── Breedte onthouden + slepen ───────────────────────────────────────────────
function useResizableWidth() {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return stored >= MIN_W && stored <= MAX_W ? stored : 460
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
      setWidth(Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX)))
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

// ─── Waar draait het ──────────────────────────────────────────────────────────
const STATUS_TEKST = {
  voor:   { tekst: 'nieuwer dan PROD', familie: GEEL },
  achter: { tekst: 'ouder dan PROD',   familie: ORANJE },
  anders: { tekst: 'wijkt af',         familie: VIOLET },
}

function EnvRow({ env, version, versionId, status, mistExport, snap }) {
  const st = STATUS_TEKST[status]
  const sinds = versionId ? snap.presentSince(versionId, env) : null
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-line first:border-t-0"
      style={{ background: st ? st.familie.bg : 'transparent' }}>
      <span className="text-xs font-bold w-11 shrink-0" style={{ color: ENV[env].ink }}>{env}</span>
      <div className="min-w-0 flex items-center gap-2">
        {version ? (
          <span className="font-mono text-xs" style={{ color: st ? st.familie.ink : 'var(--ink)', fontWeight: st ? 700 : 400 }}>{version}</span>
        ) : (
          <span className="text-ink-4 text-xs italic">draait hier niet</span>
        )}
        {sinds && <span className="text-ink-3 text-[11px]" title={new Date(sinds).toLocaleString('nl-NL')}>sinds {datum(sinds)}</span>}
      </div>
      {mistExport && <span className="text-del text-xs shrink-0" title="Deze versie kwam niet voor in de eCon-export">⚠</span>}
      {st && <span className="text-xs shrink-0 ml-auto" style={{ color: st.familie.ink }}>{STATUS_TEKEN[status]} {st.tekst}</span>}
    </div>
  )
}

function KetenSamenvatting({ versions, isWortel }) {
  const aanwezig = ENVS.filter(e => versions[e])
  if (aanwezig.length === 0) return null
  const nieuwste = ['TST', 'ACC', 'PROD'].map(e => versions[e]).filter(Boolean)
    .sort((a, b) => (vergelijk(a, b) ?? 0)).pop()
  const achterstand = ['TST', 'ACC', 'PROD'].filter(e => versions[e] !== nieuwste)
  return (
    <div className="text-meta text-xs mt-2">
      {achterstand.length === 0
        ? <>Overal <span className="font-mono text-ink">{nieuwste}</span></>
        : <><span className="font-mono text-ink">{nieuwste}</span> staat nog niet in {achterstand.join(' en ')}{!isWortel && ' (in deze keten)'}</>}
    </div>
  )
}
import { vergelijkVersies as vergelijk } from '../lib/versies.js'

// ─── Werk ─────────────────────────────────────────────────────────────────────
function WerkRegel({ w, onChanged, onError }) {
  const [busy, setBusy] = useState(false)
  async function run(fn) {
    setBusy(true)
    try { await fn(); await onChanged() }
    catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }
  const loopt = w.status === 'IN_PROGRESS'
  return (
    <div className={`bg-card-2 border border-line/60 rounded-lg px-2.5 py-2 space-y-1 ${busy ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${loopt ? 'animate-pulse' : ''}`}
          style={{ background: STATUS_KLEUR[w.status] }} title={STATUS_LABEL[w.status]} />
        <InlineEdit value={w.consultant} textClass="text-ink text-xs font-semibold"
          onSave={v => run(() => updateWorkItem({ id: w.id, consultant: v }))} />
        <span className="font-mono text-ink-3 text-xs">{w.version}</span>
        <span className="text-xs text-ink-3" title={new Date(w.createdAt).toLocaleString('nl-NL')}>{datum(w.createdAt)}</span>
        <div className="ml-auto flex items-center gap-1">
          <Select value={w.status} onChange={e => run(() => updateWorkItem({ id: w.id, status: e.target.value }))}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <ConfirmButton variant="ghost" confirmLabel="Weg?" onConfirm={() => run(() => deleteWorkItem(w.id))} title="Werk-item verwijderen">×</ConfirmButton>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-3 w-20 shrink-0">Ticket</span>
        <InlineEdit value={w.ticket} placeholder="geen" mono textClass="text-ink"
          onSave={v => run(() => updateWorkItem({ id: w.id, ticket: v }))} />
      </div>
      <div className="flex items-start gap-2 text-xs">
        <span className="text-ink-3 w-20 shrink-0 pt-0.5">Omschrijving</span>
        <div className="min-w-0 flex-1">
          <InlineEdit value={w.note} placeholder="geen" textClass="text-ink-2"
            onSave={v => run(() => updateWorkItem({ id: w.id, description: v }))} />
        </div>
      </div>
    </div>
  )
}

function WerkToevoegen({ versies, onChanged, onError }) {
  const voornaam = useVoornaam()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [vid, setVid] = useState(versies[0]?.id ?? '')
  const [cons, setCons] = useState(voornaam)
  const [note, setNote] = useState('')
  const [ticket, setTicket] = useState('')
  const [status, setStatus] = useState(() => statusBijEnvs(versies[0]?.envs ?? []))

  useEffect(() => { if (!versies.some(v => v.id === vid)) setVid(versies[0]?.id ?? '') }, [versies])

  async function voegToe() {
    if (!cons.trim() || !vid) return
    setBusy(true)
    try {
      await addWorkItem({ modelVersionId: vid, consultant: cons.trim(), description: note.trim(), ticket: ticket.trim(), status })
      setNote(''); setTicket(''); setOpen(false)
      await onChanged()
    } catch (e) { onError(e.message) }
    finally { setBusy(false) }
  }

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)} disabled={versies.length === 0}>+ Werk</Button>
  return (
    <div className="bg-card-2 border border-line/60 rounded-lg px-2.5 py-2 space-y-1.5">
      <Select className="w-full" value={vid} onChange={e => { setVid(e.target.value); setStatus(statusBijEnvs(versies.find(v => v.id === e.target.value)?.envs ?? [])) }}>
        {versies.map(v => <option key={v.id} value={v.id}>versie {v.version}{v.envs.length ? ` (${v.envs.join(', ')})` : ''}</option>)}
      </Select>
      <TextInput placeholder="Consultant" value={cons} onChange={e => setCons(e.target.value)} />
      <TextInput placeholder="Ticket" value={ticket} onChange={e => setTicket(e.target.value)} />
      <TextInput placeholder="Omschrijving (optioneel)" value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex items-center gap-2">
        <Select className="flex-1" value={status} onChange={e => setStatus(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Button variant="primary" disabled={busy || !cons.trim()} onClick={voegToe}>{busy ? 'Opslaan…' : 'Voeg toe'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Annuleer</Button>
      </div>
    </div>
  )
}

// ─── Aanroepen ────────────────────────────────────────────────────────────────
function AanroepenSectie({ d, chainKey, ketens, snap, onChanged, onError, onWijzig, onNieuw }) {
  const eerste = ['TST', 'ACC', 'PROD'].find(e => d.versions[e]) ?? 'TST'
  const [env, setEnv] = useState(eerste)
  const isIface = d.type === 'interface'
  const versieId = d.versionIds[env]

  const kinderen = !isIface && versieId ? snap.callsOf(env, versieId) : []
  const ouders   = !isIface && versieId ? snap.callersOfVersion(versieId, env) : []
  const viaIface = isIface && versieId ? snap.deps.filter(x => x.env === env && x.ifaceVersionId === versieId) : []

  async function verwijder(id) {
    try { await removeDependency(id); await onChanged() }
    catch (e) { onError(e.message) }
  }
  const ketenLabels = (envNaam, parentVersionId) => ketens.ketensVanVersie(envNaam, parentVersionId)
    .map(k => snap.chain(k)?.label ?? k)

  return (
    <Section title="Aanroepen"
      right={
        <div className="flex gap-0.5">
          {ENVS.map(e => (
            <button key={e} onClick={() => setEnv(e)} disabled={!d.versions[e]}
              className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors disabled:opacity-30"
              style={env === e ? { background: ENV[e].bg, color: ENV[e].ink } : { color: 'var(--ink-3)' }}>
              {e}
            </button>
          ))}
        </div>
      }>
      <div className="space-y-3">
        {!versieId && <Leeg>{d.label} draait niet in {env}.</Leeg>}

        {isIface && versieId && (
          <div>
            <div className="text-ink-3 text-xs mb-1">Aanroepen via {d.label} {d.versions[env]} in {env}</div>
            {viaIface.length === 0 && <Leeg>Geen aanroepen via deze interfaceversie in {env}.</Leeg>}
            {viaIface.map(k => (
              <div key={k.id} className="flex items-center gap-1.5 text-xs py-0.5">
                <span className="text-ink-2 truncate">{k.parentName}</span>
                <span className="font-mono text-ink-3">{k.parentVersion}</span>
                <span className="text-ink-3">→</span>
                <span className="text-ink truncate">{k.childName}</span>
                <span className="font-mono text-ink-2">{k.childVersion}</span>
                <span className="ml-auto"><ConfirmButton confirmLabel={`Weg uit ${env}?`} onConfirm={() => verwijder(k.id)}>Verwijder</ConfirmButton></span>
              </div>
            ))}
          </div>
        )}

        {!isIface && versieId && (
          <>
            <div>
              <div className="text-ink-3 text-xs mb-1">{d.label} {d.versions[env]} roept aan</div>
              {kinderen.length === 0 && <Leeg>Niets. {d.isWortel ? 'Leg hieronder vast wat het hoofdmodel aanroept.' : ''}</Leeg>}
              <div className="space-y-1.5">
                {kinderen.map(k => (
                  <div key={k.id} className="bg-card-2 border border-line/60 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-ink flex-1 min-w-0 truncate">{k.childName}</span>
                      <span className="font-mono text-ink shrink-0">{k.childVersion}</span>
                      {k.ontbreekt && <span className="text-del" title="Deze versie kwam niet voor in de eCon-export">⚠</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      <span className="text-ink-3">via</span>
                      <span className="text-mov">{k.ifaceName}</span>
                      <span className="font-mono text-ink-3">{k.ifaceVersion}</span>
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" onClick={() => onWijzig(env, k)}>Wijzig</Button>
                        <ConfirmButton confirmLabel={`Weg uit ${env}?`} onConfirm={() => verwijder(k.id)}>Verwijder</ConfirmButton>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="ghost" className="mt-1.5" onClick={() => onNieuw(env)}>+ Aanroep toevoegen</Button>
            </div>

            <div>
              <div className="text-ink-3 text-xs mb-1">Wordt in {env} aangeroepen door</div>
              {ouders.length === 0 && <Leeg>{d.isWortel ? 'Niemand: dit is het hoofdmodel.' : `Niemand roept ${d.versions[env]} aan in ${env}.`}</Leeg>}
              {ouders.map(o => {
                const labels = ketenLabels(env, o.parentVersionId)
                return (
                  <div key={o.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="text-ink-3">↑</span>
                    <span className="text-ink-2 truncate">{o.parentName}</span>
                    <span className="font-mono text-ink-3">{o.parentVersion}</span>
                    <span className="text-ink-3 truncate" title={labels.join(', ')}>
                      {labels.length ? `· ${labels.join(', ')}` : '· niet in een keten in gebruik'}
                    </span>
                    <span className="ml-auto"><ConfirmButton confirmLabel={`Weg uit ${env}?`} onConfirm={() => verwijder(o.id)}>Verwijder</ConfirmButton></span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Section>
  )
}

// ─── Waar gebruikt: alle aanroepers, over alle ketens en omgevingen ───────────
function WaarGebruikt({ d, snap, ketens, chainKey, ga }) {
  const alle = snap.callersOf(d.modelId)
  if (alle.length === 0) return null
  const perVersie = {}
  for (const x of alle) {
    const k = x.childVersion
    const p = (perVersie[k] ??= {})
    const key = `${x.parentModelId}|${x.parentVersion}`
    ;(p[key] ??= { parent: `${x.parentName} ${x.parentVersion}`, parentModelId: x.parentModelId, envs: new Set(), ketens: new Set() }).envs.add(x.env)
    for (const kk of ketens.ketensVanVersie(x.env, x.parentVersionId)) p[key].ketens.add(kk)
  }
  const versies = Object.keys(perVersie).sort((a, b) => (vergelijk(b, a) ?? 0))
  return (
    <Section title="Waar gebruikt" collapsible defaultOpen={false} count={versies.length}>
      <div className="space-y-2">
        {versies.map(v => (
          <div key={v}>
            <div className="text-xs mb-0.5"><span className="font-mono text-ink">{v}</span> <span className="text-ink-3">wordt aangeroepen door</span></div>
            {Object.values(perVersie[v]).map(p => (
              <div key={p.parent} className="flex items-center gap-2 text-xs py-0.5 pl-2">
                <span className="text-ink-2 truncate">{p.parent}</span>
                <span className="flex gap-0.5">{ENVS.filter(e => p.envs.has(e)).map(e => <EnvChip key={e} env={e} />)}</span>
                <span className="ml-auto flex gap-1 flex-wrap justify-end">
                  {[...p.ketens].length === 0 && <span className="text-ink-3">niet in een keten</span>}
                  {[...p.ketens].map(k => (
                    <button key={k} onClick={() => ga({ tab: 'ketens', keten: k, model: d.modelId })}
                      className={`text-xs hover:underline ${k === chainKey ? 'text-ink-3' : 'text-mov'}`}>
                      {snap.chain(k)?.label ?? k}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─── Releases van dit model ───────────────────────────────────────────────────
function ReleasesSectie({ d, snap, onTerug }) {
  const mijn = snap.releases.filter(r => r.versions.some(v => v.modelId === d.modelId) || r.deps.some(k => k.childModelId === d.modelId))
  if (mijn.length === 0) return null
  const nieuwstePerEnv = {}
  for (const r of mijn) if (!r.rolledBackAt && !nieuwstePerEnv[r.env]) nieuwstePerEnv[r.env] = r.id
  return (
    <Section title="Releases" count={mijn.length} collapsible defaultOpen>
      <div className="space-y-1">
        {mijn.slice(0, 6).map(r => {
          const dep = r.versions.find(v => v.role === 'DEPLOYED' && v.modelId === d.modelId)
          const rep = r.versions.find(v => v.role === 'REPLACED' && v.modelId === d.modelId)
          const aan = r.deps.find(k => k.childModelId === d.modelId)
          const terug = r.rolledBackAt
          return (
            <div key={r.id} className={`flex items-center gap-2 bg-card-2 border border-line/60 rounded-lg px-2.5 py-1.5 ${terug ? 'opacity-60' : ''}`}
              title={terug ? `Teruggedraaid ${datum(r.rolledBackAt, true)} door ${r.rolledBackBy ?? '?'}: ${r.rollbackReason ?? ''}` : `${r.ticket ?? ''} · ${r.testedBy ?? ''} · door ${r.deployedBy ?? '?'}`}>
              <span className="text-xs font-bold shrink-0" style={{ color: ENV[r.env]?.ink }}>{r.env}</span>
              <span className={`font-mono text-xs ${terug ? 'line-through text-ink-3' : 'text-ink'}`}>
                {(rep?.version ?? aan?.oldVersion) ? <><span className="text-ink-3 line-through">{rep?.version ?? aan?.oldVersion}</span> → </> : null}
                {dep?.version ?? aan?.newVersion}
              </span>
              {r.ticket && <span className="font-mono text-ink-3 text-xs truncate">{r.ticket}</span>}
              {terug && <span className="text-xs text-ink-3">teruggedraaid</span>}
              <span className="text-ink-3 text-xs ml-auto shrink-0">{datum(r.deployedAt)}</span>
              {nieuwstePerEnv[r.env] === r.id && (
                <Button variant="ghost" onClick={() => onTerug(r)}>Terug</Button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-ink-3 text-xs mt-1.5">Alleen de laatste release per omgeving is terug te draaien.</p>
    </Section>
  )
}

// ─── Alle versies ─────────────────────────────────────────────────────────────
function VersiesSectie({ d, snap, onVerwijder }) {
  const rows = snap.versionsOf(d.modelId)
  const hier = new Set(Object.values(d.versionIds).filter(Boolean))
  return (
    <Section title="Alle versies" count={rows.length} collapsible defaultOpen={false}>
      {rows.length === 0 && <Leeg>Nog geen versies</Leeg>}
      <div className="space-y-1.5">
        {rows.map(mv => {
          const envs = snap.presentEnvs(mv.id)
          const aanroepers = snap.callersOfVersion(mv.id)
          const werk = snap.workOf(mv.id)
          return (
            <div key={mv.id} className={`text-xs rounded-lg px-2 py-1.5 border ${hier.has(mv.id) ? 'border-line bg-card-2' : 'border-line/40'}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-ink">{mv.version}</span>
                <span className="flex gap-0.5">{envs.map(e => <EnvChip key={e} env={e} />)}</span>
                {hier.has(mv.id) && <span className="text-ink-3">in deze keten</span>}
                <span className="ml-auto text-ink-3" title={mv.createdBy ? `door ${mv.createdBy}` : ''}>{datum(mv.createdAt)}</span>
                <ConfirmButton variant="ghost" confirmLabel="Verwijderen?" onConfirm={() => onVerwijder(mv.id)}>Verwijder</ConfirmButton>
              </div>
              <div className="text-ink-3 mt-0.5">
                {aanroepers.length === 0 ? 'Wordt nergens aangeroepen' : `${aanroepers.length} aanroep${aanroepers.length === 1 ? '' : 'en'}`}
                {werk.length > 0 && ` · ${werk.length} werk-item${werk.length === 1 ? '' : 's'}`}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function DetailPanel({ node, graaf, chainKey, ga, onClose }) {
  const { snap, ketens, refresh } = useSnapshot()
  const toast = useToast()
  const { width, onMouseDown } = useResizableWidth()
  const [err, setErr] = useState(null)
  const [dialoog, setDialoog] = useState(null)   // { soort, ... }

  const d = node.data
  const isModel = d.type === 'model'
  const { label: statusLabel, familie: statusFamilie } = statusSamenvatting(d.versions)
  const richting = promotieRichtingen(d)
  const kanPromoveren = richting.ACC || richting.PROD

  async function handleChanged() {
    setErr(null)
    await refresh()
  }

  // Werk aan de versies die deze node draait; "+ Werk" biedt die versies aan
  const versiesHier = useMemo(() => {
    const gezien = new Set()
    return ['TST', 'ACC', 'PROD'].flatMap(e => {
      const id = d.versionIds[e]
      if (!id || gezien.has(id)) return []
      gezien.add(id)
      return [{ id, version: d.versions[e], envs: snap.presentEnvs(id) }]
    })
  }, [d, snap])

  // Esc sluit het paneel als er geen dialoog open is
  useEffect(() => {
    function opToets(e) { if (e.key === 'Escape' && !dialoog) onClose() }
    document.addEventListener('keydown', opToets)
    return () => document.removeEventListener('keydown', opToets)
  }, [dialoog, onClose])

  const sharedLabels = d.sharedIn ?? []

  return (
    <aside className="relative bg-card border-l border-line flex flex-col overflow-hidden shrink-0" style={{ width }}>
      <div onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/40 z-20 transition-colors"
        title="Sleep om de breedte aan te passen" />

      {/* Kop */}
      <header className="px-4 pt-3 pb-3 border-b border-line bg-card">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {isModel ? (
              <InlineEdit value={d.label} textClass="text-ink font-bold text-sm"
                onSave={async next => {
                  if (!next) return
                  try { await updateModel({ modelId: d.modelId, name: next }); await handleChanged() }
                  catch (e) { setErr(e.message) }
                }} />
            ) : (
              <div className="text-ink font-bold text-sm leading-snug break-words">{d.label}</div>
            )}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <Chip familie={statusFamilie}>{statusLabel}</Chip>
              <span className="text-meta text-xs">{d.isWortel ? 'Hoofdmodel' : isModel ? 'Submodel' : 'Interface'}</span>
              {sharedLabels.length > 0 && (
                <Chip familie={VIOLET} title={`Ook gebruikt in: ${sharedLabels.join(', ')}`}>⧉ {sharedLabels.length} andere keten{sharedLabels.length === 1 ? '' : 's'}</Chip>
              )}
              {d.variants > 1 && <Chip familie={VIOLET} title="Dit model hangt in deze keten op meerdere versies">×{d.variants} in deze keten</Chip>}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-xl leading-none transition-colors shrink-0" title="Sluiten (Esc)">×</button>
        </div>
        {/* Opmerking bij het model: hier moet iets mee */}
        <div className="mt-2 text-xs">
          <InlineEdit value={d.notes} multiline placeholder="Opmerking toevoegen…" textClass="text-ink-2 leading-relaxed"
            onSave={async next => {
              try { await updateModel({ modelId: d.modelId, notes: next }); await handleChanged() }
              catch (e) { setErr(e.message) }
            }} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {err && <Banner ok={false} onClose={() => setErr(null)}>{err}</Banner>}

        <Section title="Waar draait het">
          <div className="bg-page rounded-lg border border-line/50 overflow-hidden">
            {ENVS.map(naam => (
              <EnvRow key={naam} env={naam} version={d.versions[naam]} versionId={d.versionIds[naam]} snap={snap}
                status={naam === 'PROD' ? null : versieStatus(d.versions[naam], d.versions.PROD)}
                mistExport={d.ontbreekt?.includes(naam)} />
            ))}
          </div>
          <KetenSamenvatting versions={d.versions} isWortel={d.isWortel} />
          {d.ontbreekt?.length > 0 && (
            <div className="mt-2"><Banner ok={false}>⚠ Deze versie wordt wel aangeroepen maar kwam niet voor in de eCon-export van {d.ontbreekt.join(' en ')}.</Banner></div>
          )}
        </Section>

        {isModel && (
          <Section title="Acties">
            <div className="grid grid-cols-1 gap-1.5">
              <Button variant="primary" onClick={() => setDialoog({ soort: 'registreer' })}>Nieuwe versie registreren in TST</Button>
              <Button variant="green" disabled={!kanPromoveren} onClick={() => setDialoog({ soort: 'promoveer' })}
                title={kanPromoveren ? '' : 'TST, ACC en PROD draaien al dezelfde versie'}>
                {richting.ACC ? `Promoveren ${d.versions.TST} naar ACC` : richting.PROD ? `Promoveren ${d.versions.ACC} naar PROD` : 'Promoveren (alles gelijk)'}
              </Button>
              {richting.ACC && richting.PROD && (
                <Button variant="outline" onClick={() => setDialoog({ soort: 'promoveer', doel: 'PROD' })}>Promoveren {d.versions.ACC} naar PROD</Button>
              )}
              <Button variant="outline" disabled={!ENVS.some(e => d.versionIds[e])} onClick={() => setDialoog({ soort: 'aanroep', env: ['TST', 'ACC', 'PROD'].find(e => d.versionIds[e]) })}>
                Aanroep toevoegen
              </Button>
            </div>
          </Section>
        )}

        {isModel && (
          <Section title="Werk" count={d.werk.length}>
            <div className="space-y-1.5">
              {d.werk.length === 0 && <Leeg>Geen werk aan de versies die hier draaien.</Leeg>}
              {d.werk.map(w => <WerkRegel key={w.id} w={w} onChanged={handleChanged} onError={setErr} />)}
              <WerkToevoegen versies={versiesHier} onChanged={handleChanged} onError={setErr} />
            </div>
          </Section>
        )}

        <AanroepenSectie d={d} chainKey={chainKey} ketens={ketens} snap={snap} onChanged={handleChanged} onError={setErr}
          onWijzig={(env, dep) => setDialoog({ soort: 'aanroep', env, bestaand: dep })}
          onNieuw={env => setDialoog({ soort: 'aanroep', env })} />

        {isModel && <WaarGebruikt d={d} snap={snap} ketens={ketens} chainKey={chainKey} ga={ga} />}

        {isModel && <ReleasesSectie d={d} snap={snap} onTerug={r => setDialoog({ soort: 'terug', release: r })} />}

        <VersiesSectie d={d} snap={snap} onVerwijder={id => setDialoog({ soort: 'verwijder', versionId: id })} />
      </div>

      {dialoog?.soort === 'registreer' && <RegistreerDialoog node={d} chainKey={chainKey} onClose={() => setDialoog(null)} />}
      {dialoog?.soort === 'promoveer' && <PromoveerDialoog node={d} graaf={graaf} chainKey={chainKey} standaardDoel={dialoog.doel} onClose={() => setDialoog(null)} />}
      {dialoog?.soort === 'aanroep'   && <AanroepDialoog parentNode={d} standaardEnv={dialoog.env} bestaand={dialoog.bestaand} onClose={() => setDialoog(null)} />}
      {dialoog?.soort === 'terug'     && <TerugdraaiDialoog release={dialoog.release} onClose={() => setDialoog(null)} />}
      {dialoog?.soort === 'verwijder' && <VerwijderDialoog versionId={dialoog.versionId} onClose={() => setDialoog(null)} />}
    </aside>
  )
}
