import { useMemo, useState, useEffect } from 'react'
import ActiePreview from './ActiePreview.jsx'
import { TextInput, Select, Veld, Checkbox, EnvChip, useToast } from './ui/index.jsx'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { useVoornaam } from '../lib/auth.jsx'
import { versieVanVandaag } from '../lib/versies.js'
import {
  registerVoorstel, planRegister, planPromotie, planKetenPromotie, extraAanroepers,
  planRollback, planDelete, planKoppeling, promotieRichtingen,
} from '../lib/releasePlan.js'
import {
  registerVersion, applyRelease, rollbackRelease, deleteVersion, setDependency,
} from '../lib/api.js'
import { ENVS } from '../lib/chainUtils.js'
import { ENV } from '../lib/kleuren.js'

// Eén dialoog per actie: bovenin de velden, daaronder live de preview van wat
// er gaat gebeuren. Bevestigen roept de databasefunctie aan, ververst de
// snapshot en meldt het resultaat.

// ─── Registreren ──────────────────────────────────────────────────────────────
export function RegistreerDialoog({ node, chainKey, onClose }) {
  const { snap, ketens, refresh } = useSnapshot()
  const toast = useToast()
  const voornaam = useVoornaam()
  const voorstel = useMemo(() => registerVoorstel({ snap, ketens, node, chainKey }), [snap, ketens, node, chainKey])

  const [version,     setVersion]     = useState(versieVanVandaag)
  const [consultant,  setConsultant]  = useState(voornaam)
  const [ticket,      setTicket]      = useState('')
  const [description, setDescription] = useState('')
  const [erfVanId,    setErfVanId]    = useState(voorstel.erfKandidaten[0] ? `${voorstel.erfKandidaten[0].env}|${voorstel.erfKandidaten[0].versionId}` : '')
  const [callers,     setCallers]     = useState(() => voorstel.callers.map(c => ({ ...c, gekozen: c.standaard })))

  const erfVan = voorstel.erfKandidaten.find(k => `${k.env}|${k.versionId}` === erfVanId) ?? null
  const plan = useMemo(() => planRegister({ snap, node, form: { envId: voorstel.envId, version, consultant, ticket, description, erfVan, callers } }),
    [snap, node, voorstel.envId, version, consultant, ticket, description, erfVan, callers])

  async function bevestig() {
    await registerVersion(plan.params)
    await refresh()
    toast(`${node.label} ${plan.params.version} geregistreerd in TST`)
    onClose()
  }

  const inKeten = callers.filter(c => c.inKeten)
  const elders  = callers.filter(c => !c.inKeten && !c.historisch)
  const hist    = callers.filter(c => c.historisch)
  const zet = (pv, gekozen) => setCallers(cs => cs.map(c => c.parentVersionId === pv ? { ...c, gekozen } : c))

  return (
    <ActiePreview plan={plan} env="TST" bevestigLabel="Registreer in TST" onBevestig={bevestig} onClose={onClose}>
      <div className="space-y-2">
        <Veld label="Versie"><TextInput autoFocus value={version} onChange={e => setVersion(e.target.value)} placeholder="jj.mm.dd" /></Veld>
        <Veld label="Consultant"><TextInput value={consultant} onChange={e => setConsultant(e.target.value)} /></Veld>
        <Veld label="Ticket"><TextInput value={ticket} onChange={e => setTicket(e.target.value)} placeholder="verplicht, bijv. M26100123" /></Veld>
        <Veld label="Omschrijving"><TextInput value={description} onChange={e => setDescription(e.target.value)} placeholder="optioneel" /></Veld>
        {voorstel.erfKandidaten.length > 0 && (
          <Veld label="Aanroepen" hint="De nieuwe versie roept hetzelfde aan als deze versie; pas het daarna aan bij Aanroepen.">
            <Select className="w-full" value={erfVanId} onChange={e => setErfVanId(e.target.value)}>
              {voorstel.erfKandidaten.map(k => (
                <option key={`${k.env}|${k.versionId}`} value={`${k.env}|${k.versionId}`}>overnemen van {k.label} ({k.aantal})</option>
              ))}
              <option value="">niets overnemen</option>
            </Select>
          </Veld>
        )}
        {callers.length > 0 && (
          <Veld label="Aangeroepen door" hint="In TST gaan deze ouders de nieuwe versie aanroepen.">
            <div className="space-y-1">
              {inKeten.map(c => (
                <Checkbox key={c.parentVersionId} checked={c.gekozen} onChange={v => zet(c.parentVersionId, v)}>
                  <span className="text-ink">{c.parentLabel}</span>
                </Checkbox>
              ))}
              {elders.length > 0 && <div className="text-ink-3 text-[11px] pt-1">In andere ketens</div>}
              {elders.map(c => (
                <Checkbox key={c.parentVersionId} checked={c.gekozen} onChange={v => zet(c.parentVersionId, v)}>
                  <span className="text-ink">{c.parentLabel}</span>
                  <span className="text-ink-3"> · {c.ketens.map(k => snap.chain(k)?.label ?? k).join(', ')} · nu {c.huidig}</span>
                </Checkbox>
              ))}
              {hist.length > 0 && <div className="text-ink-3 text-[11px] pt-1">Niet in een keten in gebruik</div>}
              {hist.map(c => (
                <Checkbox key={c.parentVersionId} checked={c.gekozen} onChange={v => zet(c.parentVersionId, v)}>
                  <span className="text-ink-2">{c.parentLabel}</span><span className="text-ink-3"> · nu {c.huidig}</span>
                </Checkbox>
              ))}
            </div>
          </Veld>
        )}
      </div>
    </ActiePreview>
  )
}

// ─── Promoveren (één node, eventueel met alles eronder) ───────────────────────
export function PromoveerDialoog({ node, graaf, chainKey, standaardDoel, onClose }) {
  const { snap, ketens, refresh } = useSnapshot()
  const toast = useToast()
  const richting = promotieRichtingen(node)
  const [target, setTarget] = useState(standaardDoel ?? (richting.ACC ? 'ACC' : 'PROD'))
  const from = target === 'ACC' ? 'TST' : 'ACC'
  const [metOnder, setMetOnder] = useState(false)
  const [ticket, setTicket] = useState('')
  const [testedBy, setTestedBy] = useState('')
  const [extraKeuze, setExtraKeuze] = useState({})

  // Ticket vooringevuld uit het werk aan de versie die gaat
  useEffect(() => {
    const vid = node.versionIds[from]
    const w = vid ? snap.workOf(vid).find(x => x.ticket) : null
    setTicket(t => t || w?.ticket || '')
  }, [from, node, snap])

  const extra = useMemo(() => extraAanroepers({ snap, ketens, node, target, chainKey }), [snap, ketens, node, target, chainKey])
  const gekozenExtra = extra.filter(e => extraKeuze[e.parentVersionId])

  const plan = useMemo(() => planPromotie({ snap, ketens, graaf, chainKey, node, target, metOnderliggende: metOnder, extra: gekozenExtra, ticket, testedBy }),
    [snap, ketens, graaf, chainKey, node, target, metOnder, gekozenExtra, ticket, testedBy])

  async function bevestig() {
    await applyRelease(plan.params)
    await refresh()
    toast(`${node.label} gepromoveerd naar ${target} (${plan.samenvatting})`)
    onClose()
  }

  const heeftOnder = graaf.edges.some(e => e.source === node.id)

  return (
    <ActiePreview plan={plan} env={target} bevestigLabel={`Naar ${target}`} onBevestig={bevestig} onClose={onClose}>
      <div className="space-y-2">
        <Veld label="Richting">
          <div className="flex rounded-lg overflow-hidden border border-line w-fit">
            {['ACC', 'PROD'].map(t => (
              <button key={t} onClick={() => setTarget(t)} disabled={!richting[t]}
                className={`text-xs py-1.5 px-3 font-medium transition-colors disabled:opacity-40 ${target === t ? '' : 'bg-card text-ink-2 hover:text-ink'}`}
                style={target === t ? { background: ENV[t].bg, color: ENV[t].ink } : undefined}>
                {t === 'ACC' ? 'TST → ACC' : 'ACC → PROD'}
              </button>
            ))}
          </div>
        </Veld>
        {heeftOnder && (
          <Veld label="Omvang">
            <Checkbox checked={metOnder} onChange={setMetOnder}>
              Met alle onderliggende modellen (zoals ze in {from} draaien)
            </Checkbox>
          </Veld>
        )}
        <Veld label="Ticket"><TextInput value={ticket} onChange={e => setTicket(e.target.value)} placeholder="verplicht" /></Veld>
        <Veld label="Getest door"><TextInput value={testedBy} onChange={e => setTestedBy(e.target.value)} placeholder="verplicht" /></Veld>
        {!metOnder && extra.length > 0 && (
          <Veld label="Ook aanroepen" hint={`Andere ouders die ${node.label} in ${target} aanroepen. Vink aan om die ook naar de nieuwe versie te zetten.`}>
            <div className="space-y-1">
              {extra.map(e => (
                <Checkbox key={e.parentVersionId} checked={Boolean(extraKeuze[e.parentVersionId])}
                  onChange={v => setExtraKeuze(k => ({ ...k, [e.parentVersionId]: v }))}>
                  <span className={e.historisch ? 'text-ink-2' : 'text-ink'}>{e.parentLabel}</span>
                  <span className="text-ink-3"> · {e.historisch ? 'niet in een keten in gebruik' : e.ketens.map(k => snap.chain(k)?.label ?? k).join(', ')} · nu {e.huidig}</span>
                </Checkbox>
              ))}
            </div>
          </Veld>
        )}
      </div>
    </ActiePreview>
  )
}

// ─── Hele keten promoveren ────────────────────────────────────────────────────
export function KetenPromoveerDialoog({ chainKey, graaf, standaardDoel, onClose }) {
  const { snap, ketens, refresh } = useSnapshot()
  const toast = useToast()
  const [target, setTarget] = useState(standaardDoel ?? 'ACC')
  const [ticket, setTicket] = useState('')
  const [testedBy, setTestedBy] = useState('')

  const plan = useMemo(() => planKetenPromotie({ snap, ketens, graaf, chainKey, target, ticket, testedBy }),
    [snap, ketens, graaf, chainKey, target, ticket, testedBy])

  async function bevestig() {
    await applyRelease(plan.params)
    await refresh()
    toast(`Keten gepromoveerd naar ${target} (${plan.samenvatting})`)
    onClose()
  }

  return (
    <ActiePreview plan={plan} env={target} bevestigLabel={`Naar ${target}`} onBevestig={bevestig} onClose={onClose}>
      <div className="space-y-2">
        <Veld label="Richting">
          <div className="flex rounded-lg overflow-hidden border border-line w-fit">
            {['ACC', 'PROD'].map(t => (
              <button key={t} onClick={() => setTarget(t)}
                className={`text-xs py-1.5 px-3 font-medium transition-colors ${target === t ? '' : 'bg-card text-ink-2 hover:text-ink'}`}
                style={target === t ? { background: ENV[t].bg, color: ENV[t].ink } : undefined}>
                {t === 'ACC' ? 'TST → ACC' : 'ACC → PROD'}
              </button>
            ))}
          </div>
        </Veld>
        <Veld label="Ticket"><TextInput autoFocus value={ticket} onChange={e => setTicket(e.target.value)} placeholder="verplicht" /></Veld>
        <Veld label="Getest door"><TextInput value={testedBy} onChange={e => setTestedBy(e.target.value)} placeholder="verplicht" /></Veld>
      </div>
    </ActiePreview>
  )
}

// ─── Terugdraaien ─────────────────────────────────────────────────────────────
export function TerugdraaiDialoog({ release, onClose }) {
  const { snap, refresh } = useSnapshot()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const plan = useMemo(() => planRollback({ snap, release, reason }), [snap, release, reason])

  async function bevestig() {
    await rollbackRelease(plan.params)
    await refresh()
    toast(`Release naar ${release.env} teruggedraaid`)
    onClose()
  }

  return (
    <ActiePreview plan={plan} env={release.env} bevestigLabel="Draai terug" onBevestig={bevestig} onClose={onClose}>
      <Veld label="Reden"><TextInput autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="verplicht, bijv. fout in stuklijst" /></Veld>
    </ActiePreview>
  )
}

// ─── Versie verwijderen ───────────────────────────────────────────────────────
export function VerwijderDialoog({ versionId, onClose }) {
  const { snap, refresh } = useSnapshot()
  const toast = useToast()
  const plan = useMemo(() => planDelete({ snap, versionId }), [snap, versionId])
  const label = snap.version(versionId)?.label

  async function bevestig() {
    await deleteVersion(versionId)
    await refresh()
    toast(`${label} verwijderd`)
    onClose()
  }

  return <ActiePreview plan={plan} bevestigLabel="Verwijder" onBevestig={bevestig} onClose={onClose} />
}

// ─── Aanroep vastleggen of wijzigen ───────────────────────────────────────────
// parentNode: de node in de graph (met versions per omgeving). bestaand: een
// aanroep om te wijzigen (het submodel ligt dan vast).
export function AanroepDialoog({ parentNode, standaardEnv, bestaand, onClose }) {
  const { snap, refresh } = useSnapshot()
  const toast = useToast()
  const kanIn = e => Boolean(parentNode.versionIds[e])
  const [envs, setEnvs] = useState(() => {
    const eerste = kanIn(standaardEnv) ? standaardEnv : ENVS.slice().reverse().find(kanIn)
    return eerste ? [eerste] : []
  })
  const [childId,     setChildId]     = useState(bestaand?.childModelId ?? '')
  const [ifaceId,     setIfaceId]     = useState(bestaand?.ifaceModelId ?? '')
  const [ifaceVersie, setIfaceVersie] = useState(bestaand?.ifaceVersion ?? '')
  const [childVersie, setChildVersie] = useState(bestaand?.childVersion ?? '')

  const submodellen = snap.models.filter(m => m.type === 'MODEL' && m.id !== parentNode.modelId)
  const interfaces  = snap.models.filter(m => m.type === 'INTERFACE')

  // Nieuw submodel gekozen: neem interface en versies over van een bestaande
  // aanroep ervan (bij voorkeur vanuit dit model), anders de interface "I<naam>"
  function kiesSubmodel(id) {
    setChildId(id)
    const alle = snap.callersOf(id)
    const voorbeeld = alle.find(x => x.parentModelId === parentNode.modelId) ?? alle[0]
    if (voorbeeld) {
      setIfaceId(voorbeeld.ifaceModelId); setIfaceVersie(voorbeeld.ifaceVersion); setChildVersie(voorbeeld.childVersion)
      return
    }
    const naam = snap.model(id)?.name
    const iface = interfaces.find(m => m.name.toLowerCase() === `i${naam}`.toLowerCase())
    setIfaceId(iface?.id ?? ''); setIfaceVersie(''); setChildVersie('')
  }

  const targets = envs.map(e => ({ env: e, parentVersionId: parentNode.versionIds[e], parentVersion: parentNode.versions[e] }))
  const plan = useMemo(() => planKoppeling({ snap, parentNode, targets, ifaceModelId: ifaceId, ifaceVersion: ifaceVersie, childModelId: childId, childVersion: childVersie }),
    [snap, parentNode, envs, ifaceId, ifaceVersie, childId, childVersie])

  async function bevestig() {
    await setDependency(plan.params)
    await refresh()
    toast('Aanroep vastgelegd')
    onClose()
  }

  const childVersies = snap.versionsOf(childId).map(v => v.version)
  const ifaceVersies = snap.versionsOf(ifaceId).map(v => v.version)

  return (
    <ActiePreview plan={plan} env={envs[0]} bevestigLabel="Leg vast" onBevestig={bevestig} onClose={onClose}>
      <div className="space-y-2">
        <Veld label="Omgeving" hint={`De ouder is ${parentNode.label} op de versie die hij daar draait.`}>
          <div className="flex items-center gap-1">
            {ENVS.map(e => {
              const aan = envs.includes(e)
              return (
                <button key={e} disabled={!kanIn(e)}
                  title={kanIn(e) ? `${parentNode.label} ${parentNode.versions[e]}` : `${parentNode.label} draait niet in ${e}`}
                  onClick={() => setEnvs(v => aan ? v.filter(x => x !== e) : [...v, e])}
                  className="px-2 py-1 text-xs font-bold rounded transition-colors disabled:opacity-30"
                  style={aan ? { background: ENV[e].bg, color: ENV[e].ink } : { color: 'var(--ink-3)' }}>
                  {e}{kanIn(e) && <span className="font-mono font-normal ml-1">{parentNode.versions[e]}</span>}
                </button>
              )
            })}
          </div>
        </Veld>
        <Veld label="Submodel">
          {bestaand ? <span className="text-ink text-xs">{bestaand.childName}</span> : (
            <Select className="w-full" value={childId} onChange={e => kiesSubmodel(e.target.value)}>
              <option value="">Kies een model…</option>
              {submodellen.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </Veld>
        <Veld label="Versie">
          <TextInput list="aanroep-childversies" placeholder="bijv. 26.10.15" value={childVersie} onChange={e => setChildVersie(e.target.value)} />
          <datalist id="aanroep-childversies">{childVersies.map(v => <option key={v} value={v} />)}</datalist>
        </Veld>
        <Veld label="Interface">
          <Select className="w-full" value={ifaceId} onChange={e => { setIfaceId(e.target.value); setIfaceVersie('') }}>
            <option value="">Kies een interface…</option>
            {interfaces.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Veld>
        <Veld label="Versie">
          <TextInput list="aanroep-ifaceversies" placeholder="bijv. 25.03.06" value={ifaceVersie} onChange={e => setIfaceVersie(e.target.value)} />
          <datalist id="aanroep-ifaceversies">{ifaceVersies.map(v => <option key={v} value={v} />)}</datalist>
        </Veld>
      </div>
    </ActiePreview>
  )
}

// ─── Werk toevoegen aan een bestaande versie ──────────────────────────────────
export function statusBijEnvs(envs) {
  if (envs.includes('PROD')) return 'DONE'
  if (envs.includes('ACC'))  return 'REVIEW'
  return 'IN_PROGRESS'
}

export { EnvChip }
