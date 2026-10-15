import dagre from 'dagre'
import { MarkerType, Position } from 'reactflow'
import { onderweg } from '../../lib/chainUtils.js'

// ─── Node dimensies ───────────────────────────────────────────────────────────
export const MODEL_W  = 230
export const MODEL_H  = 110
export const ROW_H    = 20      // extra regel onderin de modelkaart
export const IFACE_W  = 150
export const IFACE_H  = 36

function modelHeight(extras) {
  return MODEL_H + extras * ROW_H
}

function extraRegels({ workItem, sharedIn, ontbreekt, notes }) {
  let n = 0
  if (notes?.trim()) n++
  if (workItem) n++
  if (sharedIn?.length > 0) n++
  if (ontbreekt?.length > 0) n++
  return n
}

// ─── Dagre layout ─────────────────────────────────────────────────────────────
// rawNodes komt uit ketenGraaf(): per node al de versies zoals ze in déze keten
// worden aangeroepen, plus de omgevingen waar de export die versie miste.
export function applyLayout(rawNodes, rawEdges, chainKey, shared) {
  const dataVan = n => ({
    label: n.label, versions: n.versions ?? {}, notes: n.notes,
    // Het werk alleen zolang de node nog onderweg is: staat hij overal gelijk, dan is het klaar
    workItem: onderweg(n) ? n.workItem : undefined,
    werkPerVersie: n.werkPerVersie, modelId: n.modelId, nodeKey: n.nodeKey ?? n.id,
    ontbreekt: n.ontbreekt ?? [],
    sharedIn: (shared[n.label] || []).filter(k => k !== chainKey),
  })

  const hoogteVan = n =>
    n.type === 'interface' ? IFACE_H : modelHeight(extraRegels(dataVan(n)))

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 20 })

  rawNodes.forEach(n => {
    g.setNode(n.id, { width: n.type === 'interface' ? IFACE_W : MODEL_W, height: hoogteVan(n) })
  })
  rawEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes = rawNodes.map(n => {
    const { x, y } = g.node(n.id)
    const isIface  = n.type === 'interface'
    const h        = hoogteVan(n)
    return {
      id:   n.id,
      type: n.type,
      position: { x: x - (isIface ? IFACE_W : MODEL_W) / 2, y: y - h / 2 },
      data: dataVan(n),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }
  })

  const edges = rawEdges.map((e, i) => ({
    id:        `e${i}`,
    source:    e.source,
    target:    e.target,
    type:      'smoothstep',
    style:     { stroke: 'var(--line-strong)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--line-strong)', width: 14, height: 14 },
  }))

  let maxX = 0, maxY = 0
  nodes.forEach((n, i) => {
    const w = n.type === 'interface' ? IFACE_W : MODEL_W
    const h = n.type === 'interface' ? IFACE_H : hoogteVan(rawNodes[i])
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  })
  const translateExtent = [[-400, -400], [maxX + 400, maxY + 400]]

  return { nodes, edges, translateExtent }
}
