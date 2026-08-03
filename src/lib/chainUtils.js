// Helpers die afgeleide gegevens uit de ketenstructuur berekenen.
// De ketens zelf komen uit Supabase via fetchChains() in api.js.

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

// ─── Versieconflicten ─────────────────────────────────────────────────────────
// Draait hetzelfde submodel binnen één omgeving op meerdere versies tegelijk?
// Resultaat: { modelId: [ { env, versies: [{ version, parents }] } ] }
export function findVersionConflicts(deps) {
  const perEnvModel = {}
  for (const d of deps) {
    if (!d.childModelId || !d.childVersion || !d.env) continue
    const k = `${d.env}|${d.childModelId}`
    if (!perEnvModel[k]) perEnvModel[k] = {}
    if (!perEnvModel[k][d.childVersion]) perEnvModel[k][d.childVersion] = []
    perEnvModel[k][d.childVersion].push(d.parentName)
  }

  const conflicts = {}
  for (const [k, versies] of Object.entries(perEnvModel)) {
    const keys = Object.keys(versies)
    if (keys.length < 2) continue
    const [env, modelId] = k.split('|')
    if (!conflicts[modelId]) conflicts[modelId] = []
    conflicts[modelId].push({
      env,
      versies: keys.map(v => ({ version: v, parents: [...new Set(versies[v])] })),
    })
  }
  return conflicts
}

// Loopt TST of ACC voor op PROD?
export function versionStatus(versions) {
  if (versions.TST !== versions.PROD || versions.ACC !== versions.PROD) {
    if (versions.ACC !== versions.PROD) return 'acc-ahead'
    return 'tst-ahead'
  }
  return 'stable'
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
