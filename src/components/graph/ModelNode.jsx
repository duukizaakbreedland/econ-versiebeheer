import { Handle, Position } from 'reactflow'
import { versieStatus, ENVS, STATUS_TEKEN } from '../../lib/chainUtils.js'
import { MODEL_W } from './layout.js'
import { ENV, ORANJE, VIOLET, ROOD, GEEL } from '../../lib/kleuren.js'

// Loopt een omgeving voor, dan krijgt hij zijn eigen kleur — zo zie je meteen
// hóé ver iets is doorgezet. Achterlopen is altijd oranje, want dat is de
// situatie die aandacht vraagt.
function familieVan(env, status) {
  if (status === 'voor')   return ENV[env]
  if (status === 'achter') return ORANJE
  if (status === 'anders') return VIOLET
  return null
}

export default function ModelNode({ data, selected }) {
  const isShared   = data.sharedIn?.length > 0
  const mistExport = data.ontbreekt?.length > 0
  const werk       = data.openWerk?.[0]

  const statussen = Object.fromEntries(
    ENVS.map(env => [env, env === 'PROD' ? 'gelijk' : versieStatus(data.versions[env], data.versions.PROD)])
  )
  const afwijkend = ENVS.some(e => ['voor', 'achter', 'anders'].includes(statussen[e]))

  const loopAchter = statussen.ACC === 'achter' || statussen.TST === 'achter'
  const rand = mistExport  ? ROOD
             : loopAchter  ? ORANJE
             : statussen.ACC === 'voor' ? ENV.ACC
             : statussen.TST === 'voor' ? ENV.TST
             : afwijkend   ? VIOLET
             : null
  const border = rand ? rand.ink : 'var(--line-strong)'
  const glow   = data.opPad ? `0 0 0 3px var(--sel-bg-2), var(--shadow-2)`
               : rand ? `0 0 0 3px ${rand.line}, var(--shadow-1)` : 'var(--shadow-1)'

  return (
    <div style={{
      width: MODEL_W,
      background: 'var(--surface)',
      border: `2px solid ${selected ? 'var(--accent)' : border}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 3px var(--sel-bg-2), var(--shadow-3)' : glow,
      opacity: data.gedimd ? 0.35 : 1,
      transition: 'opacity 120ms',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: 'var(--line-strong)', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--line-strong)', border: 'none', width: 8, height: 8 }} />

      <div style={{ background: 'var(--surface-2)', padding: '6px 10px 5px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ color: 'var(--ink)', fontSize: 11, fontWeight: 700, lineHeight: 1.3, flex: 1, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={data.label}>
          {data.label}
        </div>
        {data.isWortel && (
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--meta-ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            hoofd
          </span>
        )}
        {data.variants > 1 && (
          <span title="Dit model hangt in deze keten op meerdere versies" style={{ fontSize: 9, color: VIOLET.ink, fontWeight: 700 }}>
            ×{data.variants}
          </span>
        )}
        {isShared && (
          <span title={`Ook gebruikt in: ${data.sharedIn.join(', ')}`}
            style={{ color: VIOLET.ink, fontSize: 11, lineHeight: 1, fontWeight: 700 }}>⧉</span>
        )}
      </div>

      {/* De versies zoals ze in deze keten worden aangeroepen */}
      <div style={{ padding: '5px 10px 4px' }}>
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
              <span style={{ color: opvall ? kleur : ENV[env].ink, fontSize: 9, fontWeight: 700,
                width: 30, flexShrink: 0, letterSpacing: 0.5 }}>{env}</span>
              <span style={{ color: opvall ? kleur : (v ? 'var(--ink)' : 'var(--ink-4)'), fontSize: 10,
                fontFamily: 'var(--mono)', fontWeight: opvall ? 700 : 400 }}>{v ?? '—'}</span>
              {opvall && <span style={{ color: kleur, fontSize: 10, marginLeft: 'auto', fontWeight: 700 }}>{STATUS_TEKEN[st]}</span>}
            </div>
          )
        })}
      </div>

      {mistExport && (
        <Regel familie={ROOD} teken="⚠" titel="Deze versie wordt wel aangeroepen maar kwam niet voor in de eCon-export">
          ontbreekt in eCon ({data.ontbreekt.join(', ')})
        </Regel>
      )}

      {data.notes?.trim() && (
        <Regel familie={ORANJE} teken="✎" titel={data.notes}>{data.notes.trim()}</Regel>
      )}

      {werk && (
        <Regel familie={GEEL} teken="●" titel={`${werk.consultant}${werk.ticket ? ` · ${werk.ticket}` : ''}${werk.note ? ` · ${werk.note}` : ''}`}>
          <span style={{ fontFamily: werk.ticket ? 'var(--mono)' : undefined }}>{werk.ticket || werk.consultant}</span>
          {werk.ticket && <span style={{ color: 'var(--meta-ink)', fontWeight: 400 }}> · {werk.consultant}</span>}
          {werk.note && <span style={{ color: 'var(--meta-ink)', fontWeight: 400 }}> · {werk.note}</span>}
          {data.openWerk.length > 1 && <span style={{ color: 'var(--meta-ink)', fontWeight: 400 }}> +{data.openWerk.length - 1}</span>}
        </Regel>
      )}
    </div>
  )
}

function Regel({ familie, teken, titel, children }) {
  return (
    <div title={titel} style={{ borderTop: `1px solid ${familie.line}`, padding: '3px 10px 4px',
      background: familie.bg, display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: familie.ink, fontSize: 9, flexShrink: 0 }}>{teken}</span>
      <span style={{ color: familie.ink, fontSize: 9, fontWeight: 600, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </span>
    </div>
  )
}
