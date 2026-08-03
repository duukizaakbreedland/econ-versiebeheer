import { Handle, Position } from 'reactflow'
import { IFACE_W } from './layout.js'

export default function InterfaceNode({ data }) {
  return (
    <div style={{
      width: IFACE_W,
      background: '#0f172a',
      border: '1px solid #1e3a5f',
      borderRadius: 999,
      padding: '6px 12px',
      textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: '#1e3a5f', border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#1e3a5f', border: 'none', width: 6, height: 6 }} />
      <div style={{ color: '#3b82f6', fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.label}
      </div>
      <div style={{ color: '#1e40af', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
        {data.versions.PROD ?? '—'}
      </div>
    </div>
  )
}
