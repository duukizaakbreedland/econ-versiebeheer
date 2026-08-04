import { Handle, Position } from 'reactflow'
import { versieStatus, ENVS } from '../../lib/chainUtils.js'
import { MODEL_W } from './layout.js'

// Loopt een omgeving voor, dan krijgt hij zijn eigen kleur — zo zie je meteen
// hóé ver iets is doorgezet. Achterlopen is altijd oranje, want dat is de
// situatie die aandacht vraagt.
const ENV_KLEUR = { PROD: '#22c55e', ACC: '#60a5fa', TST: '#fbbf24' }
const ACHTER    = '#f97316'
const ANDERS    = '#a855f7'
const NEUTRAAL  = '#475569'

function kleurVan(env, status) {
  if (status === 'voor')   return ENV_KLEUR[env]
  if (status === 'achter') return ACHTER
  if (status === 'anders') return ANDERS
  return NEUTRAAL
}

const TEKEN = { voor: '↑', achter: '↓', anders: '≠' }

export default function ModelNode({ data, selected }) {
  const isShared   = data.sharedIn?.length > 0
  const mistExport = data.ontbreekt?.length > 0

  const statussen = Object.fromEntries(
    ENVS.map(env => [env, env === 'PROD' ? 'gelijk' : versieStatus(data.versions[env], data.versions.PROD)])
  )
  const afwijkend = ENVS.some(e => ['voor', 'achter', 'anders'].includes(statussen[e]))

  const loopAchter = statussen.ACC === 'achter' || statussen.TST === 'achter'
  const border = mistExport  ? '#ef4444'
               : loopAchter  ? ACHTER
               : isShared    ? '#a855f7'
               : statussen.ACC === 'voor' ? ENV_KLEUR.ACC
               : statussen.TST === 'voor' ? ENV_KLEUR.TST
               : afwijkend   ? ANDERS
               : '#334155'
  const glow   = mistExport ? '0 0 0 1px #ef444455'
               : isShared   ? '0 0 0 1px #a855f744'
               : afwijkend  ? `0 0 0 1px ${border}44`
               : 'none'

  return (
    <div style={{
      width: MODEL_W,
      background: '#0f172a',
      border: `2px solid ${selected ? '#f59e0b' : border}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 3px #f59e0b44' : glow,
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: '#334155', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#334155', border: 'none', width: 8, height: 8 }} />

      <div style={{ background: '#1e293b', padding: '7px 10px 6px', borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.label}
        </div>
      </div>

      {/* De versies zoals ze in deze keten worden aangeroepen */}
      <div style={{ padding: '6px 10px 5px' }}>
        {ENVS.map(env => {
          const v      = data.versions[env]
          const st     = statussen[env]
          const kleur  = kleurVan(env, st)
          const opvall = st !== 'gelijk' && st !== 'onbekend'
          return (
            <div key={env} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '2px 5px', borderRadius: 4, marginBottom: 1,
              background: opvall ? kleur + '18' : 'transparent',
            }}>
              <span style={{ color: opvall ? kleur : '#475569', fontSize: 9, fontWeight: 700,
                width: 30, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{env}</span>
              <span style={{ color: opvall ? kleur : '#64748b', fontSize: 10,
                fontFamily: 'monospace', fontWeight: opvall ? 700 : 400 }}>{v ?? '—'}</span>
              {opvall && <span style={{ color: kleur, fontSize: 9, marginLeft: 'auto' }}>{TEKEN[st]}</span>}
            </div>
          )
        })}
      </div>

      {/* Aangeroepen versie bestaat niet in de export van die omgeving */}
      {mistExport && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
          background: '#2a0a0a', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#ef4444', fontSize: 9 }}>⚠</span>
          <span style={{ color: '#f87171', fontSize: 9, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            versie niet in export ({data.ontbreekt.join(', ')})
          </span>
        </div>
      )}

      {data.workItem && (() => {
        const klaar = data.workItem.status === 'DONE'
        return (
          <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: klaar ? '#475569' : '#fbbf24' }} />
            <span style={{ color: klaar ? '#94a3b8' : '#fbbf24', fontSize: 9, fontWeight: 600 }}>
              {data.workItem.consultant}
            </span>
            <span style={{ color: '#78716c', fontSize: 9,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              — {data.workItem.note}
            </span>
          </div>
        )
      })()}

      {isShared && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
          background: '#1a0a2e', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span style={{ color: '#a855f7', fontSize: 9, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Gedeeld • {data.sharedIn.length} andere keten{data.sharedIn.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
