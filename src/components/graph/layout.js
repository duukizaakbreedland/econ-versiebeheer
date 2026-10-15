import dagre from 'dagre'
import { MarkerType, Position } from 'reactflow'

// ─── Node dimensies ───────────────────────────────────────────────────────────
export const MODEL_W  = 230
export const MODEL_H  = 104
export const ROW_H    = 20      // extra regel onderin de modelkaart
export const IFACE_W  = 150
export const IFACE_H  = 36

export function extraRegels(n) {
  let r = 0
  if (n.notes?.trim()) r++
  if (n.openWerk?.length) r++
  if (n.ontbreekt?.length) r++
  return r
}

export function nodeHoogte(n) {
  return n.type === 'interface' ? IFACE_H : MODEL_H + extraRegels(n) * ROW_H
}

export function nodeBreedte(n) {
  return n.type === 'interface' ? IFACE_W : MODEL_W
}

// ─── Dagre layout ─────────────────────────────────────────────────────────────
// graaf komt uit ketenGraaf(): per node al de versies zoals ze in déze keten
// worden aangeroepen. sharedIn: per model-id de andere ketens waar hij in zit.
export function applyLayout(graaf, sharedIn = {}) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 20 })

  graaf.nodes.forEach(n => g.setNode(n.id, { width: nodeBreedte(n), height: nodeHoogte(n) }))
  graaf.edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes = graaf.nodes.map(n => {
    const { x, y } = g.node(n.id)
    return {
      id:   n.id,
      type: n.type,
      position: { x: x - nodeBreedte(n) / 2, y: y - nodeHoogte(n) / 2 },
      data: { ...n, sharedIn: sharedIn[n.modelId] ?? [] },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }
  })

  const edges = graaf.edges.map((e, i) => ({
    id:        `e${i}`,
    source:    e.source,
    target:    e.target,
    type:      'smoothstep',
    style:     { stroke: 'var(--line-strong)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--line-strong)', width: 14, height: 14 },
  }))

  let maxX = 0, maxY = 0
  nodes.forEach(n => {
    maxX = Math.max(maxX, n.position.x + nodeBreedte(n.data))
    maxY = Math.max(maxY, n.position.y + nodeHoogte(n.data))
  })
  const translateExtent = [[-400, -400], [maxX + 400, maxY + 400]]

  return { nodes, edges, translateExtent }
}
