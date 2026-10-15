import { Handle, Position } from 'reactflow'
import { IFACE_W } from './layout.js'
import { ENVS } from '../../lib/chainUtils.js'

export default function InterfaceNode({ data, selected }) {
  const versies = ENVS.map(e => data.versions[e]).filter(Boolean)
  const uniek   = [...new Set(versies)]
  return (
    <div style={{
      width: IFACE_W,
      background: 'var(--surface)',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--mov-bg-2)'}`,
      boxShadow: data.opPad ? '0 0 0 3px var(--sel-bg-2), var(--shadow-1)' : 'var(--shadow-1)',
      borderRadius: 999,
      padding: '6px 12px',
      textAlign: 'center',
      opacity: data.gedimd ? 0.35 : 1,
      transition: 'opacity 120ms',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: 'var(--mov-bg-2)', border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mov-bg-2)', border: 'none', width: 6, height: 6 }} />
      <div style={{ color: 'var(--mov-ink)', fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={data.label}>
        {data.label}
      </div>
      <div style={{ color: 'var(--meta-ink)', fontSize: 9, fontFamily: 'var(--mono)', marginTop: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={ENVS.map(e => `${e}: ${data.versions[e] ?? '—'}`).join(' · ')}>
        {uniek.length === 0 ? '—'
          : uniek.length === 1 ? uniek[0]
          : ENVS.filter(e => data.versions[e]).map(e => `${e[0]} ${data.versions[e]}`).join(' · ')}
      </div>
    </div>
  )
}
