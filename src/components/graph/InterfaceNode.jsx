import { Handle, Position } from 'reactflow'
import { IFACE_W } from './layout.js'

export default function InterfaceNode({ data }) {
  return (
    <div style={{
      width: IFACE_W,
      background: 'var(--surface)',
      border: '1px solid var(--mov-bg-2)',
      boxShadow: 'var(--shadow-1)',
      borderRadius: 999,
      padding: '6px 12px',
      textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: 'var(--mov-bg-2)', border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mov-bg-2)', border: 'none', width: 6, height: 6 }} />
      <div style={{ color: 'var(--mov-ink)', fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.label}
      </div>
      <div style={{ color: 'var(--meta-ink)', fontSize: 9, fontFamily: 'var(--mono)', marginTop: 1 }}>
        {data.versions.PROD ?? data.versions.ACC ?? data.versions.TST ?? '—'}
      </div>
    </div>
  )
}
