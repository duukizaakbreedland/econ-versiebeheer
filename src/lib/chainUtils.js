// De keten zoals hij werkelijk draait, afgeleid uit de aanroepen.
//
// Een keten is een hoofdmodel. Per omgeving draait dat hoofdmodel op zijn
// actuele versie; elk model daaronder draait op de versie waarmee zijn ouder
// hem aanroept (de koppelingen, per omgeving en per ouderversie). We lopen per
// omgeving elk pad vanaf het hoofdmodel af en voegen daarna samen wat in alle
// omgevingen op dezelfde versies uitkomt. Een model dat binnen één keten op
// verschillende versies wordt aangeroepen (zes subdorpels roepen Profielmodel
// aan, niet allemaal dezelfde versie) krijgt per versie een eigen node, zodat
// je ziet wie waaraan hangt. Wordt overal dezelfde versie aangeroepen, dan is
// het één gedeelde node met meerdere pijlen.

import { ORANJE, GEEL, VIOLET, GROEN, BLAUW, GRIJS } from './kleuren.js'
import { vergelijkVersies } from './versies.js'
import { ENVS } from './snapshot.js'

export { ENVS }
export { vergelijkVersies }

// ─── Versie ten opzichte van PROD ─────────────────────────────────────────────
export function versieStatus(versie, prodVersie) {
  if (!versie || !prodVersie) return 'onbekend'
  const v = vergelijkVersies(versie, prodVersie)
  if (v === 0)  return 'gelijk'
  if (v === 1)  return 'voor'
  if (v === -1) return 'achter'
  return 'anders'
}

export const STATUS_TEKEN = { voor: '↑', achter: '↓', anders: '≠' }

// Samenvatting voor de kop van het detailpaneel
export function statusSamenvatting(versions) {
  const aanwezig = ENVS.filter(e => versions[e])
  if (aanwezig.length === 0) return { label: 'Draait nergens', familie: ORANJE }
  if (!versions.PROD) return { label: `Alleen in ${aanwezig.join(' en ')}`, familie: GEEL }
  const acc = versieStatus(versions.ACC, versions.PROD)
  const tst = versieStatus(versions.TST, versions.PROD)
  if ([acc, tst].includes('achter')) return { label: 'Loopt achter op PROD', familie: ORANJE }
  if ([acc, tst].includes('voor'))   return { label: 'Loopt voor op PROD',   familie: GEEL }
  if ([acc, tst].includes('anders')) return { label: 'Wijkt af van PROD',    familie: VIOLET }
  if (aanwezig.length < 3) return { label: `Niet in ${ENVS.filter(e => !versions[e]).join(' en ')}`, familie: GEEL }
  return { label: 'Gelijk in alle omgevingen', familie: GROEN }
}

// ─── De graaf van één keten ───────────────────────────────────────────────────
const MAX_PADEN = 5000

export function ketenGraaf(chain, snap) {
  const root = snap.model(chain.rootModelId)
  if (!root) return { nodes: [], edges: [], bereikbaar: new Set() }

  // Elk pad door de keten, met per omgeving de versie op dat pad
  const paden = new Map()
  const leg = (pad, model, ouderPad, env, versie, versieId, ontbreekt, viaIface) => {
    let p = paden.get(pad)
    if (!p) {
      p = { model, ouderPad, versions: {}, versionIds: {}, ontbreekt: new Set(), kindPad: null, viaIface }
      paden.set(pad, p)
    }
    p.versions[env]   = versie
    p.versionIds[env] = versieId
    if (ontbreekt) p.ontbreekt.add(env)
    return p
  }

  const bereikbaar = new Set()   // 'ENV|versionId' van alles wat in deze keten draait
  let teGroot = false

  for (const env of ENVS) {
    const start = snap.current(root.id, env)
    if (!start) continue
    leg(root.id, root, null, env, start.version, start.versionId, false, null)
    bereikbaar.add(`${env}|${start.versionId}`)
    const stapel = [{ pad: root.id, versieId: start.versionId, voorouders: [root.id] }]

    while (stapel.length) {
      const { pad, versieId, voorouders } = stapel.pop()
      for (const d of snap.callsOf(env, versieId)) {
        const iface = snap.model(d.ifaceModelId)
        const kind  = snap.model(d.childModelId)
        if (!kind || voorouders.includes(kind.id)) continue
        if (paden.size > MAX_PADEN) { teGroot = true; break }

        let ouder = pad
        if (iface) {
          ouder = `${pad}>${iface.id}~${kind.id}`
          leg(ouder, iface, pad, env, d.ifaceVersion, d.ifaceVersionId, false, null).kindPad = `${ouder}>${kind.id}`
          bereikbaar.add(`${env}|${d.ifaceVersionId}`)
        }
        const kindPad = `${ouder}>${kind.id}`
        leg(kindPad, kind, ouder, env, d.childVersion, d.childVersionId, d.ontbreekt, iface ? ouder : null)
        bereikbaar.add(`${env}|${d.childVersionId}`)
        stapel.push({ pad: kindPad, versieId: d.childVersionId, voorouders: [...voorouders, kind.id] })
      }
      if (teGroot) break
    }
  }
  if (!paden.has(root.id)) {
    // Hoofdmodel draait nergens: toon alleen het hoofdmodel, zonder versies
    return {
      nodes: [maakNode(root, root.id, {}, {}, [], true, snap)],
      edges: [], bereikbaar,
    }
  }

  // Samenvoegen op model + versies (en voor een interface: + waar hij heen leidt)
  const vector = v => ENVS.map(e => v[e] ?? '-').join('/')
  const handtekening = p => {
    const eigen = `${p.model.id}@${vector(p.versions)}`
    const kind  = p.kindPad && paden.get(p.kindPad)
    return kind ? `${eigen}>${kind.model.id}@${vector(kind.versions)}` : eigen
  }

  const groepen = new Map()      // handtekening -> variant
  const groepVanPad = new Map()  // pad -> handtekening
  for (const [pad, p] of paden) {
    const h = handtekening(p)
    groepVanPad.set(pad, h)
    if (!groepen.has(h)) {
      groepen.set(h, { model: p.model, versions: { ...p.versions }, versionIds: { ...p.versionIds }, ontbreekt: new Set() })
    }
    p.ontbreekt.forEach(e => groepen.get(h).ontbreekt.add(e))
  }

  // Een model met maar één variant houdt zijn model-id; anders krijgt elke
  // variant zijn versies erbij, zodat de id stabiel blijft tussen laden door.
  const varianten = {}
  for (const g of groepen.values()) varianten[g.model.id] = (varianten[g.model.id] ?? 0) + 1
  const idVan = {}
  for (const [h, g] of groepen) idVan[h] = varianten[g.model.id] > 1 ? h : g.model.id

  const nodes = [...groepen].map(([h, g]) =>
    maakNode(g.model, idVan[h], g.versions, g.versionIds, ENVS.filter(e => g.ontbreekt.has(e)), g.model.id === root.id, snap))

  const edges = []
  const gezien = new Set()
  for (const [pad, p] of paden) {
    if (!p.ouderPad) continue
    const source = idVan[groepVanPad.get(p.ouderPad)]
    const target = idVan[groepVanPad.get(pad)]
    const k = `${source}->${target}`
    if (!gezien.has(k)) { gezien.add(k); edges.push({ source, target }) }
  }

  // Wie roept elke node aan: ouder-modelnodes (over de interface heen) met de interface ertussen
  const perId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const inkomend = {}
  for (const e of edges) (inkomend[e.target] ??= []).push(e.source)
  for (const n of nodes) {
    n.parentLinks = []
    for (const bronId of inkomend[n.id] ?? []) {
      const bron = perId[bronId]
      if (!bron) continue
      if (bron.type === 'interface') {
        for (const ouderId of inkomend[bronId] ?? []) {
          if (perId[ouderId]) n.parentLinks.push({ parent: perId[ouderId], iface: bron })
        }
      } else {
        n.parentLinks.push({ parent: bron, iface: null })
      }
    }
    n.variants = varianten[n.modelId] ?? 1
  }

  return { nodes, edges, bereikbaar, teGroot }
}

function maakNode(model, id, versions, versionIds, ontbreekt, isWortel, snap) {
  // Werk aan de versies die deze node draait: lopend werk eerst, dan afgerond
  const werk = []
  const gezien = new Set()
  for (const env of ENVS) {
    const vid = versionIds[env]
    if (!vid) continue
    for (const w of snap.workOf(vid)) {
      if (gezien.has(w.id)) continue
      gezien.add(w.id)
      werk.push({ ...w, env })
    }
  }
  werk.sort((a, b) => (a.status === 'DONE') - (b.status === 'DONE') || new Date(b.createdAt) - new Date(a.createdAt))
  return {
    id,
    nodeKey:  model.id,
    modelId:  model.id,
    type:     model.type === 'INTERFACE' ? 'interface' : 'model',
    label:    model.name,
    notes:    model.notes,
    versions, versionIds, ontbreekt, isWortel,
    werk,
    openWerk: werk.filter(w => w.status !== 'DONE'),
    parentLinks: [],
    variants: 1,
  }
}

// ─── Status van een keten ─────────────────────────────────────────────────────
// In ontwikkeling: TST wijkt af van ACC. Klaar voor PROD: ACC wijkt af van PROD
// terwijl TST gelijk is aan ACC. Beide open: beide soorten verschil komen voor.
// Een omgeving waar het hoofdmodel niet draait telt niet mee als verschil.
export const STATUS_CFG = {
  STABIEL:         { label: 'Stabiel',          familie: GROEN,  uitleg: 'Overal dezelfde versies' },
  IN_ONTWIKKELING: { label: 'In ontwikkeling',  familie: GEEL,   uitleg: 'TST wijkt af van ACC' },
  KLAAR_VOOR_PROD: { label: 'Klaar voor PROD',  familie: BLAUW,  uitleg: 'ACC wijkt af van PROD, TST is gelijk aan ACC' },
  BEIDE_OPEN:      { label: 'Beide open',       familie: ORANJE, uitleg: 'Er staat werk in TST én er wacht iets in ACC op PROD' },
  LEEG:            { label: 'Draait nergens',   familie: GRIJS,  uitleg: 'Het hoofdmodel heeft in geen enkele omgeving een versie' },
}

function verschilt(a, b) {
  return (a ?? null) !== (b ?? null)
}

export function chainStats(chain, graaf, snap) {
  const root = graaf.nodes.find(n => n.isWortel)
  const rootIn = env => Boolean(snap.current(chain.rootModelId, env))
  const nietIn = ENVS.filter(e => !rootIn(e))

  // Draait de keten wel in a maar niet in b, dan verschilt alles
  const afwijkend = (a, b) => [...new Set(graaf.nodes
    .filter(n => rootIn(a) && verschilt(n.versions[a], n.versions[b]))
    .map(n => n.modelId))]
  const tstAfwijkend = afwijkend('TST', 'ACC')
  const accAfwijkend = afwijkend('ACC', 'PROD')

  let status = 'STABIEL'
  if (tstAfwijkend.length && accAfwijkend.length) status = 'BEIDE_OPEN'
  else if (accAfwijkend.length) status = 'KLAAR_VOOR_PROD'
  else if (tstAfwijkend.length) status = 'IN_ONTWIKKELING'
  if (nietIn.length === 3) status = 'LEEG'

  const openWerk = [...new Map(graaf.nodes.flatMap(n => n.openWerk.map(w => [w.id, { ...w, node: n }]))).values()]
  const opmerkingen = [...new Map(graaf.nodes.filter(n => n.notes?.trim())
    .map(n => [n.modelId, { model: n.label, modelId: n.modelId, tekst: n.notes.trim() }])).values()]
  const ontbreekt = graaf.nodes.filter(n => n.ontbreekt.length > 0)
    .map(n => ({ model: n.label, modelId: n.modelId, envs: n.ontbreekt }))

  // Een model dat in dezelfde omgeving op meerdere versies wordt aangeroepen
  // (de oranje regel uit het oude Excel), per model samengevat over de omgevingen
  const perModel = {}
  for (const env of ENVS) {
    const perModelVersies = {}
    for (const n of graaf.nodes) {
      if (n.type !== 'model' || !n.versions[env]) continue
      ;(perModelVersies[n.modelId] ??= new Set()).add(n.versions[env])
    }
    for (const [modelId, set] of Object.entries(perModelVersies)) {
      if (set.size < 2) continue
      const m = (perModel[modelId] ??= { modelId, model: snap.model(modelId)?.name, envs: [], versies: new Set() })
      m.envs.push(env)
      set.forEach(v => m.versies.add(v))
    }
  }
  const meerdereVersies = Object.values(perModel).map(m => ({ ...m, versies: [...m.versies] }))

  return {
    status, cfg: STATUS_CFG[status],
    models: new Set(graaf.nodes.filter(n => n.type === 'model').map(n => n.modelId)).size,
    tstAfwijkend, accAfwijkend, nietIn,
    rootVersions: root?.versions ?? {},
    openWerk, opmerkingen, ontbreekt, meerdereVersies,
  }
}

// ─── Alle ketens tegelijk ─────────────────────────────────────────────────────
// Eén keer per snapshot: de graaf en status per keten, plus waar elke versie en
// elk model draait. Views lezen hieruit in plaats van zelf te rekenen.
export function alleKetens(snap) {
  const perKey = {}
  const ketensVanVersie = {}   // 'ENV|versionId' -> Set(chainKey)
  const ketensVanModel  = {}   // modelId -> Set(chainKey)
  for (const chain of snap.chains) {
    const graaf = ketenGraaf(chain, snap)
    const stats = chainStats(chain, graaf, snap)
    perKey[chain.key] = { chain, graaf, stats }
    for (const k of graaf.bereikbaar) (ketensVanVersie[k] ??= new Set()).add(chain.key)
    for (const n of graaf.nodes) (ketensVanModel[n.modelId] ??= new Set()).add(chain.key)
  }
  return {
    perKey,
    lijst: Object.values(perKey),
    ketensVanVersie: (env, versionId) => [...(ketensVanVersie[`${env}|${versionId}`] ?? [])],
    ketensVanModel:  modelId => [...(ketensVanModel[modelId] ?? [])],
    draaitIn: (env, versionId) => Boolean(ketensVanVersie[`${env}|${versionId}`]),
  }
}

// Welke andere ketens gebruiken dit model ook?
export function gedeeldIn(ketens, modelId, eigenKey) {
  return ketens.ketensVanModel(modelId).filter(k => k !== eigenKey)
}
