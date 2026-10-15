// De momentopname zoals de app ermee werkt: de ruwe jsonb uit get_snapshot plus
// de releases en het activiteitenlog, met opzoekfuncties erbij. Alles wat een
// view toont komt hieruit, zodat ketens, versies en aanroepen altijd bij
// elkaar horen.

import { vergelijkVersies } from './versies.js'

export const ENVS = ['PROD', 'ACC', 'TST']          // van boven naar beneden
export const FLOW = ['TST', 'ACC', 'PROD']          // de richting van een promotie

export function bouwSnapshot(raw, releasesRaw = [], activityRaw = []) {
  const envs = [...(raw.environments ?? [])].sort((a, b) => a.display_order - b.display_order)
  const envById   = Object.fromEntries(envs.map(e => [e.id, e.name]))
  const envByName = Object.fromEntries(envs.map(e => [e.name, e.id]))

  const models    = [...(raw.models ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const modelById = Object.fromEntries(models.map(m => [m.id, m]))

  const versions = (raw.versions ?? []).map(v => ({
    id: v.id, modelId: v.model_id, version: v.version, notes: v.notes,
    createdAt: v.created_at, createdBy: v.created_by,
    label: `${modelById[v.model_id]?.name ?? '?'} ${v.version}`,
  }))
  const versionById   = Object.fromEntries(versions.map(v => [v.id, v]))
  const versionsByModel = {}
  for (const v of versions) (versionsByModel[v.modelId] ??= []).push(v)
  for (const lijst of Object.values(versionsByModel)) {
    lijst.sort((a, b) => (vergelijkVersies(b.version, a.version) ?? 0) || new Date(b.createdAt) - new Date(a.createdAt))
  }

  const current = {}
  for (const c of raw.current ?? []) {
    current[`${c.model_id}:${c.env}`] = { versionId: c.model_version_id, version: c.version, activatedAt: c.activated_at }
  }

  const present = {}
  const presentByVersion = {}
  for (const p of raw.present ?? []) {
    present[`${p.model_version_id}:${p.env}`] = p.activated_at
    ;(presentByVersion[p.model_version_id] ??= []).push(p.env)
  }

  const deps = (raw.deps ?? []).map(d => ({
    id: d.id, env: d.env, envId: d.environment_id,
    parentVersionId: d.parent_version_id, parentModelId: d.parent_model_id,
    parentName: modelById[d.parent_model_id]?.name, parentVersion: d.parent_version,
    ifaceVersionId: d.interface_version_id, ifaceModelId: d.iface_model_id,
    ifaceName: modelById[d.iface_model_id]?.name, ifaceVersion: d.iface_version,
    childVersionId: d.child_version_id, childModelId: d.child_model_id,
    childName: modelById[d.child_model_id]?.name, childVersion: d.child_version,
    ontbreekt: Boolean(d.ontbreekt), previousChildVersionId: d.previous_child_version_id,
  }))
  const depsByParent = {}
  const depsByChildModel = {}
  const depsByChildVersion = {}
  for (const d of deps) {
    ;(depsByParent[`${d.env}|${d.parentVersionId}`] ??= []).push(d)
    ;(depsByChildModel[d.childModelId] ??= []).push(d)
    ;(depsByChildVersion[d.childVersionId] ??= []).push(d)
  }

  const workItems = (raw.work_items ?? []).map(w => ({
    id: w.id, versionId: w.model_version_id, modelId: w.model_id, version: w.version,
    modelName: modelById[w.model_id]?.name,
    consultant: w.consultant, note: w.description, ticket: w.ticket, status: w.status,
    createdAt: w.created_at, updatedAt: w.updated_at,
  }))
  const workByVersion = {}
  for (const w of workItems) (workByVersion[w.versionId] ??= []).push(w)

  const chains = [...(raw.chains ?? [])]
    .map(c => ({ id: c.id, key: c.key, label: c.label, rootModelId: c.root_model_id }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const chainByKey = Object.fromEntries(chains.map(c => [c.key, c]))

  const releases = releasesRaw.map(r => ({
    id: r.id, env: r.environments?.name, envId: r.environment_id,
    deployedAt: r.deployed_at, ticket: r.ticket, testedBy: r.tested_by, notes: r.notes,
    deployedBy: r.deployed_by, rolledBackAt: r.rolled_back_at, rolledBackBy: r.rolled_back_by,
    rollbackReason: r.rollback_reason,
    versions: (r.deployment_log_versions ?? []).map(v => ({
      role: v.role, versionId: v.model_version_id, wasPresent: v.was_present,
      modelId: v.model_versions?.model_id, modelName: v.model_versions?.models?.name,
      type: v.model_versions?.models?.type, version: v.model_versions?.version,
    })),
    deps: (r.deployment_log_dependencies ?? []).map(k => ({
      parentVersionId: k.parent_version_id, parentName: k.parent?.models?.name, parentVersion: k.parent?.version,
      childModelId: k.child_model_id, childName: k.child?.name,
      oldVersionId: k.old_child_version_id, oldVersion: k.oud?.version,
      newVersionId: k.new_child_version_id, newVersion: k.nieuw?.version,
    })),
  }))

  const activity = activityRaw.map(a => ({
    id: a.id, at: a.at, user: a.user_email, action: a.action, summary: a.summary, details: a.details,
    modelId: a.model_id, versionId: a.model_version_id, envId: a.environment_id, logId: a.deployment_log_id,
  }))

  return {
    loadedAt: raw.loaded_at,
    orgId: raw.organization_id,
    envs, ENVS: envs.map(e => e.name),
    envId:   name => envByName[name],
    envName: id   => envById[id],

    models, modelById,
    model: id => modelById[id],

    versions, versionById,
    version:    id => versionById[id],
    versionsOf: modelId => versionsByModel[modelId] ?? [],
    findVersion: (modelId, version) => (versionsByModel[modelId] ?? []).find(v => v.version === version),

    current: (modelId, env) => current[`${modelId}:${env}`],
    isPresent: (versionId, env) => present[`${versionId}:${env}`] !== undefined,
    presentSince: (versionId, env) => present[`${versionId}:${env}`],
    presentEnvs: versionId => ENVS.filter(e => present[`${versionId}:${e}`] !== undefined),

    deps,
    callsOf:   (env, parentVersionId) => depsByParent[`${env}|${parentVersionId}`] ?? [],
    callersOf: (childModelId, env) => (depsByChildModel[childModelId] ?? []).filter(d => !env || d.env === env),
    callersOfVersion: (childVersionId, env) => (depsByChildVersion[childVersionId] ?? []).filter(d => !env || d.env === env),
    usesInterface: versionId => deps.filter(d => d.ifaceVersionId === versionId),

    workItems,
    workOf: versionId => workByVersion[versionId] ?? [],

    chains, chainByKey,
    chain: key => chainByKey[key],

    releases, activity,
  }
}
