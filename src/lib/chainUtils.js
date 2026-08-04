// Helpers die afgeleide gegevens uit de ketenstructuur berekenen.
// De ketens zelf komen uit Supabase via fetchChains() in api.js.

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
  if ([acc, tst].includes('achter')) return { label: 'Loopt achter op PROD', kleur: '#f97316' }
  if ([acc, tst].includes('voor'))   return { label: 'Loopt voor op PROD',   kleur: '#fbbf24' }
  if ([acc, tst].includes('anders')) return { label: 'Wijkt af van PROD',    kleur: '#a855f7' }
  return { label: 'Gelijk in alle omgevingen', kleur: '#22c55e' }
}

// ─── Versies zoals ze in déze keten worden aangeroepen ────────────────────────
// Het hoofdmodel gebruikt zijn eigen versie; elk model daaronder de versie
// waarmee zijn ouder hem aanroept. Dat kan per keten verschillen — hetzelfde
// submodel draait onder het ene hoofdmodel op een andere versie dan onder het
// andere, en dat is precies wat we willen laten zien.
export function versiesInKeten(chain, deps, env) {
  const versies = {}, ontbreekt = {}
  if (!chain) return { versies, ontbreekt }

  const nodePerModel = {}
  chain.nodes.forEach(n => { nodePerModel[n.modelId] = n })

  const heeftOuder = new Set(chain.edges.map(e => e.target))
  const wortel = chain.nodes.find(n => !heeftOuder.has(n.id))
  if (!wortel) return { versies, ontbreekt }

  // Koppelingen van deze omgeving, gegroepeerd op (parentmodel, parentversie)
  const perOuder = {}
  for (const d of deps) {
    if (d.env !== env) continue
    const k = `${d.parentModelId}|${d.parentVersion}`
    if (!perOuder[k]) perOuder[k] = []
    perOuder[k].push(d)
  }

  const stapel = [[wortel, wortel.versions?.[env]]]
  const gezien = new Set()

  while (stapel.length) {
    const [node, versie] = stapel.pop()
    if (!versie) continue
    const sleutel = `${node.id}|${versie}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)
    versies[node.id] = versie

    for (const d of perOuder[`${node.modelId}|${versie}`] ?? []) {
      const ifaceNode = nodePerModel[d.ifaceModelId]
      const childNode = nodePerModel[d.childModelId]
      if (ifaceNode) versies[ifaceNode.id] = d.ifaceVersion
      if (childNode) {
        if (d.ontbreekt) {
          if (!ontbreekt[childNode.id]) ontbreekt[childNode.id] = []
          ontbreekt[childNode.id].push(env)
        }
        stapel.push([childNode, d.childVersion])
      }
    }
  }

  return { versies, ontbreekt }
}

// Alle drie de omgevingen in één keer
export function ketenVersies(chain, deps) {
  const uit = {}
  for (const env of ENVS) uit[env] = versiesInKeten(chain, deps, env)
  return uit
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
