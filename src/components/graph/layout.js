import dagre from 'dagre'
import { MarkerType, Position } from 'reactflow'

// ─── Node dimensies ───────────────────────────────────────────────────────────
export const MODEL_W  = 230
export const MODEL_H  = 110
export const ROW_H    = 20      // extra regel onderin de modelkaart
export const IFACE_W  = 150
export const IFACE_H  = 36

// Hoogte hangt af van hoeveel extra regels de kaart toont
function modelHeight(extras) {
  return MODEL_H + extras * ROW_H
}

function extraRegels({ workItem, sharedIn, conflict }) {
  let n = 0
  if (workItem) n++
  if (sharedIn?.length > 0) n++
  if (conflict?.length > 0) n++
  return n
}

// ─── Dagre layout ─────────────────────────────────────────────────────────────
// extra = { conflicts }
export function applyLayout(rawNodes, rawEdges, chainKey, shared, extra = {}) {
  const { conflicts = {} } = extra

  const dataVan = n => ({
    label: n.label, versions: n.versions, versionIds: n.versionIds,
    workItem: n.workItem, modelId: n.modelId,
    sharedIn: (shared[n.label] || []).filter(k => k !== chainKey),
    conflict: conflicts[n.modelId],
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
    style:     { stroke: '#334155', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#334155', width: 14, height: 14 },
  }))

  // Bereken panning grens op basis van werkelijke node posities
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
