// Helpers die afgeleide gegevens uit de ketenstructuur berekenen.
// De ketens zelf komen uit Supabase via fetchChains() in api.js.

import { ORANJE, GEEL, VIOLET, GROEN } from './kleuren.js'

export const ENVS = ['PROD', 'ACC', 'TST']

// Gedeelde submodellen: welke modellen komen in meerdere ketens voor?
export function getSharedModels(chains = {}) {
  const count = {}
  Object.entries(chains).forEach(([chainKey, chain]) => {
    chain.nodes.filter(n => n.type === 'model').forEach(n => {
      if (!count[n.label]) count[n.label] = []
      count[n.label].push(chainKey)
    })
  })
  return Object.fromEntries(
    Object.entries(count).filter(([, cs]) => cs.length > 1)
  )
}

// ─── Versienummers vergelijken ────────────────────────────────────────────────
// Ze zien eruit als jj.mm.dd, soms met een suffix: 25.05.07HF, 21.11.30a.
function ontleed(versie) {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})(.*)$/.exec(versie ?? '')
  return m ? { datum: m[1] + m[2] + m[3], suffix: m[4] } : null
}

// -1 = a ouder, 0 = gelijk, 1 = a nieuwer, null = niet te vergelijken
export function vergelijkVersies(a, b) {
  if (a === b) return 0
  const pa = ontleed(a), pb = ontleed(b)
  if (!pa || !pb) return null
  if (pa.datum !== pb.datum) return pa.datum < pb.datum ? -1 : 1
  if (pa.suffix === pb.suffix) return 0
  return pa.suffix < pb.suffix ? -1 : 1
}

// Hoe verhoudt een omgeving zich tot productie?
export function versieStatus(versie, prodVersie) {
  if (!versie || !prodVersie) return 'onbekend'
  const v = vergelijkVersies(versie, prodVersie)
  if (v === 0)    return 'gelijk'
  if (v === 1)    return 'voor'
  if (v === -1)   return 'achter'
  return 'anders'
}

// Samenvatting voor de kop van het detailpaneel
export function statusSamenvatting(versions) {
  const prod = versions.PROD
  const acc  = versieStatus(versions.ACC, prod)
  const tst  = versieStatus(versions.TST, prod)
  if ([acc, tst].includes('achter')) return { label: 'Loopt achter op PROD', familie: ORANJE }
  if ([acc, tst].includes('voor'))   return { label: 'Loopt voor op PROD',   familie: GEEL }
  if ([acc, tst].includes('anders')) return { label: 'Wijkt af van PROD',    familie: VIOLET }
  return { label: 'Gelijk in alle omgevingen', familie: GROEN }
}

// ─── De keten zoals hij werkelijk wordt aangeroepen ───────────────────────────
// Het hoofdmodel gebruikt zijn eigen versie; elk model daaronder de versie
// waarmee zijn ouder hem aanroept. Dat kan binnen één keten verschillen: zes
// subdorpels roepen allemaal Profielmodel aan, maar niet allemaal dezelfde
// versie. Zo'n model krijgt dan per aangeroepen versie een eigen node, zodat je
// ziet wie waaraan hangt. Wordt overal dezelfde versie aangeroepen, dan blijft
// het één gedeelde node.
//
// We lopen per omgeving elk pad vanaf het hoofdmodel af en voegen daarna samen
// wat in alle omgevingen op dezelfde versies uitkomt. Dat mag: wat een model
// aanroept hangt alleen af van zijn eigen versie, dus de rest van de tak is dan
// ook gelijk. Een interface voegen we pas samen als hij ook naar hetzelfde
// submodel op dezelfde versies leidt, anders lopen twee takken via één blokje.
//
// Geeft { nodes, edges } in de vorm van chain.nodes/chain.edges, met per node
// de versies in deze keten, de omgevingen waar de export die versie miste, en
// nodeKey: de node in de vaste ketenstructuur waar hij een variant van is.
const MAX_PADEN = 5000

export function ketenGraaf(chain, deps = []) {
  const statisch = () => ({
    nodes: chain.nodes.map(n => ({ ...n, nodeKey: n.id, ontbreekt: [] })),
    edges: chain.edges,
  })

  const nodePerModel = {}
  chain.nodes.forEach(n => { nodePerModel[n.modelId] = n })

  const heeftOuder = new Set(chain.edges.map(e => e.target))
  const wortel = chain.nodes.find(n => !heeftOuder.has(n.id))
  if (!wortel) return statisch()

  // Koppelingen gegroepeerd op (omgeving, parentmodel, parentversie)
  const perOuder = {}
  for (const d of deps) {
    const k = `${d.env}|${d.parentModelId}|${d.parentVersion}`
    if (!perOuder[k]) perOuder[k] = []
    perOuder[k].push(d)
  }

  // Elk pad door de keten, met per omgeving de versie op dat pad
  const paden = new Map()
  const leg = (pad, node, ouderPad, env, versie, ontbreekt) => {
    let p = paden.get(pad)
    if (!p) {
      p = { node, ouderPad, versions: {}, ontbreekt: new Set(), kindPad: null }
      paden.set(pad, p)
    }
    p.versions[env] = versie
    if (ontbreekt) p.ontbreekt.add(env)
    return p
  }

  for (const env of ENVS) {
    const start = wortel.versions?.[env]
    if (!start) continue
    leg(wortel.id, wortel, null, env, start, false)
    const stapel = [{ pad: wortel.id, node: wortel, versie: start, voorouders: [wortel.modelId] }]

    while (stapel.length) {
      const { pad, node, versie, voorouders } = stapel.pop()
      for (const d of perOuder[`${env}|${node.modelId}|${versie}`] ?? []) {
        const iface = nodePerModel[d.ifaceModelId]
        const kind  = nodePerModel[d.childModelId]
        if (!kind || !d.childVersion || voorouders.includes(kind.modelId)) continue
        if (paden.size > MAX_PADEN) return statisch()

        let ouder = pad
        if (iface) {
          ouder = `${pad}>${iface.id}~${kind.id}`
          leg(ouder, iface, pad, env, d.ifaceVersion, false).kindPad = `${ouder}>${kind.id}`
        }
        const kindPad = `${ouder}>${kind.id}`
        leg(kindPad, kind, ouder, env, d.childVersion, d.ontbreekt)
        stapel.push({ pad: kindPad, node: kind, versie: d.childVersion, voorouders: [...voorouders, kind.modelId] })
      }
    }
  }
  if (!paden.has(wortel.id)) return statisch()

  // Samenvoegen op model + versies (en voor een interface: + waar hij heen leidt)
  const vector = v => ENVS.map(e => v[e] ?? '-').join('/')
  const handtekening = p => {
    const eigen = `${p.node.id}@${vector(p.versions)}`
    const kind  = p.kindPad && paden.get(p.kindPad)
    return kind ? `${eigen}>${kind.node.id}@${vector(kind.versions)}` : eigen
  }

  const groepen = new Map()      // handtekening -> variant
  const groepVanPad = new Map()  // pad -> handtekening
  for (const [pad, p] of paden) {
    const h = handtekening(p)
    groepVanPad.set(pad, h)
    if (!groepen.has(h)) groepen.set(h, { bron: p.node, versions: { ...p.versions }, ontbreekt: new Set() })
    p.ontbreekt.forEach(e => groepen.get(h).ontbreekt.add(e))
  }

  // Een model met maar één variant houdt gewoon zijn eigen id; anders krijgt
  // elke variant zijn versies erbij, zodat de id stabiel blijft tussen laden door.
  const varianten = {}
  for (const g of groepen.values()) varianten[g.bron.id] = (varianten[g.bron.id] ?? 0) + 1
  const idVan = {}
  for (const [h, g] of groepen) idVan[h] = varianten[g.bron.id] > 1 ? h : g.bron.id

  const nodes = [...groepen].map(([h, g]) => ({
    ...g.bron,
    id:        idVan[h],
    nodeKey:   g.bron.id,
    versions:  g.versions,
    ontbreekt: ENVS.filter(e => g.ontbreekt.has(e)),
    // Werk hangt aan de TST-versie van het model; alleen tonen bij de variant die die draait
    workItem:  g.versions.TST && g.versions.TST === g.bron.versions?.TST ? g.bron.workItem : undefined,
  }))

  const edges = []
  const gezien = new Set()
  const verbind = (source, target) => {
    const k = `${source}->${target}`
    if (!gezien.has(k)) { gezien.add(k); edges.push({ source, target }) }
  }
  for (const [pad, p] of paden) {
    if (p.ouderPad) verbind(idVan[groepVanPad.get(p.ouderPad)], idVan[groepVanPad.get(pad)])
  }

  // Wat via de koppelingen niet te bereiken is (nog niets vastgelegd), komt er
  // zoals voorheen bij via de vaste ketenstructuur
  const bereikt = new Set(nodes.map(x => x.nodeKey))
  for (const s of chain.nodes) {
    if (!bereikt.has(s.id)) nodes.push({ ...s, nodeKey: s.id, ontbreekt: [] })
  }
  for (const e of chain.edges) {
    if (bereikt.has(e.target)) continue
    const bronnen = bereikt.has(e.source)
      ? nodes.filter(x => x.nodeKey === e.source).map(x => x.id)
      : [e.source]
    bronnen.forEach(source => verbind(source, e.target))
  }

  return { nodes, edges }
}

// Stats per keten voor het overzicht
export function chainStats(chain) {
  const models    = chain.nodes.filter(n => n.type === 'model')
  const tstNewer  = models.filter(n => n.versions.TST !== n.versions.PROD)
  const accNewer  = models.filter(n => n.versions.ACC !== n.versions.PROD)
  const workItems = chain.nodes.filter(n => n.workItem).map(n => ({ model: n.label, ...n.workItem }))

  let status = 'STABIEL'
  if (tstNewer.length > 0 && accNewer.length > 0) status = 'ACTIEF'
  else if (accNewer.length > 0) status = 'KLAAR_VOOR_PROD'
  else if (tstNewer.length > 0) status = 'IN_ONTWIKKELING'

  return { models: models.length, tstNewer: tstNewer.length, accNewer: accNewer.length, workItems, status }
}
