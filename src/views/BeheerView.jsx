import { useState, useMemo } from 'react'
import { createChain, updateChain, deleteChain, createModel, updateModel, deleteModel } from '../lib/api.js'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { Banner, InlineEdit, Button, ConfirmButton, TextInput, Select, Spinner, Leeg, EnvChip, useToast } from '../components/ui/index.jsx'
import { ENVS } from '../lib/chainUtils.js'

function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`bg-card border border-line rounded-xl overflow-hidden ${className}`}>
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-line/80">
        <div className="min-w-0">
          <h3 className="text-ink text-xs font-semibold">{title}</h3>
          {subtitle && <p className="text-meta text-xs mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto shrink-0">{right}</div>}
      </header>
      {children}
    </section>
  )
}

function Rij({ children, className = '', ...props }) {
  return (
    <div {...props} className={`group flex items-center gap-3 px-4 py-2 border-b border-line/40 last:border-b-0 hover:bg-hover transition-colors ${className}`}>
      {children}
    </div>
  )
}

function TypeStip({ type }) {
  const isIface = type === 'INTERFACE'
  return (
    <span title={isIface ? 'Interface' : 'Model'} className="shrink-0 rounded-full"
      style={{ width: 7, height: 7, background: isIface ? 'var(--mov-ink)' : 'var(--ink-3)',
               boxShadow: isIface ? '0 0 0 2px var(--mov-bg)' : '0 0 0 2px var(--off-bg)' }} />
  )
}

function Acties({ children }) {
  return <div className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{children}</div>
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60)

// ─── Ketens ───────────────────────────────────────────────────────────────────
function KetenLijst({ snap, ketens, run, ga }) {
  const [open, setOpen] = useState(false)
  const [rootId, setRootId] = useState('')
  const [label, setLabel] = useState('')
  const [nieuwModel, setNieuwModel] = useState('')

  const hoofdmodellen = new Set(snap.chains.map(c => c.rootModelId))
  const kiesbaar = snap.models.filter(m => m.type === 'MODEL' && !hoofdmodellen.has(m.id))

  async function maak() {
    let modelId = rootId
    let naam = snap.model(rootId)?.name
    if (rootId === '__nieuw') {
      const m = await createModel({ name: nieuwModel.trim(), type: 'MODEL', orgId: snap.orgId })
      modelId = m.id; naam = m.name
    }
    await createChain({ key: slug(naam), label: label.trim() || naam, rootModelId: modelId, orgId: snap.orgId })
    setRootId(''); setLabel(''); setNieuwModel(''); setOpen(false)
  }

  return (
    <Card title="Ketens" subtitle="Een keten is een hoofdmodel; alles wat het aanroept hoort erbij"
      right={<Button onClick={() => setOpen(o => !o)}>{open ? 'Annuleer' : '+ Nieuwe keten'}</Button>}>
      {open && (
        <div className="px-4 py-3 bg-card-2 border-b border-line/60 space-y-2">
          <Select className="w-full" value={rootId} onChange={e => setRootId(e.target.value)}>
            <option value="">Hoofdmodel kiezen…</option>
            {kiesbaar.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="__nieuw">Nieuw model aanmaken…</option>
          </Select>
          {rootId === '__nieuw' && <TextInput autoFocus placeholder="Naam van het nieuwe hoofdmodel" value={nieuwModel} onChange={e => setNieuwModel(e.target.value)} />}
          <TextInput placeholder="Weergavenaam (standaard de modelnaam)" value={label} onChange={e => setLabel(e.target.value)} />
          <Button variant="primary" className="w-full" disabled={!rootId || (rootId === '__nieuw' && !nieuwModel.trim())} onClick={() => run(maak)}>
            Keten aanmaken
          </Button>
          <p className="text-ink-3 text-xs">Registreer daarna een versie van het hoofdmodel in de keten, en leg bij Aanroepen vast wat het aanroept.</p>
        </div>
      )}

      {ketens.lijst.length === 0 && <Leeg className="px-4 py-6 text-center">Nog geen ketens.</Leeg>}

      {ketens.lijst.map(({ chain, stats }) => (
        <Rij key={chain.id}>
          <div className="flex-1 min-w-0">
            <InlineEdit value={chain.label} textClass="text-ink text-xs font-semibold"
              onSave={v => v && run(() => updateChain({ id: chain.id, label: v }))} />
            <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-3">
              <span>hoofdmodel <span className="text-ink-2">{snap.model(chain.rootModelId)?.name}</span></span>
              <span className="text-ink-4">·</span>
              <span>{stats.models} modellen</span>
              <span className="flex gap-0.5">{ENVS.filter(e => stats.rootVersions[e]).map(e => <EnvChip key={e} env={e} />)}</span>
            </div>
          </div>
          <Button variant="ghost" onClick={() => ga({ tab: 'ketens', keten: chain.key })}>Bekijk</Button>
          <Acties>
            <ConfirmButton confirmLabel="Keten weg?" onConfirm={() => run(() => deleteChain(chain.id))}
              title="Alleen de keten verdwijnt; modellen, versies en aanroepen blijven bestaan">
              Verwijder
            </ConfirmButton>
          </Acties>
        </Rij>
      ))}
    </Card>
  )
}

// ─── Modellen ─────────────────────────────────────────────────────────────────
function ModelLijst({ snap, ketens, run }) {
  const [zoek, setZoek] = useState('')
  const [open, setOpen] = useState(false)
  const [naam, setNaam] = useState('')
  const [type, setType] = useState('MODEL')
  const [alleenOngebruikt, setAlleenOngebruikt] = useState(false)

  const gebruik = useMemo(() => {
    const m = {}
    for (const model of snap.models) {
      const inKetens = ketens.ketensVanModel(model.id).map(k => snap.chain(k)?.label ?? k)
      const isRoot = snap.chains.some(c => c.rootModelId === model.id)
      const inAanroepen = snap.deps.some(d => d.parentModelId === model.id || d.childModelId === model.id || d.ifaceModelId === model.id)
      m[model.id] = { inKetens, isRoot, inAanroepen, versies: snap.versionsOf(model.id).length }
    }
    return m
  }, [snap, ketens])

  const zichtbaar = snap.models
    .filter(m => m.name.toLowerCase().includes(zoek.toLowerCase()))
    .filter(m => !alleenOngebruikt || (!gebruik[m.id].inAanroepen && !gebruik[m.id].isRoot))
  const ongebruikt = snap.models.filter(m => !gebruik[m.id].inAanroepen && !gebruik[m.id].isRoot).length

  return (
    <Card title="Modellen en interfaces"
      subtitle={`${snap.models.length} in totaal${ongebruikt ? ` · ${ongebruikt} nergens in gebruik` : ''}`}
      right={<Button onClick={() => setOpen(o => !o)}>{open ? 'Annuleer' : '+ Nieuw'}</Button>}>
      {open && (
        <div className="px-4 py-3 bg-card-2 border-b border-line/60 flex items-center gap-2">
          <TextInput autoFocus placeholder="Naam" value={naam} onChange={e => setNaam(e.target.value)} className="flex-1 min-w-0" />
          <Select value={type} onChange={e => setType(e.target.value)}>
            <option value="MODEL">Model</option>
            <option value="INTERFACE">Interface</option>
          </Select>
          <Button variant="primary" disabled={!naam.trim()}
            onClick={() => run(async () => { await createModel({ name: naam.trim(), type, orgId: snap.orgId }); setNaam(''); setOpen(false) })}>
            Maak aan
          </Button>
        </div>
      )}
      <div className="px-4 py-2.5 bg-card-2 border-b border-line/60 flex items-center gap-3">
        <TextInput data-zoekveld placeholder="Zoeken…" value={zoek} onChange={e => setZoek(e.target.value)} className="max-w-xs" />
        <label className="text-xs text-ink-2 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={alleenOngebruikt} onChange={e => setAlleenOngebruikt(e.target.checked)} />
          alleen nergens in gebruik
        </label>
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        {zichtbaar.length === 0 && <Leeg className="px-4 py-6 text-center">Niets gevonden.</Leeg>}
        {zichtbaar.map(m => {
          const g = gebruik[m.id]
          const kanWeg = !g.isRoot && !g.inAanroepen
          return (
            <Rij key={m.id}>
              <TypeStip type={m.type} />
              <div className="flex-1 min-w-0">
                <InlineEdit value={m.name} textClass="text-ink text-xs" onSave={v => v && run(() => updateModel({ modelId: m.id, name: v }))} />
              </div>
              <span className="text-ink-3 text-xs shrink-0 truncate max-w-[18rem] text-right" title={g.inKetens.join(', ')}>
                {g.isRoot ? 'hoofdmodel' : g.inKetens.length ? g.inKetens.join(', ') : g.inAanroepen ? 'in aanroepen, niet in een keten' : 'nergens in gebruik'}
                {g.versies ? ` · ${g.versies} versie${g.versies === 1 ? '' : 's'}` : ''}
              </span>
              <Acties>
                <ConfirmButton confirmLabel="Model + versies weg?" disabled={!kanWeg}
                  title={kanWeg ? '' : 'Dit model is in gebruik en kan niet weg'}
                  onConfirm={() => run(() => deleteModel(m.id))}>
                  Verwijder
                </ConfirmButton>
              </Acties>
            </Rij>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function BeheerView({ ga }) {
  const { snap, ketens, error, refresh } = useSnapshot()
  const toast = useToast()
  const [err, setErr] = useState(null)

  async function run(fn) {
    setErr(null)
    try { await fn(); await refresh() }
    catch (e) { setErr(e.message ?? 'Onbekende fout') }
  }

  if (!snap || !ketens) return error ? <div className="p-6"><Banner ok={false}>{error}</Banner></div> : <Spinner />

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div>
          <h2 className="text-ink font-semibold text-sm">Beheer</h2>
          <p className="text-meta text-xs mt-0.5">
            Welke ketens er zijn (elk met zijn hoofdmodel) en welke modellen en interfaces de tool kent.
            Versies, aanroepen en promoties beheer je in de keten zelf.
          </p>
        </div>
        {err && <Banner ok={false} onClose={() => setErr(null)}>{err}</Banner>}
        <KetenLijst snap={snap} ketens={ketens} run={run} ga={ga} />
        <ModelLijst snap={snap} ketens={ketens} run={run} />
      </div>
    </div>
  )
}
