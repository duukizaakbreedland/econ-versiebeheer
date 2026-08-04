import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, useNodesState, useEdgesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { getSharedModels, ketenVersies } from '../lib/chainUtils.js'
import { useDependencies } from '../hooks/useDependencies.js'
import { applyLayout } from '../components/graph/layout.js'
import ModelNode from '../components/graph/ModelNode.jsx'
import InterfaceNode from '../components/graph/InterfaceNode.jsx'
import DetailPanel from '../components/DetailPanel.jsx'
import ChainPromoteForm from '../components/ChainPromoteForm.jsx'

const NODE_TYPES = { model: ModelNode, interface: InterfaceNode }

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function GraphView({ initialChain, chains, onRefresh }) {
  const [chainKey, setChainKey] = useState(null)
  const [selected, setSelected] = useState(null)

  const { deps, refresh: refreshDeps } = useDependencies()

  // Initialiseer chainKey zodra chains beschikbaar is
  useEffect(() => {
    if (!chains) return
    setChainKey(prev => {
      if (prev && chains[prev]) return prev
      return (initialChain && chains[initialChain]) ? initialChain : Object.keys(chains)[0]
    })
  }, [chains])

  // Navigeer naar specifieke keten
  useEffect(() => {
    if (initialChain && chains?.[initialChain]) {
      setChainKey(initialChain)
      setSelected(null)
    }
  }, [initialChain])

  const shared = useMemo(() => getSharedModels(chains || {}), [chains])

  const chain = chains?.[chainKey]

  // Per omgeving de versies zoals ze in déze keten worden aangeroepen
  const versiesPerEnv = useMemo(
    () => chain ? ketenVersies(chain, deps) : {},
    [chain, deps]
  )

  const { nodes: initNodes, edges: initEdges, translateExtent } = useMemo(
    () => chain
      ? applyLayout(chain.nodes, chain.edges, chainKey, shared, { ketenVersies: versiesPerEnv })
      : { nodes: [], edges: [], translateExtent: [[-400,-400],[1200,900]] },
    [chain, chainKey, shared, versiesPerEnv]
  )

  async function handleRefresh() {
    await onRefresh()
    await refreshDeps()
  }

  if (!chains || !chainKey || !chain) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="w-6 h-6 text-slate-500 animate-spin mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          <div className="text-slate-500 text-sm">Ketens laden…</div>
        </div>
      </div>
    )
  }

  return <GraphViewInner
    key={chainKey}
    chainKey={chainKey}
    setChainKey={k => { setChainKey(k); setSelected(null) }}
    chain={chain}
    chains={chains}
    initNodes={initNodes}
    initEdges={initEdges}
    translateExtent={translateExtent}
    selected={selected}
    setSelected={setSelected}
    deps={deps}
    onRefresh={handleRefresh}
  />
}

// Inner component zodat useNodesState opnieuw initialiseert bij het wisselen van keten
function GraphViewInner({ chainKey, setChainKey, chain, chains, initNodes, initEdges, translateExtent, selected, setSelected, deps, onRefresh }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [, , onEdgesChange]              = useEdgesState(initEdges)

  // useNodesState houdt een eigen kopie; zonder deze sync blijft de graph op de
  // stand van het eerste renderen staan en zie je een nieuwe versie of een pas
  // geregistreerd werk-item pas na het herladen van de pagina.
  useEffect(() => { setNodes(initNodes) }, [initNodes, setNodes])

  const onNodeClick = useCallback((_, node) => setSelected(node), [])
  const selectedNode = selected ? nodes.find(n => n.id === selected.id) : null

  return (
    <div className="flex w-full" style={{ height: 'calc(100vh - 110px)' }}>

      {/* Graph gebied */}
      <div className="relative flex-1 min-w-0">

        {/* Ketens als losse zwevende knoppen */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-start gap-2 flex-wrap">
          {Object.entries(chains).map(([key, c]) => (
            <button key={key}
              onClick={() => setChainKey(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border shadow-lg transition-all ${
                chainKey === key
                  ? 'bg-blue-600 border-blue-500 text-white shadow-blue-900/40'
                  : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500 backdrop-blur-sm'
              }`}>
              {c.label}
            </button>
          ))}
          <div className="ml-auto">
            <ChainPromoteForm chainKey={chainKey} chain={chain} onRefresh={onRefresh} />
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={initEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.4}
          maxZoom={2}
          translateExtent={translateExtent}
          style={{ background: '#0f172a' }}
        >
          <Background color="#1e293b" gap={20} size={1} />
        </ReactFlow>

      </div>

      {/* Detail paneel — volledige hoogte */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          chain={chain}
          chainKey={chainKey}
          chains={chains}
          deps={deps}
          onClose={() => setSelected(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  )
}
