import { useState, useEffect, useMemo } from 'react'
import {
  fetchChainsAdmin, fetchModels, createChain, updateChain, deleteChain,
  createModel, updateModel, deleteModel, addChainNode, removeChainNode,
  addChainEdge, removeChainEdge,
} from '../lib/api.js'
import { Banner, InlineEdit, Button, ConfirmButton, TextInput, Select } from '../components/ui/index.jsx'

// ─── Bouwstenen ───────────────────────────────────────────────────────────────
function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden ${className}`}>
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/80">
        <div className="min-w-0">
          <h3 className="text-slate-200 text-xs font-semibold">{title}</h3>
          {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto shrink-0">{right}</div>}
      </header>
      {children}
    </section>
  )
}

function Rij({ children, className = '', ...props }) {
  return (
    <div {...props}
      className={`group flex items-center gap-3 px-4 py-2 border-b border-slate-700/40 last:border-b-0
                  hover:bg-slate-700/25 transition-colors ${className}`}>
      {children}
    </div>
  )
}

function Leeg({ children }) {
  return <div className="px-4 py-6 text-center text-slate-600 text-xs">{children}</div>
}

function TypeStip({ type }) {
  const isIface = type === 'INTERFACE'
  return (
    <span title={isIface ? 'Interface' : 'Model'}
      className="shrink-0 rounded-full"
      style={{
        width: 7, height: 7,
        background: isIface ? '#3b82f6' : '#64748b',
        boxShadow: isIface ? '0 0 0 2px #3b82f625' : '0 0 0 2px #64748b25',
      }} />
  )
}

// Acties die pas verschijnen als je over de rij zweeft
function Acties({ children }) {
  return (
    <div className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      {children}
    </div>
  )
}

// ─── Ketens ───────────────────────────────────────────────────────────────────
function KetenLijst({ chains, selectedId, onSelect, run }) {
  const [open,  setOpen]  = useState(false)
  const [key,   setKey]   = useState('')
  const [label, setLabel] = useState('')

  return (
    <Card title="Ketens" subtitle={`${chains.length} in totaal`}
      right={<Button onClick={() => setOpen(o => !o)}>{open ? 'Annuleer' : '+ Nieuw'}</Button>}>

      {open && (
        <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-700/60 space-y-2">
          <TextInput autoFocus placeholder="Weergavenaam" value={label} onChange={e => setLabel(e.target.value)} />
          <TextInput placeholder="sleutel (kleine letters)" value={key} onChange={e => setKey(e.target.value)} />
          <Button variant="primary" className="w-full" disabled={!key.trim() || !label.trim()}
            onClick={() => run(async () => {
              await createChain({ key: key.trim().toLowerCase(), label: label.trim() })
              setKey(''); setLabel(''); setOpen(false)
            })}>
            Keten aanmaken
          </Button>
        </div>
      )}

      {chains.length === 0 && <Leeg>Nog geen ketens.</Leeg>}

      {chains.map(c => {
        const actief = selectedId === c.id
        return (
          <Rij key={c.id} onClick={() => onSelect(c.id)}
            className={`cursor-pointer ${actief ? 'bg-slate-700/40' : ''}`}
            style={{ boxShadow: actief ? 'inset 2px 0 0 #3b82f6' : 'none' }}>
            <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <InlineEdit value={c.label}
                textClass={`text-xs ${actief ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}
                onSave={v => v && run(() => updateChain({ id: c.id, label: v }))} />
              <div className="flex items-center gap-2 mt-0.5">
                <InlineEdit value={c.key} mono textClass="text-slate-600 text-xs"
                  onSave={v => v && run(() => updateChain({ id: c.id, key: v.toLowerCase() }))} />
                <span className="text-slate-700 text-xs">·</span>
                <span className="text-slate-600 text-xs">{c.chain_nodes.length} nodes</span>
              </div>
            </div>
            <Acties>
              <div onClick={e => e.stopPropagation()}>
                <ConfirmButton confirmLabel="Verwijderen?" onConfirm={() => run(() => deleteChain(c.id))}>
                  Verwijder
                </ConfirmButton>
              </div>
            </Acties>
          </Rij>
        )
      })}
    </Card>
  )
}

// ─── Inhoud van één keten ─────────────────────────────────────────────────────
function KetenInhoud({ chain, models, run }) {
  const [modelId,   setModelId]   = useState('')
  const [maakNieuw, setMaakNieuw] = useState(false)
  const [naam,      setNaam]      = useState('')
  const [type,      setType]      = useState('MODEL')
  const [bron,      setBron]      = useState('')
  const [doel,      setDoel]      = useState('')

  const keys      = chain.chain_nodes.map(n => n.node_key)
  const naamVan   = k => chain.chain_nodes.find(n => n.node_key === k)?.models?.name ?? k
  const gebruikte = new Set(chain.chain_nodes.map(n => n.model_id))
  const kiesbaar  = models.filter(m => !gebruikte.has(m.id))

  return (
    <div className="space-y-4">
      <Card title={chain.label} subtitle="Modellen en interfaces in deze keten">
        {chain.chain_nodes.length === 0 && <Leeg>Nog leeg — voeg hieronder iets toe.</Leeg>}

        {chain.chain_nodes.map(n => (
          <Rij key={n.id}>
            <TypeStip type={n.models?.type} />
            <span className="text-slate-300 text-xs flex-1 min-w-0 truncate">{n.models?.name}</span>
            <span className="font-mono text-slate-600 text-xs shrink-0">{n.node_key}</span>
            <Acties>
              <ConfirmButton confirmLabel="Uit keten halen?"
                onConfirm={() => run(() => removeChainNode({ chainId: chain.id, nodeKey: n.node_key }))}>
                Verwijder
              </ConfirmButton>
            </Acties>
          </Rij>
        ))}

        <div className="px-4 py-2.5 bg-slate-900/40 border-t border-slate-700/60">
          {!maakNieuw ? (
            <div className="flex items-center gap-2">
              <Select value={modelId} onChange={e => setModelId(e.target.value)} className="flex-1 min-w-0">
                <option value="">Bestaand model of interface toevoegen…</option>
                {kiesbaar.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.type === 'INTERFACE' ? '  (interface)' : ''}
                  </option>
                ))}
              </Select>
              <Button variant="primary" disabled={!modelId}
                onClick={() => run(async () => {
                  const m = models.find(x => x.id === modelId)
                  await addChainNode({ chainId: chain.id, modelId: m.id, type: m.type, bestaandeKeys: keys })
                  setModelId('')
                })}>
                Voeg toe
              </Button>
              <button onClick={() => setMaakNieuw(true)}
                className="text-slate-500 hover:text-slate-300 text-xs whitespace-nowrap transition-colors">
                nieuw aanmaken
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <TextInput autoFocus placeholder="Naam van het nieuwe model" value={naam}
                onChange={e => setNaam(e.target.value)} className="flex-1 min-w-0" />
              <Select value={type} onChange={e => setType(e.target.value)}>
                <option value="MODEL">Model</option>
                <option value="INTERFACE">Interface</option>
              </Select>
              <Button variant="primary" disabled={!naam.trim()}
                onClick={() => run(async () => {
                  const m = await createModel({ name: naam.trim(), type })
                  await addChainNode({ chainId: chain.id, modelId: m.id, type: m.type, bestaandeKeys: keys })
                  setNaam(''); setMaakNieuw(false)
                })}>
                Maak en voeg toe
              </Button>
              <button onClick={() => setMaakNieuw(false)}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                terug
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Verbindingen" subtitle="Wie spreekt wie aan">
        {chain.chain_edges.length === 0 && <Leeg>Nog geen verbindingen gelegd.</Leeg>}

        {chain.chain_edges.map(e => (
          <Rij key={e.id}>
            <span className="text-slate-300 text-xs truncate max-w-[40%]">{naamVan(e.source_key)}</span>
            <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span className="text-slate-300 text-xs truncate max-w-[40%]">{naamVan(e.target_key)}</span>
            <Acties>
              <ConfirmButton confirmLabel="Verbinding weg?" onConfirm={() => run(() => removeChainEdge(e.id))}>
                Verwijder
              </ConfirmButton>
            </Acties>
          </Rij>
        ))}

        <div className="px-4 py-2.5 bg-slate-900/40 border-t border-slate-700/60 flex items-center gap-2">
          <Select value={bron} onChange={e => setBron(e.target.value)} className="flex-1 min-w-0">
            <option value="">Van…</option>
            {chain.chain_nodes.map(n => <option key={n.id} value={n.node_key}>{n.models?.name}</option>)}
          </Select>
          <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          <Select value={doel} onChange={e => setDoel(e.target.value)} className="flex-1 min-w-0">
            <option value="">Naar…</option>
            {chain.chain_nodes.map(n => <option key={n.id} value={n.node_key}>{n.models?.name}</option>)}
          </Select>
          <Button variant="primary" disabled={!bron || !doel || bron === doel}
            onClick={() => run(async () => {
              await addChainEdge({ chainId: chain.id, sourceKey: bron, targetKey: doel })
              setBron(''); setDoel('')
            })}>
            Verbind
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Alle modellen ────────────────────────────────────────────────────────────
function ModelLijst({ models, chains, run }) {
  const [zoek, setZoek] = useState('')
  const [open, setOpen] = useState(false)

  const gebruikIn = useMemo(() => {
    const map = {}
    for (const c of chains) {
      for (const n of c.chain_nodes) {
        if (!map[n.model_id]) map[n.model_id] = []
        map[n.model_id].push(c.label)
      }
    }
    return map
  }, [chains])

  const zichtbaar = models.filter(m => m.name.toLowerCase().includes(zoek.toLowerCase()))
  const ongebruikt = models.filter(m => !gebruikIn[m.id]).length

  return (
    <Card
      title="Alle modellen en interfaces"
      subtitle={`${models.length} in totaal${ongebruikt ? ` · ${ongebruikt} niet in gebruik` : ''}`}
      right={<Button onClick={() => setOpen(o => !o)}>{open ? 'Verbergen' : 'Tonen'}</Button>}>

      {open && (
        <>
          <div className="px-4 py-2.5 bg-slate-900/40 border-b border-slate-700/60">
            <TextInput placeholder="Zoeken…" value={zoek} onChange={e => setZoek(e.target.value)} />
          </div>

          <div className="max-h-96 overflow-y-auto">
            {zichtbaar.length === 0 && <Leeg>Niets gevonden.</Leeg>}
            {zichtbaar.map(m => {
              const inKetens = gebruikIn[m.id] ?? []
              return (
                <Rij key={m.id}>
                  <TypeStip type={m.type} />
                  <div className="flex-1 min-w-0">
                    <InlineEdit value={m.name} textClass="text-slate-300 text-xs"
                      onSave={v => v && run(() => updateModel({ modelId: m.id, name: v }))} />
                  </div>
                  <span className="text-slate-600 text-xs shrink-0 truncate max-w-[14rem] text-right"
                    title={inKetens.join(', ')}>
                    {inKetens.length === 0 ? 'niet in gebruik' : inKetens.join(', ')}
                  </span>
                  <Acties>
                    <ConfirmButton confirmLabel="Model + versies weg?" disabled={inKetens.length > 0}
                      onConfirm={() => run(() => deleteModel(m.id))}>
                      Verwijder
                    </ConfirmButton>
                  </Acties>
                </Rij>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function BeheerView({ onRefresh }) {
  const [chains,  setChains]  = useState(null)
  const [models,  setModels]  = useState(null)
  const [selId,   setSelId]   = useState(null)
  const [err,     setErr]     = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [c, m] = await Promise.all([fetchChainsAdmin(), fetchModels()])
    setChains(c)
    setModels(m)
    setSelId(prev => (prev && c.some(x => x.id === prev)) ? prev : (c[0]?.id ?? null))
  }

  useEffect(() => {
    load().catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [])

  async function run(fn) {
    setErr(null)
    try {
      await fn()
      await load()
      await onRefresh?.()
    } catch (e) {
      setErr(e.message ?? 'Onbekende fout')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">Laden…</div>
  }

  const sel = chains?.find(c => c.id === selId)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        <div>
          <h2 className="text-slate-200 font-semibold text-sm">Beheer</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            De structuur: welke ketens er zijn, welke modellen erin zitten en wat aan wat hangt.
            Versies en promoties beheer je in de Dependency Graph.
          </p>
        </div>

        {err && <Banner ok={false} onClose={() => setErr(null)}>{err}</Banner>}

        <div className="grid gap-4 lg:grid-cols-[19rem_1fr] items-start">
          <KetenLijst chains={chains ?? []} selectedId={selId} onSelect={setSelId} run={run} />
          {sel
            ? <KetenInhoud chain={sel} models={models ?? []} run={run} />
            : <Card title="Geen keten geselecteerd"><Leeg>Kies links een keten.</Leeg></Card>}
        </div>

        <ModelLijst models={models ?? []} chains={chains ?? []} run={run} />
      </div>
    </div>
  )
}
