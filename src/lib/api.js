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

  // Al het werk, per versie: in een keten hangt een model niet per se op zijn
  // actieve versie, en het werk dat je bij een node ziet hoort bij de versie die
  // die node draait. Ook afgerond werk: dat is achteraf nog relevant.
  const { data: workItems } = await supabase
    .from('work_items')
    .select('id, model_version_id, consultant, description, ticket, status, created_at, model_versions ( model_id, version )')
    .order('created_at')

  const versionMap = {}
  const mvIdMap    = {}
  for (const v of versions) {
    const k = `${v.model_id}:${v.env_name}`
    versionMap[k] = v.version
    mvIdMap[k]    = v.model_version_id
  }

  // Per model: versie -> werk. Lopend werk gaat voor afgerond, anders het nieuwste.
  const werkPerModel = {}
  for (const wi of (workItems || [])) {
    const mv = wi.model_versions
    if (!mv) continue
    const per = werkPerModel[mv.model_id] ??= {}
    if (per[mv.version] && per[mv.version].status !== 'DONE' && wi.status === 'DONE') continue
    per[mv.version] = {
      id: wi.id, consultant: wi.consultant, note: wi.description,
      ticket: wi.ticket, status: wi.status, createdAt: wi.created_at,
    }
  }

  const result = {}
  for (const c of chainsData) {
    result[c.key] = {
      label: c.label,
      nodes: c.chain_nodes.map(cn => {
        const m    = cn.models
        const werk = werkPerModel[m.id] ?? {}
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
          werkPerVersie: werk,
          workItem: werk[versionMap[`${m.id}:TST`]],
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
      id, deployed_at, ticket, tested_by, notes,
      environments ( name ),
      deployment_log_versions (
        role,
        model_versions ( version, models ( name, type ) )
      ),
      deployment_log_dependencies (
        parent: parent_version_id ( version, models ( name ) ),
        child:  child_model_id ( name ),
        oud:    old_child_version_id ( version ),
        nieuw:  new_child_version_id ( version )
      )
    `)
    .in('environment_id', envs.map(e => e.id))
    .order('deployed_at', { ascending: false })
    .limit(1000)

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

  // Releases die alleen een aanroep van dit model omzetten, horen er ook bij
  const { data: aanroepen, error: aanErr } = await supabase
    .from('deployment_log_dependencies')
    .select(`old_child_version_id, new_child_version_id,
             deployment_logs ( id, deployed_at, ticket, environments ( name ) )`)
    .eq('child_model_id', modelId)
  throwIf(aanErr)

  const perLog = {}
  const logVan = log => perLog[log.id] ??= {
    logId: log.id,
    env: log.environments?.name,
    wanneer: log.deployed_at,
    ticket: log.ticket,
    naar: null,
    van: null,
  }
  for (const r of regels ?? []) {
    if (!r.deployment_logs) continue
    const p = logVan(r.deployment_logs)
    if (r.role === 'DEPLOYED') p.naar = versiePerId[r.model_version_id]
    else                       p.van  = versiePerId[r.model_version_id]
  }
  for (const r of aanroepen ?? []) {
    if (!r.deployment_logs) continue
    const p = logVan(r.deployment_logs)
    p.naar ??= versiePerId[r.new_child_version_id]
    p.van  ??= versiePerId[r.old_child_version_id] ?? null
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

// ─── Koppelingen meenemen bij een nieuwe versie ───────────────────────────────
// De keten toont niet de eigen versie van een submodel, maar de versie waarmee
// zijn ouder hem aanroept — die staat in `dependencies`. Registreer je een
// versie in de tool, dan staat hij in eCon al zo aangeroepen; daarom wijzen we
// de koppelingen meteen mee. Zonder dit blijft de graph de oude versie tonen
// tot de volgende eCon-import, terwijl het detailpaneel al wel bijgewerkt is.
//
// aanroepers zijn de ouders van de aangeklikte node in de graph, met de versie
// waarop ze daar in deze omgeving draaien: [{ modelId, version }]. Alleen die
// koppelingen gaan om. Een submodel hangt vaak onder meerdere versies van
// dezelfde ouder (Profielmodel 23.11.23 en 25.03.06 roepen elk een eigen
// SubKaderModel aan); welke ouderversie "actief" is in de omgeving zegt dus
// niets over welke koppeling je bedoelt.
async function herkoppelAanroepers({ envId, childModelId, childVersionId, aanroepers }) {
  if (!aanroepers?.length) return    // hoofdmodel: gebruikt zijn eigen versie al

  // Alle aanroepen van dit model, in alle omgevingen: ontbreekt de aanroep hier
  // (bijvoorbeeld omdat de vorige versie is verwijderd), dan leggen we hem aan
  // naar het voorbeeld van een andere omgeving.
  const { data: rijen, error } = await supabase
    .from('dependencies')
    .select('id, environment_id, parent_version_id, interface_version_id, child_version_id, parent: parent_version_id ( model_id, version )')
    .eq('child_model_id', childModelId)
  throwIf(error)

  const vanOuder = a => r => r.parent?.model_id === a.modelId && r.parent?.version === a.version
  const teWijzigen = []
  for (const a of aanroepers) {
    const hier = (rijen ?? []).filter(r => r.environment_id === envId && vanOuder(a)(r))
    if (hier.length) {
      teWijzigen.push(...hier.filter(r => r.child_version_id !== childVersionId))
      continue
    }
    // Hetzelfde interface als waarmee deze ouderversie hem elders aanroept, anders
    // dat van een andere versie van de ouder
    const voorbeeld = (rijen ?? []).find(vanOuder(a)) ?? (rijen ?? []).find(r => r.parent?.model_id === a.modelId)
    if (!voorbeeld) continue
    let ouderId = vanOuder(a)(voorbeeld) ? voorbeeld.parent_version_id : null
    if (!ouderId) {
      const { data: mv, error: mvErr } = await supabase
        .from('model_versions').select('id')
        .eq('model_id', a.modelId).eq('version', a.version).maybeSingle()
      throwIf(mvErr)
      ouderId = mv?.id
    }
    if (!ouderId) continue
    throwIf((await supabase.from('dependencies').insert({
      environment_id:       envId,
      parent_version_id:    ouderId,
      interface_version_id: voorbeeld.interface_version_id,
      child_model_id:       childModelId,
      child_version_id:     childVersionId,
    })).error)
  }

  // De versie is net geregistreerd, dus hij bestaat: de ontbreekt-vlag vervalt.
  // Wat er stond onthouden we, zodat verwijderen van de nieuwe versie de aanroep
  // terugzet in plaats van hem weg te gooien (zie deleteModelVersion).
  for (const r of teWijzigen) {
    throwIf((await supabase
      .from('dependencies')
      .update({
        child_version_id:          childVersionId,
        previous_child_version_id: r.child_version_id,
        child_missing_in_export:   false,
      })
      .eq('id', r.id)).error)
  }
}

// ─── Koppelingen van de vorige versie overnemen ───────────────────────────────
// Een nieuwe versie in de tool heeft nog geen koppelingen: wat hij aanroept
// staat in eCon, en komt pas met de volgende export binnen. Tot die tijd gaan we
// ervan uit dat hij aanroept wat de vorige versie aanriep; zonder dat vallen al
// zijn submodellen in de graph weg ("—"). vorigen = [{ env, version }]: de
// versies die de node draait, deze omgeving eerst en dan die erboven. De eerste
// met koppelingen telt. Koppelingen die de nieuwe versie al heeft, blijven staan.
async function neemKoppelingenOver({ orgId, modelId, vorigen = [], naarEnvId, naarMvId }) {
  for (const vorige of vorigen) {
    if (!vorige?.version) continue

    const { data: vorigeMv, error: mvErr } = await supabase
      .from('model_versions').select('id')
      .eq('model_id', modelId).eq('version', vorige.version)
      .maybeSingle()
    throwIf(mvErr)

    const { data: vanEnv, error: envErr } = await supabase
      .from('environments').select('id')
      .eq('organization_id', orgId).eq('name', vorige.env).single()
    throwIf(envErr)

    // Dezelfde versie in dezelfde omgeving heeft niets over te dragen
    if (!vorigeMv || (vorigeMv.id === naarMvId && vanEnv.id === naarEnvId)) continue

    const { data: rijen, error } = await supabase
      .from('dependencies')
      .select('interface_version_id, child_model_id, child_version_id, child_missing_in_export')
      .eq('environment_id', vanEnv.id)
      .eq('parent_version_id', vorigeMv.id)
    throwIf(error)
    if (!rijen?.length) continue

    throwIf((await supabase.from('dependencies').upsert(
      rijen.map(r => ({ ...r, environment_id: naarEnvId, parent_version_id: naarMvId })),
      { onConflict: 'environment_id,parent_version_id,interface_version_id,child_model_id', ignoreDuplicates: true }
    )).error)
    return
  }
}

// ─── Nieuwe versie registreren ────────────────────────────────────────────────
export async function registerVersion({ modelName, envName, version, consultant, note, ticket, aanroepers, vorigen, orgSlug = 'buva' }) {
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

  await neemKoppelingenOver({ orgId, modelId: model.id, vorigen, naarEnvId: env.id, naarMvId: mv.id })
  await herkoppelAanroepers({ envId: env.id, childModelId: model.id, childVersionId: mv.id, aanroepers })

  if (consultant) {
    const { error } = await supabase
      .from('work_items')
      .insert({ model_version_id: mv.id, consultant, description: note || '', ticket: ticket || null, status: 'IN_PROGRESS' })
    throwIf(error)
  }
}

// ─── Promoveren ───────────────────────────────────────────────────────────────
// Een promotie zet in de doelomgeving twee dingen: welke versie er actief is, en
// welke versie de ouders aanroepen. Dat laatste is wat de graph toont; zonder
// dat zie je een gepromoveerd submodel in de doelomgeving niet terug. Beide
// werken op de keten zoals de graph hem toont, niet op het model als geheel:
// hetzelfde model kan in één keten onder verschillende ouders op verschillende
// versies hangen.

const DEP_SLEUTEL = 'environment_id,parent_version_id,interface_version_id,child_model_id'

// Versie-id's van een set modellen, opzoekbaar op "modelId|versie"
async function versieIds(modelIds) {
  const { data, error } = await supabase
    .from('model_versions').select('id, model_id, version')
    .in('model_id', [...new Set(modelIds)])
  throwIf(error)
  return Object.fromEntries((data ?? []).map(r => [`${r.model_id}|${r.version}`, r.id]))
}

// Eén release: versies activeren, koppelingen omzetten en vastleggen wat er
// stond, zodat rollbackDeployment beide kan terugdraaien.
// versies:     [{ naar, van }]  model_version-id's; van mag ontbreken
// koppelingen: [{ parent_version_id, interface_version_id, child_model_id,
//                 child_version_id, child_missing_in_export }]
async function legPromotieVast({ toEnvId, toEnv, ticket, testedBy, versies, koppelingen }) {
  // Elke release is herleidbaar: welk ticket, en wie heeft het getest
  if (!ticket?.trim())   throw new Error('Vul een ticketnummer in')
  if (!testedBy?.trim()) throw new Error('Vul in wie het heeft getest')

  // Wat stond er in de doelomgeving? Alleen echt gewijzigde koppelingen gaan om.
  const sleutel = k => `${k.parent_version_id}|${k.interface_version_id}|${k.child_model_id}`
  let oud = {}
  if (koppelingen.length) {
    const { data: bestaand, error } = await supabase
      .from('dependencies')
      .select('parent_version_id, interface_version_id, child_model_id, child_version_id, child_missing_in_export')
      .eq('environment_id', toEnvId)
      .in('parent_version_id', [...new Set(koppelingen.map(k => k.parent_version_id))])
    throwIf(error)
    oud = Object.fromEntries((bestaand ?? []).map(r => [sleutel(r), r]))
  }
  const uniek = Object.values(Object.fromEntries(koppelingen.map(k => [sleutel(k), k])))
  const gewijzigd = uniek.filter(k => oud[sleutel(k)]?.child_version_id !== k.child_version_id)

  const naarIds = [...new Set(versies.map(v => v.naar))]
  if (naarIds.length === 0 && gewijzigd.length === 0) {
    throw new Error(`Alles staat al gelijk in ${toEnv}`)
  }

  const { data: log, error: logErr } = await supabase
    .from('deployment_logs')
    .insert({ environment_id: toEnvId, ticket: ticket.trim(), tested_by: testedBy.trim() })
    .select('id').single()
  throwIf(logErr)

  const entries = []
  for (const naar of naarIds) {
    const van = versies.find(v => v.naar === naar)?.van
    entries.push({ deployment_log_id: log.id, model_version_id: naar, role: 'DEPLOYED' })
    if (van && van !== naar) entries.push({ deployment_log_id: log.id, model_version_id: van, role: 'REPLACED' })
  }
  if (entries.length) throwIf((await supabase.from('deployment_log_versions').insert(entries)).error)

  for (const mvId of naarIds) {
    await activateVersion(toEnvId, mvId)
    await bumpWorkItemStatus(mvId, toEnv)
  }

  if (gewijzigd.length === 0) return

  throwIf((await supabase.from('dependencies').upsert(
    gewijzigd.map(k => ({
      environment_id:          toEnvId,
      parent_version_id:       k.parent_version_id,
      interface_version_id:    k.interface_version_id,
      child_model_id:          k.child_model_id,
      child_version_id:        k.child_version_id,
      child_missing_in_export: k.child_missing_in_export ?? false,
    })),
    { onConflict: DEP_SLEUTEL }
  )).error)

  throwIf((await supabase.from('deployment_log_dependencies').insert(
    gewijzigd.map(k => ({
      deployment_log_id:    log.id,
      parent_version_id:    k.parent_version_id,
      interface_version_id: k.interface_version_id,
      child_model_id:       k.child_model_id,
      old_child_version_id: oud[sleutel(k)]?.child_version_id ?? null,
      old_child_missing:    oud[sleutel(k)]?.child_missing_in_export ?? false,
      new_child_version_id: k.child_version_id,
    }))
  )).error)
}

// ─── Eén node promoveren ──────────────────────────────────────────────────────
// version is de versie die de node in fromEnv heeft, vervangt die in toEnv.
// aanroepers zijn zijn ouders in de graph met hun versies per omgeving
// ([{ modelId, versions }]): in toEnv gaan zij deze versie aanroepen. Wat de
// versie zelf aanroept, komt mee uit fromEnv.
export async function promoteModel({ modelId, version, vervangt, fromEnv, toEnv, aanroepers = [], ticket, testedBy, orgSlug = 'buva' }) {
  const [fromEnvId, toEnvId] = await Promise.all([getEnvId(fromEnv, orgSlug), getEnvId(toEnv, orgSlug)])
  const ids  = await versieIds([modelId, ...aanroepers.map(a => a.modelId)])
  const naar = ids[`${modelId}|${version}`]
  if (!naar) throw new Error(`Versie ${version} niet gevonden`)

  const kolommen = 'parent_version_id, interface_version_id, child_model_id, child_version_id, child_missing_in_export'
  const [{ data: bron, error: e1 }, { data: doel, error: e2 }] = await Promise.all([
    supabase.from('dependencies').select(kolommen).eq('environment_id', fromEnvId)
      .or(`parent_version_id.eq.${naar},child_model_id.eq.${modelId}`),
    supabase.from('dependencies').select(kolommen).eq('environment_id', toEnvId)
      .eq('child_model_id', modelId),
  ])
  throwIf(e1); throwIf(e2)

  // Wat de gepromoveerde versie zelf aanroept
  const koppelingen = (bron ?? []).filter(r => r.parent_version_id === naar)

  // De ouders laten deze versie aanroepen, op hun versie in de doelomgeving. Het
  // interface komt van de bestaande koppeling daar, anders van die in de bron.
  for (const a of aanroepers) {
    const ouderNaar = ids[`${a.modelId}|${a.versions?.[toEnv]}`]
    if (!ouderNaar) continue                       // ouder draait daar (nog) niet
    const ouderVan = ids[`${a.modelId}|${a.versions?.[fromEnv]}`]
    const voorbeeld = (doel ?? []).find(r => r.parent_version_id === ouderNaar)
      ?? (bron ?? []).find(r => r.parent_version_id === ouderVan && r.child_model_id === modelId)
    if (!voorbeeld) continue
    koppelingen.push({
      parent_version_id:    ouderNaar,
      interface_version_id: voorbeeld.interface_version_id,
      child_model_id:       modelId,
      child_version_id:     naar,
    })
  }

  await legPromotieVast({
    toEnvId, toEnv, ticket, testedBy,
    versies: [{ naar, van: vervangt ? ids[`${modelId}|${vervangt}`] : null }],
    koppelingen,
  })
}

// ─── Hele keten promoveren ────────────────────────────────────────────────────
// nodes zijn de nodes uit de graph ([{ modelId, versions }]). Daarna loopt de
// keten in toEnv precies zoals in fromEnv: elke node die verschilt wordt
// gepromoveerd, en elke koppeling langs de keten gaat mee.
export async function promoteChain({ nodes, fromEnv, toEnv, ticket, testedBy, orgSlug = 'buva' }) {
  const [fromEnvId, toEnvId] = await Promise.all([getEnvId(fromEnv, orgSlug), getEnvId(toEnv, orgSlug)])
  const ids = await versieIds(nodes.map(n => n.modelId))
  const id  = (n, env) => ids[`${n.modelId}|${n.versions?.[env]}`]

  const versies = nodes
    .filter(n => n.versions?.[fromEnv] && n.versions[fromEnv] !== n.versions?.[toEnv] && id(n, fromEnv))
    .map(n => ({ naar: id(n, fromEnv), van: id(n, toEnv) }))

  // De koppelingen zoals de keten in fromEnv loopt
  const ouders  = [...new Set(nodes.map(n => id(n, fromEnv)).filter(Boolean))]
  const inKeten = new Set(nodes.map(n => n.modelId))
  const { data: rijen, error } = await supabase
    .from('dependencies')
    .select('parent_version_id, interface_version_id, child_model_id, child_version_id, child_missing_in_export')
    .eq('environment_id', fromEnvId)
    .in('parent_version_id', ouders)
  throwIf(error)
  const koppelingen = (rijen ?? []).filter(r => inKeten.has(r.child_model_id))

  await legPromotieVast({ toEnvId, toEnv, ticket, testedBy, versies, koppelingen })
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

  // Aanroepen naar deze versie vallen terug op de versie die er vóór de
  // registratie stond. Zonder vorige versie neemt de cascade ze mee.
  const { data: aanroepen, error: aanErr } = await supabase
    .from('dependencies')
    .select('id, previous_child_version_id')
    .eq('child_version_id', modelVersionId)
    .not('previous_child_version_id', 'is', null)
  throwIf(aanErr)
  for (const r of aanroepen ?? []) {
    throwIf((await supabase
      .from('dependencies')
      .update({ child_version_id: r.previous_child_version_id, previous_child_version_id: null })
      .eq('id', r.id)).error)
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
export async function updateDeploymentLog({ id, ticket, testedBy, notes }) {
  const patch = {}
  if (ticket   !== undefined) patch.ticket    = ticket || null
  if (testedBy !== undefined) patch.tested_by = testedBy || null
  if (notes    !== undefined) patch.notes     = notes || null
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

// ─── Koppeling toevoegen of wijzigen ──────────────────────────────────────────
// Leg vast dat een ouderversie via een interface een submodel aanroept, per
// omgeving. Zo houd je de koppelingen met de hand bij nu de tool leidend is.
// envs: [{ env, parentVersion }]. Versies die nog niet bestaan, komen erbij.
// Per ouderversie en submodel is er één aanroep: een andere interfaceversie
// vervangt de oude. Kent de keten het submodel of de interface nog niet, dan
// komen ze erbij, zodat de graph ze toont.
export async function legKoppelingVast({ chainKey, parentModelId, parentNodeKey, envs, ifaceModelId, ifaceVersion, childModelId, childVersion, orgSlug = 'buva' }) {
  if (!envs?.length)          throw new Error('Kies minstens één omgeving')
  if (!ifaceVersion?.trim())  throw new Error('Vul de interfaceversie in')
  if (!childVersion?.trim())  throw new Error('Vul de versie van het submodel in')
  const orgId = await getOrgId(orgSlug)

  const zorgVoorVersie = async (modelId, version) => {
    const { data, error } = await supabase
      .from('model_versions')
      .upsert({ model_id: modelId, version: version.trim() }, { onConflict: 'model_id,version' })
      .select('id').single()
    throwIf(error)
    return data.id
  }
  const ifaceMv = await zorgVoorVersie(ifaceModelId, ifaceVersion)
  const childMv = await zorgVoorVersie(childModelId, childVersion)

  const { data: omgevingen, error: envErr } = await supabase
    .from('environments').select('id, name').eq('organization_id', orgId)
  throwIf(envErr)
  const envId = Object.fromEntries((omgevingen ?? []).map(e => [e.name, e.id]))

  for (const { env, parentVersion } of envs) {
    const { data: ouder, error: pvErr } = await supabase
      .from('model_versions').select('id')
      .eq('model_id', parentModelId).eq('version', parentVersion).single()
    throwIf(pvErr)

    // Een aanroep met een andere interfaceversie gaat eruit
    throwIf((await supabase.from('dependencies').delete()
      .eq('environment_id', envId[env])
      .eq('parent_version_id', ouder.id)
      .eq('child_model_id', childModelId)
      .neq('interface_version_id', ifaceMv)).error)

    throwIf((await supabase.from('dependencies').upsert({
      environment_id:            envId[env],
      parent_version_id:         ouder.id,
      interface_version_id:      ifaceMv,
      child_model_id:            childModelId,
      child_version_id:          childMv,
      child_missing_in_export:   false,
      previous_child_version_id: null,
    }, { onConflict: 'environment_id,parent_version_id,interface_version_id,child_model_id' })).error)
  }

  // De keten moet interface en submodel kennen, anders tekent de graph ze niet
  const { data: keten, error: kErr } = await supabase
    .from('chains')
    .select('id, chain_nodes ( node_key, model_id )')
    .eq('organization_id', orgId).eq('key', chainKey).single()
  throwIf(kErr)
  const keys = (keten.chain_nodes ?? []).map(n => n.node_key)
  const sleutelVan = async modelId => {
    const bestaand = keten.chain_nodes.find(n => n.model_id === modelId)
    if (bestaand) return bestaand.node_key
    const { data: m, error } = await supabase.from('models').select('name').eq('id', modelId).single()
    throwIf(error)
    const key = keys.includes(m.name) ? `${m.name}_${keys.length}` : m.name
    throwIf((await supabase.from('chain_nodes').insert({ chain_id: keten.id, node_key: key, model_id: modelId })).error)
    keys.push(key)
    keten.chain_nodes.push({ node_key: key, model_id: modelId })
    return key
  }
  const ifaceKey = await sleutelVan(ifaceModelId)
  const childKey = await sleutelVan(childModelId)
  throwIf((await supabase.from('chain_edges').upsert(
    [{ chain_id: keten.id, source_key: parentNodeKey, target_key: ifaceKey },
     { chain_id: keten.id, source_key: ifaceKey,      target_key: childKey }],
    { onConflict: 'chain_id,source_key,target_key', ignoreDuplicates: true }
  )).error)
}

// ─── Eén koppeling weghalen ───────────────────────────────────────────────────
// Een aanroep van een ouderversie naar een submodel, in één omgeving. Alleen in
// de tool: staat de aanroep in eCon nog, dan brengt de volgende export hem terug.
export async function deleteDependency(id) {
  const { error } = await supabase.from('dependencies').delete().eq('id', id)
  throwIf(error)
}

// ─── Promotie terugdraaien ────────────────────────────────────────────────────
// Zet de vervangen versies weer actief, haalt de gepromoveerde versies uit de
// omgeving, zet de omgezette aanroepen terug en verwijdert de release-regel.
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

  const { data: koppelingen, error: kopErr } = await supabase
    .from('deployment_log_dependencies')
    .select('parent_version_id, interface_version_id, child_model_id, old_child_version_id, old_child_missing')
    .eq('deployment_log_id', logId)
  throwIf(kopErr)

  if (deployed.length === 0 && !koppelingen?.length) {
    throw new Error('Deze release bevat niets om terug te draaien')
  }

  // Welke modellen raakt deze release?
  const { data: mvRows } = await supabase
    .from('model_versions')
    .select('id, model_id')
    .in('id', [...deployed, ...replaced])
  const touchedModels = new Set([
    ...(mvRows || []).map(r => r.model_id),
    ...(koppelingen ?? []).map(k => k.child_model_id),
  ])

  // Blokkeer als er voor dezelfde omgeving een nieuwere release over dezelfde
  // modellen heen is gegaan — anders draai je een tussenliggende stap terug.
  const { data: newer } = await supabase
    .from('deployment_logs')
    .select('id, deployed_at, deployment_log_versions ( model_version_id ), deployment_log_dependencies ( child_model_id )')
    .eq('environment_id', log.environment_id)
    .gt('deployed_at', log.deployed_at)

  if (newer?.length) {
    const newerMvIds = newer.flatMap(l => l.deployment_log_versions.map(v => v.model_version_id))
    const { data: newerMv } = newerMvIds.length
      ? await supabase.from('model_versions').select('model_id').in('id', newerMvIds)
      : { data: [] }
    const newerModels = [
      ...(newerMv || []).map(r => r.model_id),
      ...newer.flatMap(l => (l.deployment_log_dependencies ?? []).map(k => k.child_model_id)),
    ]
    if (newerModels.some(m => touchedModels.has(m))) {
      throw new Error('Er is hierna een nieuwere release over dezelfde modellen gegaan. Draai die eerst terug.')
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

  // Aanroepen terugzetten zoals ze vóór de promotie stonden; een koppeling die
  // de promotie zelf had aangelegd, gaat weer weg
  for (const k of koppelingen ?? []) {
    const waar = q => q
      .eq('environment_id', log.environment_id)
      .eq('parent_version_id', k.parent_version_id)
      .eq('interface_version_id', k.interface_version_id)
      .eq('child_model_id', k.child_model_id)
    const { error } = k.old_child_version_id
      ? await waar(supabase.from('dependencies').update({
          child_version_id: k.old_child_version_id, child_missing_in_export: k.old_child_missing,
        }))
      : await waar(supabase.from('dependencies').delete())
    throwIf(error)
  }

  // Werk items terugzetten naar de status van vóór de promotie
  await revertWorkItemStatus(deployed, log.environments?.name)

  // Release-regel weg (deployment_log_versions gaat mee via cascade)
  const { error: logDelErr } = await supabase.from('deployment_logs').delete().eq('id', logId)
  throwIf(logDelErr)

  return { restored: replaced.length, removed: deployed.length }
}
