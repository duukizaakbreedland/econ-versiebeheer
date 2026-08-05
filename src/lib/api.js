import { supabase } from './supabase.js'

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────
async function getOrgId(slug = 'buva') {
  const { data, error } = await supabase
    .from('organizations').select('id').eq('slug', slug).single()
  if (error) throw error
  return data.id
}

async function getEnvId(envName, orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)
  const { data, error } = await supabase
    .from('environments').select('id')
    .eq('organization_id', orgId).eq('name', envName).single()
  if (error) throw error
  return data.id
}

// Zet een versie actief in een omgeving.
// environment_versions heeft UNIQUE (environment_id, model_version_id): een versie
// die er ooit in stond kun je niet opnieuw invoegen. Daarom een upsert die de
// activatiedatum ververst — get_current_versions() pakt altijd de laatste.
async function activateVersion(environmentId, modelVersionId) {
  const { error } = await supabase
    .from('environment_versions')
    .upsert(
      { environment_id: environmentId, model_version_id: modelVersionId, activated_at: new Date().toISOString() },
      { onConflict: 'environment_id,model_version_id' }
    )
  if (error) throw error
}

function throwIf(error) {
  if (error) throw error
}

// ─── Ketens ophalen ───────────────────────────────────────────────────────────
export async function fetchChains(orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)

  const { data: chainsData, error: chainsErr } = await supabase
    .from('chains')
    .select(`
      key, label,
      chain_nodes ( node_key, models ( id, name, type, notes ) ),
      chain_edges ( source_key, target_key )
    `)
    .eq('organization_id', orgId)
    .order('key')

  if (chainsErr) throw chainsErr

  const { data: versions, error: versErr } = await supabase
    .rpc('get_current_versions', { p_org_id: orgId })

  if (versErr) throw versErr

  const mvIds = [...new Set(versions.map(v => v.model_version_id))]
  // Ook afgerond werk ophalen: dat hoort bij de versie en is achteraf nog
  // relevant om te zien wie wat wanneer heeft gedaan.
  const { data: workItems } = await supabase
    .from('work_items')
    .select('id, model_version_id, consultant, description, ticket, status, created_at')
    .in('model_version_id', mvIds)

  const versionMap = {}
  const mvIdMap    = {}
  for (const v of versions) {
    const k = `${v.model_id}:${v.env_name}`
    versionMap[k] = v.version
    mvIdMap[k]    = v.model_version_id
  }

  const wiMap = {}
  for (const wi of (workItems || [])) {
    wiMap[wi.model_version_id] = {
      id: wi.id, consultant: wi.consultant, note: wi.description,
      ticket: wi.ticket, status: wi.status, createdAt: wi.created_at,
    }
  }

  const result = {}
  for (const c of chainsData) {
    result[c.key] = {
      label: c.label,
      nodes: c.chain_nodes.map(cn => {
        const m     = cn.models
        const tstMv = mvIdMap[`${m.id}:TST`]
        return {
          id:       cn.node_key,
          type:     m.type.toLowerCase(),
          label:    m.name,
          modelId:  m.id,
          notes:    m.notes,
          versions: {
            PROD: versionMap[`${m.id}:PROD`],
            ACC:  versionMap[`${m.id}:ACC`],
            TST:  versionMap[`${m.id}:TST`],
          },
          versionIds: {
            PROD: mvIdMap[`${m.id}:PROD`],
            ACC:  mvIdMap[`${m.id}:ACC`],
            TST:  mvIdMap[`${m.id}:TST`],
          },
          workItem: tstMv && wiMap[tstMv] ? wiMap[tstMv] : undefined,
        }
      }),
      edges: c.chain_edges.map(e => ({ source: e.source_key, target: e.target_key })),
    }
  }

  return result
}

// ─── Releases ophalen ─────────────────────────────────────────────────────────
export async function fetchReleases(orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)

  const { data: envs } = await supabase
    .from('environments').select('id').eq('organization_id', orgId)

  const { data, error } = await supabase
    .from('deployment_logs')
    .select(`
      id, deployed_at, ticket, notes,
      environments ( name ),
      deployment_log_versions (
        role,
        model_versions ( version, models ( name, type ) )
      )
    `)
    .in('environment_id', envs.map(e => e.id))
    .order('deployed_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data
}

// ─── Versies van één model, met het werk dat eraan hangt ──────────────────────
// Werk hoort bij een versie en schuift daarmee mee van TST naar ACC en PROD.
// Meerdere versies in ontwikkeling betekent dus meerdere werk-items.
export async function fetchModelVersions(modelId) {
  const { data: mvData, error } = await supabase
    .from('model_versions')
    .select('id, version, notes, created_at')
    .eq('model_id', modelId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const ids = mvData.map(mv => mv.id)

  const { data: evData } = await supabase
    .from('environment_versions')
    .select('model_version_id, activated_at, environments ( name )')
    .in('model_version_id', ids)

  const { data: wiData } = await supabase
    .from('work_items')
    .select('id, model_version_id, consultant, description, ticket, status, created_at')
    .in('model_version_id', ids)
    .order('created_at', { ascending: false })

  return mvData.map(mv => ({
    ...mv,
    envs: (evData || [])
      .filter(ev => ev.model_version_id === mv.id)
      .map(ev => ({ name: ev.environments.name, activated_at: ev.activated_at })),
    werk: (wiData || [])
      .filter(w => w.model_version_id === mv.id)
      .map(w => ({
        id: w.id, consultant: w.consultant, note: w.description,
        ticket: w.ticket, status: w.status, createdAt: w.created_at,
      })),
  }))
}

// ─── Promoties van één model ──────────────────────────────────────────────────
// Per omgeving de meest recente promotie, met wat er verving en wat vervangen
// werd. Alleen de nieuwste per omgeving is terug te draaien; oudere staan er
// als historie bij.
export async function fetchPromotiesVoorModel(modelId) {
  const { data: mvs } = await supabase
    .from('model_versions').select('id, version').eq('model_id', modelId)
  if (!mvs?.length) return []

  const versiePerId = Object.fromEntries(mvs.map(m => [m.id, m.version]))

  const { data: regels, error } = await supabase
    .from('deployment_log_versions')
    .select(`role, model_version_id,
             deployment_logs ( id, deployed_at, ticket, environments ( name ) )`)
    .in('model_version_id', mvs.map(m => m.id))
  throwIf(error)

  const perLog = {}
  for (const r of regels ?? []) {
    const log = r.deployment_logs
    if (!log) continue
    if (!perLog[log.id]) {
      perLog[log.id] = {
        logId: log.id,
        env: log.environments?.name,
        wanneer: log.deployed_at,
        ticket: log.ticket,
        naar: null,
        van: null,
      }
    }
    if (r.role === 'DEPLOYED') perLog[log.id].naar = versiePerId[r.model_version_id]
    else                       perLog[log.id].van  = versiePerId[r.model_version_id]
  }

  const alles = Object.values(perLog)
    .filter(p => p.naar)
    .sort((a, b) => new Date(b.wanneer) - new Date(a.wanneer))

  // De nieuwste per omgeving mag terug
  const gezien = new Set()
  return alles.map(p => {
    const nieuwste = !gezien.has(p.env)
    gezien.add(p.env)
    return { ...p, terugTeDraaien: nieuwste }
  })
}

// ─── Werk item status bijwerken bij promotie ──────────────────────────────────
async function bumpWorkItemStatus(modelVersionId, toEnv) {
  const newStatus = toEnv === 'PROD' ? 'DONE' : toEnv === 'ACC' ? 'REVIEW' : null
  if (!newStatus) return
  await supabase
    .from('work_items')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('model_version_id', modelVersionId)
    .in('status', newStatus === 'DONE' ? ['IN_PROGRESS', 'REVIEW'] : ['IN_PROGRESS'])
}

// Het omgekeerde, bij het terugdraaien van een promotie
async function revertWorkItemStatus(modelVersionIds, envName) {
  const back = envName === 'PROD' ? { from: ['DONE'], to: 'REVIEW' }
             : envName === 'ACC'  ? { from: ['REVIEW'], to: 'IN_PROGRESS' }
             : null
  if (!back || modelVersionIds.length === 0) return
  await supabase
    .from('work_items')
    .update({ status: back.to, updated_at: new Date().toISOString() })
    .in('model_version_id', modelVersionIds)
    .in('status', back.from)
}

// ─── Nieuwe versie registreren ────────────────────────────────────────────────
export async function registerVersion({ modelName, envName, version, consultant, note, ticket, orgSlug = 'buva' }) {
  const orgId = await getOrgId(orgSlug)

  const { data: env, error: envErr } = await supabase
    .from('environments').select('id')
    .eq('organization_id', orgId).eq('name', envName).single()
  throwIf(envErr)

  const { data: model, error: modelErr } = await supabase
    .from('models').select('id')
    .eq('organization_id', orgId).eq('name', modelName).single()
  throwIf(modelErr)

  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .upsert({ model_id: model.id, version, status: 'ACTIVE' }, { onConflict: 'model_id,version' })
    .select('id').single()
  throwIf(mvErr)

  await activateVersion(env.id, mv.id)

  if (consultant) {
    const { error } = await supabase
      .from('work_items')
      .insert({ model_version_id: mv.id, consultant, description: note || '', ticket: ticket || null, status: 'IN_PROGRESS' })
    throwIf(error)
  }
}

// ─── Enkel model promoveren ───────────────────────────────────────────────────
export async function promoteModel({ modelId, fromEnv, toEnv, orgSlug = 'buva' }) {
  const orgId = await getOrgId(orgSlug)

  const { data: toEnvRow } = await supabase
    .from('environments').select('id')
    .eq('organization_id', orgId).eq('name', toEnv).single()

  const { data: versions } = await supabase
    .rpc('get_current_versions', { p_org_id: orgId })

  const fromVer = versions.find(v => v.model_id === modelId && v.env_name === fromEnv)
  const toVer   = versions.find(v => v.model_id === modelId && v.env_name === toEnv)

  if (!fromVer) throw new Error(`Geen versie gevonden in ${fromEnv}`)

  // Het ticket is al vastgelegd bij het werk dat aan deze versie hangt — daar
  // halen we het op, in plaats van het bij elke promotie opnieuw te vragen.
  const { data: wi } = await supabase
    .from('work_items').select('ticket')
    .eq('model_version_id', fromVer.model_version_id)
    .not('ticket', 'is', null)
    .limit(1)
  const ticket = wi?.[0]?.ticket ?? null

  const { data: log, error: logErr } = await supabase
    .from('deployment_logs')
    .insert({ environment_id: toEnvRow.id, ticket })
    .select('id').single()
  throwIf(logErr)

  await activateVersion(toEnvRow.id, fromVer.model_version_id)

  const entries = [{ deployment_log_id: log.id, model_version_id: fromVer.model_version_id, role: 'DEPLOYED' }]
  if (toVer) entries.push({ deployment_log_id: log.id, model_version_id: toVer.model_version_id, role: 'REPLACED' })
  throwIf((await supabase.from('deployment_log_versions').insert(entries)).error)

  await bumpWorkItemStatus(fromVer.model_version_id, toEnv)

  const fromEnvId = await getEnvId(fromEnv, orgSlug)
  await copyDependencies({ fromEnvId, toEnvId: toEnvRow.id, modelIds: [modelId] })
}

// ─── Hele keten promoveren ────────────────────────────────────────────────────
export async function promoteChain({ chainKey, fromEnv, toEnv, ticket, orgSlug = 'buva' }) {
  const orgId = await getOrgId(orgSlug)

  const { data: toEnvRow } = await supabase
    .from('environments').select('id')
    .eq('organization_id', orgId).eq('name', toEnv).single()

  const { data: versions } = await supabase
    .rpc('get_current_versions', { p_org_id: orgId })

  const { data: chainData } = await supabase
    .from('chains')
    .select('chain_nodes(model_id)')
    .eq('organization_id', orgId)
    .eq('key', chainKey)
    .single()

  const chainModelIds = new Set(chainData.chain_nodes.map(n => n.model_id))
  const fromVersions  = versions.filter(v => v.env_name === fromEnv && chainModelIds.has(v.model_id))
  const toVersions    = versions.filter(v => v.env_name === toEnv   && chainModelIds.has(v.model_id))

  if (fromVersions.length === 0) throw new Error(`Geen versies gevonden in ${fromEnv}`)

  const toPromote = fromVersions.filter(v => {
    const current = toVersions.find(tv => tv.model_id === v.model_id)
    return !current || current.version !== v.version
  })

  if (toPromote.length === 0) throw new Error(`Alle versies zijn al gelijk in ${toEnv}`)

  const { data: log, error: logErr } = await supabase
    .from('deployment_logs')
    .insert({ environment_id: toEnvRow.id, ticket: ticket || null })
    .select('id').single()
  throwIf(logErr)

  for (const v of toPromote) {
    const replaced = toVersions.find(tv => tv.model_id === v.model_id)

    await activateVersion(toEnvRow.id, v.model_version_id)

    const entries = [{ deployment_log_id: log.id, model_version_id: v.model_version_id, role: 'DEPLOYED' }]
    if (replaced) entries.push({ deployment_log_id: log.id, model_version_id: replaced.model_version_id, role: 'REPLACED' })
    throwIf((await supabase.from('deployment_log_versions').insert(entries)).error)

    await bumpWorkItemStatus(v.model_version_id, toEnv)
  }

  const fromEnvId = await getEnvId(fromEnv, orgSlug)
  await copyDependencies({ fromEnvId, toEnvId: toEnvRow.id, modelIds: [...chainModelIds] })
}

// ══════════════════════════════════════════════════════════════════════════════
// Corrigeren
// ══════════════════════════════════════════════════════════════════════════════

// Modelnaam of algemene opmerking wijzigen
export async function updateModel({ modelId, name, notes }) {
  const patch = {}
  if (name  !== undefined) patch.name  = name
  if (notes !== undefined) patch.notes = notes || null
  const { error } = await supabase
    .from('models').update(patch).eq('id', modelId)
  throwIf(error)
}

// Versienummer of notitie corrigeren
export async function updateVersion({ modelVersionId, version, notes }) {
  const patch = {}
  if (version !== undefined) patch.version = version
  if (notes   !== undefined) patch.notes   = notes
  const { error } = await supabase
    .from('model_versions').update(patch).eq('id', modelVersionId)
  throwIf(error)
}

// Een foutief geregistreerde versie uit een omgeving halen
export async function removeVersionFromEnv({ modelVersionId, envName, orgSlug = 'buva' }) {
  const envId = await getEnvId(envName, orgSlug)
  const { error } = await supabase
    .from('environment_versions')
    .delete()
    .eq('environment_id', envId)
    .eq('model_version_id', modelVersionId)
  throwIf(error)
}

// Een verkeerd geregistreerde versie helemaal terugnemen.
//
// Registreren doet twee dingen: de versie actief zetten in een omgeving én er
// werk aan hangen. Alleen het werk weghalen laat de versie dus gewoon staan —
// daarvoor is deze functie er. De omgeving valt daarna terug op de versie die
// er dáárvoor actief was, omdat get_current_versions de laatste activering pakt
// die er nog staat.
//
// Activeringen, werk en koppelingen van deze versie gaan mee via cascade.
export async function deleteModelVersion(modelVersionId) {
  const { data: releases } = await supabase
    .from('deployment_log_versions')
    .select('id').eq('model_version_id', modelVersionId).limit(1)

  // Een gepromoveerde versie hoort via Promoties → Terug ongedaan gemaakt te
  // worden; dat zet de vervangen versie netjes terug en ruimt de release op.
  if (releases?.length) {
    throw new Error('Deze versie zit in een release. Draai die eerst terug bij Promoties.')
  }

  const { error } = await supabase.from('model_versions').delete().eq('id', modelVersionId)
  throwIf(error)
}

// Werk toevoegen aan een versie die er al staat.
//
// Registreren via Acties maakt versie én werk in één keer aan, maar dat activeert
// de versie ook in TST. Voor een versie die er al is — bijvoorbeeld uit de
// eCon-import — wil je alleen de aantekening. Deze functie raakt daarom
// environment_versions niet aan.
export async function addWorkItem({ modelVersionId, consultant, description, ticket, status = 'IN_PROGRESS' }) {
  const { error } = await supabase
    .from('work_items')
    .insert({
      model_version_id: modelVersionId,
      consultant,
      description: description || '',
      ticket: ticket || null,
      status,
    })
  throwIf(error)
}

// Werk item bijwerken
export async function updateWorkItem({ id, consultant, description, ticket, status }) {
  const patch = { updated_at: new Date().toISOString() }
  if (consultant  !== undefined) patch.consultant  = consultant
  if (description !== undefined) patch.description = description
  if (ticket      !== undefined) patch.ticket      = ticket || null
  if (status      !== undefined) patch.status      = status
  const { error } = await supabase.from('work_items').update(patch).eq('id', id)
  throwIf(error)
}

export async function deleteWorkItem(id) {
  const { error } = await supabase.from('work_items').delete().eq('id', id)
  throwIf(error)
}

// Ticket of notitie van een release achteraf aanvullen
export async function updateDeploymentLog({ id, ticket, notes }) {
  const patch = {}
  if (ticket !== undefined) patch.ticket = ticket || null
  if (notes  !== undefined) patch.notes  = notes || null
  const { error } = await supabase.from('deployment_logs').update(patch).eq('id', id)
  throwIf(error)
}

// ══════════════════════════════════════════════════════════════════════════════
// Versie-specifieke koppelingen
// ══════════════════════════════════════════════════════════════════════════════

const DEP_SELECT = `
  id, environment_id, child_model_id, child_missing_in_export,
  environments ( name ),
  parent: parent_version_id    ( id, version, model_id, models ( id, name ) ),
  iface:  interface_version_id ( id, version, model_id, models ( id, name ) ),
  child:  child_version_id     ( id, version, model_id, models ( id, name ) )
`

// Alle koppelingen van de organisatie, over alle omgevingen heen
export async function fetchDependencies(orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)
  const { data: envs } = await supabase
    .from('environments').select('id').eq('organization_id', orgId)

  const { data, error } = await supabase
    .from('dependencies')
    .select(DEP_SELECT)
    .in('environment_id', (envs || []).map(e => e.id))
  throwIf(error)

  return (data || []).map(d => ({
    id:            d.id,
    env:           d.environments?.name,
    parentModelId: d.parent?.model_id,
    parentName:    d.parent?.models?.name,
    parentVersion: d.parent?.version,
    parentVersionId: d.parent?.id,
    ifaceModelId:  d.iface?.model_id,
    ifaceName:     d.iface?.models?.name,
    ifaceVersion:  d.iface?.version,
    childModelId:  d.child_model_id,
    childName:     d.child?.models?.name,
    childVersion:  d.child?.version,
    childVersionId: d.child?.id,
    ontbreekt:     d.child_missing_in_export,
  }))
}

// Momentopname meenemen bij een promotie: de koppelingen zoals ze in de
// bronomgeving gelden, gelden daarna ook in de doelomgeving.
async function copyDependencies({ fromEnvId, toEnvId, modelIds }) {
  const set = new Set(modelIds)

  const { data: rows } = await supabase
    .from('dependencies')
    .select('parent_version_id, interface_version_id, child_version_id, child_model_id, parent: parent_version_id ( model_id )')
    .eq('environment_id', fromEnvId)

  const relevant = (rows || []).filter(r => set.has(r.child_model_id) || set.has(r.parent?.model_id))
  if (relevant.length === 0) return

  const { error } = await supabase.from('dependencies').upsert(
    relevant.map(r => ({
      environment_id:       toEnvId,
      parent_version_id:    r.parent_version_id,
      interface_version_id: r.interface_version_id,
      child_version_id:     r.child_version_id,
      child_model_id:       r.child_model_id,
    })),
    { onConflict: 'environment_id,parent_version_id,interface_version_id,child_model_id' }
  )
  throwIf(error)
}

// ══════════════════════════════════════════════════════════════════════════════
// Beheer — ketens, modellen en hun onderlinge verbindingen
// ══════════════════════════════════════════════════════════════════════════════

// Alle modellen en interfaces van de organisatie
export async function fetchModels(orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)
  const { data, error } = await supabase
    .from('models')
    .select('id, name, type')
    .eq('organization_id', orgId)
    .order('name')
  throwIf(error)
  return data
}

// Ketens inclusief interne id's — voor het beheerscherm
export async function fetchChainsAdmin(orgSlug = 'buva') {
  const orgId = await getOrgId(orgSlug)
  const { data, error } = await supabase
    .from('chains')
    .select(`
      id, key, label,
      chain_nodes ( id, node_key, model_id, models ( id, name, type ) ),
      chain_edges ( id, source_key, target_key )
    `)
    .eq('organization_id', orgId)
    .order('key')
  throwIf(error)
  return data
}

export async function createChain({ key, label, orgSlug = 'buva' }) {
  const orgId = await getOrgId(orgSlug)
  const { data, error } = await supabase
    .from('chains')
    .insert({ organization_id: orgId, key, label })
    .select('id').single()
  throwIf(error)
  return data
}

export async function updateChain({ id, key, label }) {
  const patch = {}
  if (key   !== undefined) patch.key   = key
  if (label !== undefined) patch.label = label
  const { error } = await supabase.from('chains').update(patch).eq('id', id)
  throwIf(error)
}

// chain_nodes en chain_edges verdwijnen mee via cascade
export async function deleteChain(id) {
  const { error } = await supabase.from('chains').delete().eq('id', id)
  throwIf(error)
}

export async function createModel({ name, type, orgSlug = 'buva' }) {
  const orgId = await getOrgId(orgSlug)
  const { data, error } = await supabase
    .from('models')
    .insert({ organization_id: orgId, name, type })
    .select('id, name, type').single()
  throwIf(error)
  return data
}

// Waar wordt een model gebruikt? Bepaalt of het verwijderd mag worden.
export async function getModelUsage(modelId) {
  const { data: nodes } = await supabase
    .from('chain_nodes').select('chains ( label )').eq('model_id', modelId)

  const { data: mvs } = await supabase
    .from('model_versions').select('id').eq('model_id', modelId)

  let envs = []
  if (mvs?.length) {
    const { data: evs } = await supabase
      .from('environment_versions')
      .select('environments ( name )')
      .in('model_version_id', mvs.map(m => m.id))
    envs = [...new Set((evs || []).map(e => e.environments.name))]
  }

  return {
    chains:   [...new Set((nodes || []).map(n => n.chains?.label).filter(Boolean))],
    versions: mvs?.length ?? 0,
    envs,
  }
}

// Verwijdert het model plus al zijn versies (cascade). Alleen als het in geen
// enkele keten meer zit — anders blokkeert de foreign key toch.
export async function deleteModel(modelId) {
  const usage = await getModelUsage(modelId)
  if (usage.chains.length > 0) {
    throw new Error(`Zit nog in: ${usage.chains.join(', ')}. Haal het daar eerst uit.`)
  }
  const { error } = await supabase.from('models').delete().eq('id', modelId)
  throwIf(error)
}

// Genereert een vrije node_key binnen de keten: i1, i2… voor interfaces, m1, m2… voor modellen
function nextNodeKey(bestaandeKeys, type) {
  const prefix = type === 'INTERFACE' ? 'i' : 'm'
  let n = 1
  while (bestaandeKeys.includes(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export async function addChainNode({ chainId, modelId, type, bestaandeKeys = [] }) {
  const nodeKey = nextNodeKey(bestaandeKeys, type)
  const { error } = await supabase
    .from('chain_nodes')
    .insert({ chain_id: chainId, node_key: nodeKey, model_id: modelId })
  throwIf(error)
  return nodeKey
}

// Verbindingen van en naar de node gaan mee
export async function removeChainNode({ chainId, nodeKey }) {
  const { error: edgeErr } = await supabase
    .from('chain_edges')
    .delete()
    .eq('chain_id', chainId)
    .or(`source_key.eq.${nodeKey},target_key.eq.${nodeKey}`)
  throwIf(edgeErr)

  const { error } = await supabase
    .from('chain_nodes')
    .delete()
    .eq('chain_id', chainId)
    .eq('node_key', nodeKey)
  throwIf(error)
}

export async function addChainEdge({ chainId, sourceKey, targetKey }) {
  if (sourceKey === targetKey) throw new Error('Bron en doel mogen niet hetzelfde zijn')
  const { error } = await supabase
    .from('chain_edges')
    .insert({ chain_id: chainId, source_key: sourceKey, target_key: targetKey })
  throwIf(error)
}

export async function removeChainEdge(edgeId) {
  const { error } = await supabase.from('chain_edges').delete().eq('id', edgeId)
  throwIf(error)
}

// ─── Promotie terugdraaien ────────────────────────────────────────────────────
// Zet de vervangen versies weer actief, haalt de gepromoveerde versies uit de
// omgeving en verwijdert de release-regel.
export async function rollbackDeployment({ logId }) {
  const { data: log, error: logErr } = await supabase
    .from('deployment_logs')
    .select('id, environment_id, deployed_at, environments ( name ), deployment_log_versions ( role, model_version_id )')
    .eq('id', logId)
    .single()
  throwIf(logErr)

  const entries  = log.deployment_log_versions ?? []
  const deployed = entries.filter(e => e.role === 'DEPLOYED').map(e => e.model_version_id)
  const replaced = entries.filter(e => e.role === 'REPLACED').map(e => e.model_version_id)

  if (deployed.length === 0) throw new Error('Deze release bevat geen versies om terug te draaien')

  // Welke modellen raakt deze release?
  const { data: mvRows } = await supabase
    .from('model_versions')
    .select('id, model_id')
    .in('id', [...deployed, ...replaced])
  const touchedModels = new Set((mvRows || []).map(r => r.model_id))

  // Blokkeer als er voor dezelfde omgeving een nieuwere release over dezelfde
  // modellen heen is gegaan — anders draai je een tussenliggende stap terug.
  const { data: newer } = await supabase
    .from('deployment_logs')
    .select('id, deployed_at, deployment_log_versions ( model_version_id )')
    .eq('environment_id', log.environment_id)
    .gt('deployed_at', log.deployed_at)

  if (newer?.length) {
    const newerMvIds = newer.flatMap(l => l.deployment_log_versions.map(v => v.model_version_id))
    if (newerMvIds.length) {
      const { data: newerMv } = await supabase
        .from('model_versions').select('model_id').in('id', newerMvIds)
      const overlap = (newerMv || []).some(r => touchedModels.has(r.model_id))
      if (overlap) {
        throw new Error('Er is hierna een nieuwere release over dezelfde modellen gegaan. Draai die eerst terug.')
      }
    }
  }

  // Gepromoveerde versies uit de omgeving halen
  const { error: delErr } = await supabase
    .from('environment_versions')
    .delete()
    .eq('environment_id', log.environment_id)
    .in('model_version_id', deployed)
  throwIf(delErr)

  // Vervangen versies weer activeren
  for (const mvId of replaced) {
    await activateVersion(log.environment_id, mvId)
  }

  // Werk items terugzetten naar de status van vóór de promotie
  await revertWorkItemStatus(deployed, log.environments?.name)

  // Release-regel weg (deployment_log_versions gaat mee via cascade)
  const { error: logDelErr } = await supabase.from('deployment_logs').delete().eq('id', logId)
  throwIf(logDelErr)

  return { restored: replaced.length, removed: deployed.length }
}
