import { Handle, Position } from 'reactflow'
import { versionStatus } from '../../lib/chainUtils.js'
import { MODEL_W } from './layout.js'

const ENV_KLEUR = { PROD: '#22c55e', ACC: '#60a5fa', TST: '#fbbf24' }

export default function ModelNode({ data, selected }) {
  const vs        = versionStatus(data.versions)
  const isShared  = data.sharedIn?.length > 0
  const conflict  = data.conflict?.length > 0 ? data.conflict : null

  const border   = conflict          ? '#ef4444'
                 : isShared          ? '#a855f7'
                 : vs === 'tst-ahead' ? '#fbbf24'
                 : vs === 'acc-ahead' ? '#60a5fa'
                 : '#334155'
  const glow     = conflict          ? '0 0 0 1px #ef444455'
                 : isShared          ? '0 0 0 1px #a855f744'
                 : vs !== 'stable'   ? `0 0 0 1px ${border}44`
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

      {/* Header */}
      <div style={{ background: '#1e293b', padding: '7px 10px 6px', borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.label}
        </div>
      </div>

      {/* Versies — alleen wat afwijkt van PROD krijgt kleur */}
      <div style={{ padding: '6px 10px 5px' }}>
        {['PROD', 'ACC', 'TST'].map(key => {
          const v       = data.versions[key]
          const kleur   = ENV_KLEUR[key]
          const isAhead = key !== 'PROD' && v !== data.versions.PROD
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '2px 5px', borderRadius: 4, marginBottom: 1,
              background: isAhead ? kleur + '18' : 'transparent',
            }}>
              <span style={{ color: isAhead ? kleur : '#475569', fontSize: 9, fontWeight: 700,
                width: 30, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{key}</span>
              <span style={{ color: isAhead ? kleur : '#64748b', fontSize: 10,
                fontFamily: 'monospace', fontWeight: isAhead ? 700 : 400 }}>{v ?? '—'}</span>
              {isAhead && <span style={{ color: kleur, fontSize: 9, marginLeft: 'auto' }}>↑</span>}
            </div>
          )
        })}
      </div>

      {/* Versieconflict: hetzelfde submodel draait in één omgeving op meerdere versies */}
      {conflict && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
          background: '#2a0a0a', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#ef4444', fontSize: 9 }}>⚠</span>
          <span style={{ color: '#f87171', fontSize: 9, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conflict[0].env}: {conflict[0].versies.map(v => v.version).join(' vs ')}
          </span>
        </div>
      )}

      {/* Work item */}
      {data.workItem && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
          display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
          <span style={{ color: '#fbbf24', fontSize: 9, fontWeight: 600 }}>{data.workItem.consultant}</span>
          <span style={{ color: '#78716c', fontSize: 9,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            — {data.workItem.note}
          </span>
        </div>
      )}

      {/* Shared badge */}
      {isShared && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '4px 10px 5px',
          background: '#1a0a2e', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span style={{ color: '#a855f7', fontSize: 9, fontWeight: 600 }}>
            Gedeeld • {data.sharedIn.join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}
