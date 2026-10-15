import { supabase } from './supabase.js'

// Alle lees- en schrijfacties naar Supabase. Schrijfacties die meer dan één rij
// raken zijn databasefuncties (supabase/migrations/014_rpcs.sql): één transactie,
// alles of niets, met een Nederlandse foutmelding die hier als error.message
// terugkomt. Een RPC krijgt altijd ál zijn parameters mee, anders vindt
// PostgREST de functie niet.

function throwIf(error) {
  if (error) throw new Error(error.message ?? String(error))
}

async function rpc(naam, params) {
  const { data, error } = await supabase.rpc(naam, params)
  throwIf(error)
  return data
}

// Alles ophalen, ook boven de 1000 rijen die PostgREST per aanvraag teruggeeft
async function allesVan(bouwQuery, stap = 1000) {
  const rijen = []
  for (let van = 0; ; van += stap) {
    const { data, error } = await bouwQuery().range(van, van + stap - 1)
    throwIf(error)
    rijen.push(...(data ?? []))
    if (!data || data.length < stap) return rijen
  }
}

// ─── Lezen ────────────────────────────────────────────────────────────────────

// Eén consistente momentopname van alles wat de app toont (zie get_snapshot)
export async function fetchSnapshotRaw(orgSlug = 'buva') {
  return rpc('get_snapshot', { p_org_slug: orgSlug })
}

export async function fetchReleases(orgSlug = 'buva') {
  const { data: org, error: orgErr } = await supabase
    .from('organizations').select('id').eq('slug', orgSlug).single()
  throwIf(orgErr)
  const { data: envs, error: envErr } = await supabase
    .from('environments').select('id').eq('organization_id', org.id)
  throwIf(envErr)

  return allesVan(() => supabase
    .from('deployment_logs')
    .select(`
      id, deployed_at, ticket, tested_by, notes, deployed_by,
      rolled_back_at, rolled_back_by, rollback_reason, environment_id,
      environments ( name ),
      deployment_log_versions (
        role, model_version_id, was_present,
        model_versions ( id, version, model_id, models ( name, type ) )
      ),
      deployment_log_dependencies (
        parent_version_id, child_model_id, old_child_version_id, new_child_version_id,
        parent: parent_version_id ( version, models ( name ) ),
        child:  child_model_id ( name ),
        oud:    old_child_version_id ( version ),
        nieuw:  new_child_version_id ( version )
      )
    `)
    .in('environment_id', envs.map(e => e.id))
    .order('deployed_at', { ascending: false }))
}

export async function fetchActivity(limit = 100) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, at, user_email, action, summary, details, model_id, model_version_id, environment_id, deployment_log_id')
    .order('at', { ascending: false })
    .limit(limit)
  throwIf(error)
  return data ?? []
}

// ─── Registreren, promoveren, terugdraaien, verwijderen ───────────────────────

// Nieuwe versie in een omgeving (normaal TST), met werk eraan.
// inheritFrom: [{ versionId, envId }] — de eerste met aanroepen wordt overgenomen
// callers:     [{ parentVersionId, interfaceVersionId? }] — gaan deze versie aanroepen
export async function registerVersion({ modelId, version, envId, consultant, ticket, description, inheritFrom = [], callers = [] }) {
  return rpc('register_version', {
    p_model_id:     modelId,
    p_version:      version,
    p_env_id:       envId,
    p_consultant:   consultant,
    p_ticket:       ticket,
    p_description:  description ?? '',
    p_inherit_from: inheritFrom.map(i => ({ version_id: i.versionId, env_id: i.envId })),
    p_callers:      callers.map(c => ({ parent_version_id: c.parentVersionId, interface_version_id: c.interfaceVersionId ?? null })),
  })
}

// Eén release naar een omgeving.
// versions:     [{ naar, van }]  versie-id's
// koppelingen:  [{ parentVersionId, interfaceVersionId, childVersionId, ontbreekt? }]
export async function applyRelease({ envId, ticket, testedBy, notes, versions = [], koppelingen = [] }) {
  return rpc('apply_release', {
    p_env_id:      envId,
    p_ticket:      ticket,
    p_tested_by:   testedBy,
    p_notes:       notes ?? null,
    p_versions:    versions.map(v => ({ naar: v.naar, van: v.van ?? null })),
    p_koppelingen: koppelingen.map(k => ({
      parent_version_id:       k.parentVersionId,
      interface_version_id:    k.interfaceVersionId,
      child_version_id:        k.childVersionId,
      child_missing_in_export: k.ontbreekt ?? false,
    })),
  })
}

export async function rollbackRelease({ logId, reason }) {
  return rpc('rollback_release', { p_log_id: logId, p_reason: reason })
}

export async function deleteVersion(versionId) {
  return rpc('delete_version', { p_mv_id: versionId })
}

// Eén aanroep vastleggen of wijzigen, in een of meer omgevingen
// targets: [{ envId, parentVersionId }]
export async function setDependency({ targets, interfaceModelId, interfaceVersion, childModelId, childVersion }) {
  return rpc('set_dependency', {
    p_targets:            targets.map(t => ({ env_id: t.envId, parent_version_id: t.parentVersionId })),
    p_interface_model_id: interfaceModelId,
    p_interface_version:  interfaceVersion,
    p_child_model_id:     childModelId,
    p_child_version:      childVersion,
  })
}

export async function removeDependency(id) {
  return rpc('remove_dependency', { p_id: id })
}

// ─── Kleine correcties (één rij) ──────────────────────────────────────────────

export async function updateModel({ modelId, name, notes }) {
  const patch = {}
  if (name  !== undefined) patch.name  = name
  if (notes !== undefined) patch.notes = notes || null
  const { error } = await supabase.from('models').update(patch).eq('id', modelId)
  throwIf(error)
}

export async function addWorkItem({ modelVersionId, consultant, description, ticket, status = 'IN_PROGRESS' }) {
  const { error } = await supabase
    .from('work_items')
    .insert({ model_version_id: modelVersionId, consultant, description: description || '', ticket: ticket || null, status })
  throwIf(error)
}

export async function updateWorkItem({ id, consultant, description, ticket, status }) {
  const patch = {}
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

export async function updateDeploymentLog({ id, ticket, testedBy, notes }) {
  const patch = {}
  if (ticket   !== undefined) patch.ticket    = ticket || null
  if (testedBy !== undefined) patch.tested_by = testedBy || null
  if (notes    !== undefined) patch.notes     = notes || null
  const { error } = await supabase.from('deployment_logs').update(patch).eq('id', id)
  throwIf(error)
}

// ─── Beheer: ketens en modellen ───────────────────────────────────────────────

export async function createChain({ key, label, rootModelId, orgId }) {
  const { data, error } = await supabase
    .from('chains')
    .insert({ organization_id: orgId, key, label, root_model_id: rootModelId })
    .select('id').single()
  throwIf(error)
  return data
}

export async function updateChain({ id, key, label, rootModelId }) {
  const patch = {}
  if (key         !== undefined) patch.key           = key
  if (label       !== undefined) patch.label         = label
  if (rootModelId !== undefined) patch.root_model_id = rootModelId
  const { error } = await supabase.from('chains').update(patch).eq('id', id)
  throwIf(error)
}

export async function deleteChain(id) {
  const { error } = await supabase.from('chains').delete().eq('id', id)
  throwIf(error)
}

export async function createModel({ name, type, orgId }) {
  const { data, error } = await supabase
    .from('models')
    .insert({ organization_id: orgId, name, type })
    .select('id, name, type').single()
  throwIf(error)
  return data
}

// Verwijdert het model met al zijn versies. De aanroeper controleert eerst via
// de snapshot of het nergens meer in gebruik is; de foreign key van
// chains.root_model_id houdt een hoofdmodel sowieso tegen.
export async function deleteModel(modelId) {
  const { error } = await supabase.from('models').delete().eq('id', modelId)
  throwIf(error)
}
