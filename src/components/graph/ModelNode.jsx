import { Handle, Position } from 'reactflow'
import { versieStatus, ENVS } from '../../lib/chainUtils.js'
import { MODEL_W } from './layout.js'
import { ENV, ORANJE, VIOLET, ROOD } from '../../lib/kleuren.js'

// Loopt een omgeving voor, dan krijgt hij zijn eigen kleur — zo zie je meteen
// hóé ver iets is doorgezet. Achterlopen is altijd oranje, want dat is de
// situatie die aandacht vraagt. Elke kleur is een familie uit lib/kleuren.js.
function familieVan(env, status) {
  if (status === 'voor')   return ENV[env]
  if (status === 'achter') return ORANJE
  if (status === 'anders') return VIOLET
  return null
}

const TEKEN = { voor: '↑', achter: '↓', anders: '≠' }

export default function ModelNode({ data, selected }) {
  const isShared   = data.sharedIn?.length > 0
  const mistExport = data.ontbreekt?.length > 0

  const statussen = Object.fromEntries(
    ENVS.map(env => [env, env === 'PROD' ? 'gelijk' : versieStatus(data.versions[env], data.versions.PROD)])
  )
  const afwijkend = ENVS.some(e => ['voor', 'achter', 'anders'].includes(statussen[e]))

  // Gedeeld zijn is normaal en verdient geen randkleur; dat vertelt de badge
  // onderin al. De rand is voor de versiestatus.
  const loopAchter = statussen.ACC === 'achter' || statussen.TST === 'achter'
  const rand = mistExport  ? ROOD
             : loopAchter  ? ORANJE
             : statussen.ACC === 'voor' ? ENV.ACC
             : statussen.TST === 'voor' ? ENV.TST
             : afwijkend   ? VIOLET
             : null
  const border = rand ? rand.ink : 'var(--line-strong)'
  const glow   = rand ? `0 0 0 3px ${rand.line}, var(--shadow-1)` : 'var(--shadow-1)'

  return (
    <div style={{
      width: MODEL_W,
      background: 'var(--surface)',
      border: `2px solid ${selected ? 'var(--accent)' : border}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 3px var(--sel-bg-2), var(--shadow-3)' : glow,
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: 'var(--line-strong)', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--line-strong)', border: 'none', width: 8, height: 8 }} />

      <div style={{ background: 'var(--surface-2)', padding: '7px 10px 6px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ color: 'var(--ink)', fontSize: 11, fontWeight: 700, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.label}
        </div>
      </div>

      {/* De versies zoals ze in deze keten worden aangeroepen */}
      <div style={{ padding: '6px 10px 5px' }}>
        {ENVS.map(env => {
          const v      = data.versions[env]
          const st     = statussen[env]
          const fam    = familieVan(env, st)
          const opvall = !!fam && st !== 'gelijk' && st !== 'onbekend'
          const kleur  = opvall ? fam.ink : null
          return (
            <div key={env} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '2px 5px', borderRadius: 4, marginBottom: 1,
              background: opvall ? fam.bg : 'transparent',
            }}>
              <span style={{ color: opvall ? kleur : 'var(--ink-3)', fontSize: 9, fontWeight: 700,
                width: 30, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{env}</span>
              <span style={{ color: opvall ? kleur : 'var(--meta-ink)', fontSize: 10,
                fontFamily: 'var(--mono)', fontWeight: opvall ? 700 : 400 }}>{v ?? '—'}</span>
              {opvall && <span style={{ color: kleur, fontSize: 9, marginLeft: 'auto' }}>{TEKEN[st]}</span>}
            </div>
          )
        })}
      </div>

      {/* Aangeroepen versie bestaat niet in de export van die omgeving */}
      {mistExport && (
        <div style={{ borderTop: `1px solid ${ROOD.line}`, padding: '4px 10px 5px',
          background: ROOD.bg, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: ROOD.ink, fontSize: 9 }}>⚠</span>
          <span style={{ color: ROOD.ink, fontSize: 9, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            versie niet in export ({data.ontbreekt.join(', ')})
          </span>
        </div>
      )}

      {data.workItem && (() => {
        const klaar = data.workItem.status === 'DONE'
        return (
          <div style={{ borderTop: '1px solid var(--line-2)', padding: '4px 10px 5px',
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: klaar ? 'var(--ink-3)' : ENV.TST.ink }} />
            <span style={{ color: klaar ? 'var(--ink-2)' : ENV.TST.ink, fontSize: 9, fontWeight: 600 }}>
              {data.workItem.consultant}
            </span>
            <span style={{ color: 'var(--meta-ink)', fontSize: 9,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              — {data.workItem.note}
            </span>
          </div>
        )
      })()}

      {isShared && (
        <div style={{ borderTop: `1px solid ${VIOLET.line}`, padding: '4px 10px 5px',
          background: VIOLET.bg, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={VIOLET.ink} strokeWidth="2.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span style={{ color: VIOLET.ink, fontSize: 9, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Gedeeld • {data.sharedIn.length} andere keten{data.sharedIn.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
