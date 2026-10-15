// Wat gaat een actie precies doen? Elke functie hier rekent, puur op de
// snapshot, uit welke rijen een actie raakt en levert twee dingen: de regels
// voor de preview ("Dit gaat er gebeuren") en de parameters voor de
// databasefunctie. Preview en uitvoering delen dus dezelfde afleiding.
//
// Een plan: { titel, kan, reden, groepen: [{ kop, regels: [{ tekst, oud, nieuw, soort }] }],
//             waarschuwingen: [tekst], params }

import { vergelijkVersies, isGeldigeVersie } from './versies.js'
import { ENVS } from './snapshot.js'

const VOLGENDE = { TST: 'ACC', ACC: 'PROD' }
const VORIGE   = { ACC: 'TST', PROD: 'ACC' }

export function promotieRichtingen(node) {
  const v = node.versions
  return {
    ACC:  Boolean(v.TST && v.TST !== v.ACC),
    PROD: Boolean(v.ACC && v.ACC !== v.PROD),
  }
}

const label = (snap, versionId) => snap.version(versionId)?.label ?? '?'

// ─── Registreren ──────────────────────────────────────────────────────────────

// De keuzes die het formulier standaard voorstelt
export function registerVoorstel({ snap, ketens, node, chainKey }) {
  const envTST = snap.envId('TST')

  // Aanroepen overnemen van: de versie die deze node draait, TST eerst
  const erfKandidaten = []
  for (const env of ['TST', 'ACC', 'PROD']) {
    const vid = node.versionIds[env]
    if (!vid || erfKandidaten.some(k => k.versionId === vid && k.env === env)) continue
    const aantal = snap.callsOf(env, vid).length
    erfKandidaten.push({ versionId: vid, env, envId: snap.envId(env), label: `${node.versions[env]} zoals in ${env}`, aantal })
  }

  // Wie roept deze node in TST aan? Eerst de ouders in deze keten, dan die in
  // andere ketens (ook die daar echt draaien), dan historische aanroepen.
  const callers = []
  const gezien = new Set()
  for (const { parent, iface } of node.parentLinks) {
    const pv = parent.versionIds.TST
    if (!pv || gezien.has(pv)) continue
    gezien.add(pv)
    callers.push({
      parentVersionId: pv, parentLabel: `${parent.label} ${parent.versions.TST}`,
      interfaceVersionId: iface?.versionIds.TST ?? null,
      ketens: [chainKey], inKeten: true, standaard: true,
    })
  }
  for (const d of snap.callersOf(node.modelId, 'TST')) {
    if (gezien.has(d.parentVersionId)) continue
    gezien.add(d.parentVersionId)
    const waar = ketens.ketensVanVersie('TST', d.parentVersionId)
    callers.push({
      parentVersionId: d.parentVersionId, parentLabel: `${d.parentName} ${d.parentVersion}`,
      interfaceVersionId: d.ifaceVersionId, huidig: d.childVersion,
      ketens: waar, inKeten: false, historisch: waar.length === 0, standaard: false,
    })
  }

  return { envId: envTST, erfKandidaten, callers }
}

export function planRegister({ snap, node, form }) {
  const { version, consultant, ticket, description, erfVan, callers } = form
  const v = (version ?? '').trim()
  const groepen = []
  const waarschuwingen = []
  let kan = true, reden = null

  if (!v) { kan = false; reden = 'Vul een versienummer in' }
  else if (snap.findVersion(node.modelId, v)) { kan = false; reden = `Versie ${v} van ${node.label} bestaat al. Hang er werk aan met "+ Werk", of promoveer hem.` }
  else if (!isGeldigeVersie(v)) waarschuwingen.push(`"${v}" heeft niet de vorm jj.mm.dd (eventueel met toevoeging). Klopt dat?`)
  if (kan && !consultant?.trim()) { kan = false; reden = 'Vul in wie eraan werkt' }
  if (kan && !ticket?.trim())     { kan = false; reden = 'Vul een ticketnummer in' }

  groepen.push({ kop: 'Versie', regels: [
    { soort: 'versie', tekst: `${node.label} ${v || '…'} wordt aanwezig in TST`, nieuw: 'nieuw' },
  ] })

  if (erfVan) {
    const aanroepen = snap.callsOf(erfVan.env, erfVan.versionId)
    groepen.push({ kop: `Aanroepen overgenomen van ${node.label} ${erfVan.label}`, regels:
      aanroepen.length === 0
        ? [{ soort: 'info', tekst: 'Die versie roept daar niets aan' }]
        : aanroepen.map(d => ({ soort: 'aanroep', tekst: `${d.childName}`, nieuw: `${d.childVersion} via ${d.ifaceName} ${d.ifaceVersion}` })),
    })
  } else {
    groepen.push({ kop: 'Aanroepen overgenomen', regels: [{ soort: 'info', tekst: 'Geen: de nieuwe versie roept nog niets aan. Leg dat daarna vast bij Aanroepen.' }] })
  }

  const gekozen = callers.filter(c => c.gekozen)
  if (gekozen.length) {
    groepen.push({ kop: 'Ouders die deze versie gaan aanroepen (TST)', regels: gekozen.map(c => {
      const bestaand = snap.callersOf(node.modelId, 'TST').find(d => d.parentVersionId === c.parentVersionId)
      return { soort: 'aanroep', tekst: c.parentLabel, oud: bestaand?.childVersion ?? null, nieuw: v,
               extra: c.inKeten ? null : (c.historisch ? 'niet in een keten in gebruik' : `keten ${c.ketens.join(', ')}`) }
    }) })
    const anders = gekozen.filter(c => !c.inKeten && !c.historisch)
    if (anders.length) waarschuwingen.push(`Dit raakt ook ${anders.map(c => c.ketens.join(', ')).join(' en ')}: daar gaat de aanroep in TST mee.`)
  } else if (node.parentLinks.length) {
    waarschuwingen.push('Geen enkele ouder gaat deze versie aanroepen: hij verschijnt dan niet in de keten tot je een aanroep vastlegt.')
  }

  groepen.push({ kop: 'Werk', regels: [
    { soort: 'werk', tekst: `${consultant || '…'} · ${ticket || '…'}${description ? ` · ${description}` : ''}`, nieuw: 'In uitvoering' },
  ] })

  return {
    titel: `${node.label} ${v || '…'} registreren in TST`,
    kan, reden, groepen, waarschuwingen,
    params: {
      modelId: node.modelId, version: v, envId: form.envId,
      consultant: consultant?.trim(), ticket: ticket?.trim(), description: description?.trim() ?? '',
      inheritFrom: erfVan ? [{ versionId: erfVan.versionId, envId: erfVan.envId }] : [],
      callers: gekozen.map(c => ({ parentVersionId: c.parentVersionId, interfaceVersionId: c.interfaceVersionId })),
    },
  }
}

// ─── Promoveren ───────────────────────────────────────────────────────────────

// Andere aanroepers van dit model in de doelomgeving: in andere ketens (die
// daar echt draaien) en historisch. Het formulier biedt ze als vinkjes aan.
export function extraAanroepers({ snap, ketens, node, target, chainKey }) {
  const eigen = new Set(node.parentLinks.map(l => l.parent.versionIds[target]).filter(Boolean))
  const lijst = []
  const gezien = new Set()
  for (const d of snap.callersOf(node.modelId, target)) {
    if (eigen.has(d.parentVersionId) || gezien.has(d.parentVersionId)) continue
    gezien.add(d.parentVersionId)
    const waar = ketens.ketensVanVersie(target, d.parentVersionId).filter(k => k !== chainKey)
    lijst.push({
      parentVersionId: d.parentVersionId, parentLabel: `${d.parentName} ${d.parentVersion}`,
      interfaceVersionId: d.ifaceVersionId, huidig: d.childVersion,
      ketens: waar, historisch: waar.length === 0,
    })
  }
  return lijst.sort((a, b) => a.historisch - b.historisch)
}

// Eén node, of met alles eronder. extra = gekozen extraAanroepers.
export function planPromotie({ snap, ketens, graaf, chainKey, node, target, metOnderliggende = false, extra = [], ticket, testedBy }) {
  const from = VORIGE[target]
  const envId = snap.envId(target)
  const groepen = []
  const waarschuwingen = []
  const versions = []
  const koppelingen = []
  const kopKeys = new Set()
  let kan = true, reden = null

  const voegKoppeling = k => {
    const key = `${k.parentVersionId}|${k.childVersionId}`
    if (kopKeys.has(key)) return
    kopKeys.add(key)
    koppelingen.push(k)
  }

  // Welke nodes gaan mee?
  const teNemen = metOnderliggende ? onderliggende(graaf, node) : [node]
  const modelIds = new Set(teNemen.map(n => n.modelId))

  const versieRegels = []
  for (const n of teNemen) {
    const naar = n.versionIds[from]
    const van  = n.versionIds[target]
    if (!naar) {
      if (n === node) { kan = false; reden = `${n.label} draait niet in ${from}` }
      continue
    }
    if (naar !== van) {
      versions.push({ naar, van: van ?? null })
      const cmp = vergelijkVersies(n.versions[from], n.versions[target])
      if (van && cmp === -1) waarschuwingen.push(`${n.label}: ${n.versions[from]} is ouder dan ${n.versions[target]} die nu in ${target} staat.`)
      versieRegels.push({ soort: 'versie', tekst: n.label, oud: n.versions[target] ?? null, nieuw: n.versions[from],
                          extra: snap.isPresent(naar, target) ? `stond al in ${target}` : null })
    }
    // Wat deze versie zelf aanroept, gaat mee naar de doelomgeving
    for (const d of snap.callsOf(from, naar)) {
      if (metOnderliggende && !modelIds.has(d.childModelId)) continue
      voegKoppeling({ parentVersionId: naar, interfaceVersionId: d.ifaceVersionId, childVersionId: d.childVersionId, ontbreekt: d.ontbreekt,
                      _label: `${n.label} ${n.versions[from]} → ${d.childName}`, _nieuw: d.childVersion, _iface: `${d.ifaceName} ${d.ifaceVersion}` })
      if (!metOnderliggende && !snap.isPresent(d.childVersionId, target) && !ketens.draaitIn(target, d.childVersionId)) {
        waarschuwingen.push(`${d.childName} ${d.childVersion} wordt daarna in ${target} aangeroepen maar staat daar nog niet. Promoveer met onderliggende modellen, of promoveer die apart.`)
      }
    }
  }
  if (versieRegels.length === 0 && kan) {
    // Alleen de aanroep van de ouder omzetten kan ook, maar meestal is dit "al gelijk"
  }
  groepen.push({ kop: `Versies naar ${target}`, regels: versieRegels.length ? versieRegels : [{ soort: 'info', tekst: `Geen versies te activeren: ${node.label} staat al op ${node.versions[target] ?? '—'} in ${target}` }] })

  // De ouders in de doelomgeving laten de nieuwe versie aanroepen
  const naarNode = node.versionIds[from]
  const ouderRegels = []
  for (const { parent, iface } of node.parentLinks) {
    const ouderNaar = parent.versionIds[target]
    if (!ouderNaar) {
      waarschuwingen.push(`${parent.label} draait nog niet in ${target}. ${node.label} wordt daar wel aanwezig, maar verschijnt pas in de keten als je ${parent.label} ook promoveert.`)
      continue
    }
    const bestaand = snap.callersOf(node.modelId, target).find(d => d.parentVersionId === ouderNaar)
    const ifaceId  = bestaand?.ifaceVersionId ?? iface?.versionIds[target] ?? iface?.versionIds[from]
    if (!ifaceId) { waarschuwingen.push(`Geen interface bekend tussen ${parent.label} en ${node.label} in ${target}.`); continue }
    if (naarNode) {
      voegKoppeling({ parentVersionId: ouderNaar, interfaceVersionId: ifaceId, childVersionId: naarNode,
                      _label: `${parent.label} ${parent.versions[target]} → ${node.label}`, _nieuw: node.versions[from], _oud: bestaand?.childVersion ?? null })
    }
  }
  for (const e of extra) {
    if (!naarNode) break
    voegKoppeling({ parentVersionId: e.parentVersionId, interfaceVersionId: e.interfaceVersionId, childVersionId: naarNode,
                    _label: `${e.parentLabel} → ${node.label}`, _nieuw: node.versions[from], _oud: e.huidig,
                    _extra: e.historisch ? 'niet in een keten in gebruik' : `keten ${e.ketens.join(', ')}` })
  }

  // Alleen wat echt verandert
  const aanroepRegels = []
  let gelijk = 0
  const definitief = []
  for (const k of koppelingen) {
    const childModelId = snap.version(k.childVersionId)?.modelId
    const bestaand = snap.callersOf(childModelId, target).find(d => d.parentVersionId === k.parentVersionId)
    if (bestaand && bestaand.childVersionId === k.childVersionId && bestaand.ifaceVersionId === k.interfaceVersionId) { gelijk++; continue }
    definitief.push({ parentVersionId: k.parentVersionId, interfaceVersionId: k.interfaceVersionId, childVersionId: k.childVersionId, ontbreekt: k.ontbreekt ?? false })
    aanroepRegels.push({ soort: 'aanroep', tekst: k._label, oud: bestaand?.childVersion ?? k._oud ?? null, nieuw: k._nieuw, extra: k._extra ?? null })
  }
  if (aanroepRegels.length || gelijk) {
    groepen.push({ kop: `Aanroepen in ${target}`, regels: [
      ...aanroepRegels,
      ...(gelijk ? [{ soort: 'info', tekst: `${gelijk} aanroep${gelijk === 1 ? '' : 'en'} blij${gelijk === 1 ? 'ft' : 'ven'} zoals ${gelijk === 1 ? 'hij' : 'ze'} al ${gelijk === 1 ? 'staat' : 'staan'}` }] : []),
    ] })
  }
  const andereKetens = extra.filter(e => !e.historisch).flatMap(e => e.ketens)
  if (andereKetens.length) waarschuwingen.push(`Dit raakt ook ${[...new Set(andereKetens)].join(', ')}.`)

  // Werk dat van status verandert
  const naarStatus = target === 'PROD' ? 'DONE' : 'REVIEW'
  const vanStatussen = target === 'PROD' ? ['IN_PROGRESS', 'REVIEW'] : ['IN_PROGRESS']
  const werkRegels = versions.flatMap(v => snap.workOf(v.naar).filter(w => vanStatussen.includes(w.status))
    .map(w => ({ soort: 'werk', tekst: `${w.modelName} ${w.version} · ${w.consultant}${w.ticket ? ` · ${w.ticket}` : ''}`,
                 oud: STATUS_LABEL[w.status], nieuw: STATUS_LABEL[naarStatus] })))
  if (werkRegels.length) groepen.push({ kop: 'Werk', regels: werkRegels })

  if (kan && versions.length === 0 && definitief.length === 0) { kan = false; reden = `Alles staat al gelijk in ${target}` }
  if (kan && !ticket?.trim())   { kan = false; reden = 'Vul een ticketnummer in' }
  if (kan && !testedBy?.trim()) { kan = false; reden = 'Vul in wie het heeft getest' }

  const wat = metOnderliggende ? `${node.label} met onderliggende modellen` : `${node.label} ${node.versions[from] ?? ''}`
  return {
    titel: `${wat} promoveren naar ${target}`,
    kan, reden, groepen, waarschuwingen,
    params: { envId, ticket: ticket?.trim(), testedBy: testedBy?.trim(), notes: null, versions, koppelingen: definitief },
    samenvatting: `${versions.length} versie${versions.length === 1 ? '' : 's'}, ${definitief.length} aanroep${definitief.length === 1 ? '' : 'en'}`,
  }
}

// De hele keten in één keer
export function planKetenPromotie({ snap, ketens, graaf, chainKey, target, ticket, testedBy }) {
  const root = graaf.nodes.find(n => n.isWortel)
  if (!root) return { titel: 'Keten promoveren', kan: false, reden: 'Geen hoofdmodel', groepen: [], waarschuwingen: [], params: null }
  const plan = planPromotie({ snap, ketens, graaf, chainKey, node: root, target, metOnderliggende: true, ticket, testedBy })
  const andere = new Set()
  for (const n of graaf.nodes) for (const k of ketens.ketensVanModel(n.modelId)) if (k !== chainKey) andere.add(k)
  if (andere.size) plan.waarschuwingen.push(`Modellen uit deze keten worden ook gebruikt in ${[...andere].map(k => snap.chain(k)?.label ?? k).join(', ')}; daar verandert niets.`)
  plan.titel = `Keten ${snap.chain(chainKey)?.label ?? chainKey} promoveren naar ${target}`
  return plan
}

// Alle nodes onder (en inclusief) een node, in de graaf
function onderliggende(graaf, node) {
  const uit = {}
  for (const e of graaf.edges) (uit[e.source] ??= []).push(e.target)
  const perId = Object.fromEntries(graaf.nodes.map(n => [n.id, n]))
  const res = []
  const gezien = new Set()
  const stapel = [node.id]
  while (stapel.length) {
    const id = stapel.pop()
    if (gezien.has(id)) continue
    gezien.add(id)
    if (perId[id]) res.push(perId[id])
    for (const t of uit[id] ?? []) stapel.push(t)
  }
  return res
}

export const STATUS_LABEL = { IN_PROGRESS: 'In uitvoering', REVIEW: 'In review', DONE: 'Afgerond' }

// ─── Terugdraaien ─────────────────────────────────────────────────────────────

export function planRollback({ snap, release, reason }) {
  const groepen = []
  const waarschuwingen = []
  let kan = true, reden = null

  if (release.rolledBackAt) { kan = false; reden = 'Deze release is al teruggedraaid' }

  // Een nieuwere, niet-teruggedraaide release over dezelfde modellen blokkeert
  const modellen = new Set([...release.versions.map(v => v.modelId), ...release.deps.map(d => d.childModelId)])
  const nieuwer = snap.releases.find(r => r.env === release.env && !r.rolledBackAt && new Date(r.deployedAt) > new Date(release.deployedAt)
    && (r.versions.some(v => modellen.has(v.modelId)) || r.deps.some(d => modellen.has(d.childModelId))))
  if (kan && nieuwer) {
    kan = false
    reden = `Er is hierna een nieuwere release over dezelfde modellen gegaan (${datum(nieuwer.deployedAt)}, ticket ${nieuwer.ticket ?? '-'}). Draai die eerst terug.`
  }

  const deployed = release.versions.filter(v => v.role === 'DEPLOYED')
  const replaced = release.versions.filter(v => v.role === 'REPLACED')
  groepen.push({ kop: `Versies in ${release.env}`, regels: deployed.map(v => {
    const terug = replaced.find(r => r.modelId === v.modelId)
    return { soort: 'versie', tekst: v.modelName, oud: v.version, nieuw: terug?.version ?? (v.wasPresent ? `${v.version} blijft aanwezig, niet meer actueel` : 'weg uit ' + release.env) }
  }) })
  if (release.deps.length) {
    groepen.push({ kop: 'Aanroepen terug', regels: release.deps.map(d => ({
      soort: 'aanroep', tekst: `${d.parentName} ${d.parentVersion} → ${d.childName}`,
      oud: d.newVersion, nieuw: d.oldVersion ?? 'aanroep weg',
    })) })
  }
  if (kan && !reason?.trim()) { kan = false; reden = 'Geef een reden voor het terugdraaien' }

  return {
    titel: `Release naar ${release.env} van ${datum(release.deployedAt)} terugdraaien`,
    kan, reden, groepen, waarschuwingen,
    params: { logId: release.id, reason: reason?.trim() },
  }
}

// ─── Versie verwijderen ───────────────────────────────────────────────────────

export function planDelete({ snap, versionId }) {
  const v = snap.version(versionId)
  const groepen = []
  const waarschuwingen = []
  let kan = true, reden = null
  if (!v) return { titel: 'Versie verwijderen', kan: false, reden: 'Versie niet gevonden', groepen, waarschuwingen, params: null }
  const model = snap.model(v.modelId)

  const inRelease = snap.releases.find(r => r.versions.some(x => x.versionId === versionId)
    || r.deps.some(d => d.parentVersionId === versionId || d.oldVersionId === versionId || d.newVersionId === versionId))
  if (inRelease) { kan = false; reden = `${v.label} zit in een release (${datum(inRelease.deployedAt)} naar ${inRelease.env}). Releases blijven staan; draai hem eventueel terug, maar de versie blijft bestaan.` }

  const envs = snap.presentEnvs(versionId)
  const buitenTst = envs.filter(e => e !== 'TST')
  if (kan && buitenTst.length) { kan = false; reden = `${v.label} staat in ${buitenTst.join(' en ')}. Verwijderen kan alleen voor een versie die alleen in TST staat.` }

  const alsInterface = snap.usesInterface(versionId)
  if (kan && alsInterface.length) { kan = false; reden = `${v.label} wordt als interface gebruikt in ${alsInterface.length} aanroep(en). Wijzig die eerst.` }

  groepen.push({ kop: 'Versie', regels: [{ soort: 'versie', tekst: v.label, oud: envs.length ? `aanwezig in ${envs.join(', ')}` : 'nergens aanwezig', nieuw: 'weg' }] })

  const aanroepers = snap.callersOfVersion(versionId)
  if (aanroepers.length) {
    const zonder = aanroepers.filter(d => !d.previousChildVersionId)
    if (kan && zonder.length) {
      kan = false
      reden = `${v.label} wordt nog aangeroepen door ${zonder.map(d => `${d.parentName} ${d.parentVersion} (${d.env})`).join(', ')} en er is geen vorige versie om op terug te vallen. Zet die aanroepen eerst om.`
    }
    groepen.push({ kop: 'Aanroepers vallen terug', regels: aanroepers.map(d => ({
      soort: 'aanroep', tekst: `${d.parentName} ${d.parentVersion} (${d.env})`, oud: v.version,
      nieuw: d.previousChildVersionId ? snap.version(d.previousChildVersionId)?.version : 'geen vorige versie',
    })) })
    if (kan && aanroepers.some(d => d.previousChildVersionId)) waarschuwingen.push('Na dit terugvallen is er geen vorige versie meer bekend; die versie is dan niet nog een keer op deze manier te verwijderen.')
  }

  const eigen = ENVS.flatMap(env => snap.callsOf(env, versionId))
  if (eigen.length) groepen.push({ kop: 'Eigen aanroepen verdwijnen', regels: eigen.map(d => ({ soort: 'aanroep', tekst: `${d.childName} ${d.childVersion} (${d.env})`, nieuw: 'weg' })) })

  const werk = snap.workOf(versionId)
  if (werk.length) groepen.push({ kop: 'Werk verdwijnt', regels: werk.map(w => ({ soort: 'werk', tekst: `${w.consultant}${w.ticket ? ` · ${w.ticket}` : ''}${w.note ? ` · ${w.note}` : ''}`, nieuw: 'weg' })) })

  return {
    titel: `${v.label} verwijderen`,
    kan, reden, groepen, waarschuwingen,
    params: { versionId },
  }
}

// ─── Aanroep vastleggen ───────────────────────────────────────────────────────

export function planKoppeling({ snap, parentNode, targets, ifaceModelId, ifaceVersion, childModelId, childVersion }) {
  const iface = snap.model(ifaceModelId)
  const child = snap.model(childModelId)
  const groepen = []
  const waarschuwingen = []
  let kan = true, reden = null
  if (!child)  { kan = false; reden = 'Kies een submodel' }
  else if (!iface) { kan = false; reden = 'Kies een interface' }
  else if (!ifaceVersion?.trim()) { kan = false; reden = 'Vul de interfaceversie in' }
  else if (!childVersion?.trim()) { kan = false; reden = 'Vul de versie van het submodel in' }
  else if (!targets.length) { kan = false; reden = 'Kies minstens één omgeving' }
  else if (childModelId === parentNode.modelId) { kan = false; reden = 'Een model kan zichzelf niet aanroepen' }

  if (child && !snap.findVersion(childModelId, childVersion?.trim())) waarschuwingen.push(`${child.name} ${childVersion} bestaat nog niet in de tool en wordt aangemaakt.`)
  if (iface && !snap.findVersion(ifaceModelId, ifaceVersion?.trim())) waarschuwingen.push(`${iface.name} ${ifaceVersion} bestaat nog niet in de tool en wordt aangemaakt.`)

  groepen.push({ kop: 'Aanroep', regels: targets.map(t => {
    const bestaand = child && snap.callersOf(childModelId, t.env).find(d => d.parentVersionId === t.parentVersionId)
    return { soort: 'aanroep', tekst: `${parentNode.label} ${t.parentVersion} (${t.env}) → ${child?.name ?? '…'}`,
             oud: bestaand ? `${bestaand.childVersion} via ${bestaand.ifaceName} ${bestaand.ifaceVersion}` : null,
             nieuw: `${childVersion ?? '…'} via ${iface?.name ?? '…'} ${ifaceVersion ?? ''}` }
  }) })

  return {
    titel: `${child?.name ?? 'Aanroep'} vastleggen onder ${parentNode.label}`,
    kan, reden, groepen, waarschuwingen,
    params: { targets: targets.map(t => ({ envId: snap.envId(t.env), parentVersionId: t.parentVersionId })),
              interfaceModelId: ifaceModelId, interfaceVersion: ifaceVersion?.trim(), childModelId, childVersion: childVersion?.trim() },
  }
}

export function datum(iso, metTijd = false) {
  const d = new Date(iso)
  const s = d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: '2-digit' })
  return metTijd ? `${s} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : s
}
