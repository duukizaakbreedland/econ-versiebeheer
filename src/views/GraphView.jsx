import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import ReactFlow, { Background, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { gedeeldIn, ENVS, STATUS_TEKEN } from '../lib/chainUtils.js'
import { useSnapshot } from '../hooks/useSnapshot.jsx'
import { applyLayout } from '../components/graph/layout.js'
import ModelNode from '../components/graph/ModelNode.jsx'
import InterfaceNode from '../components/graph/InterfaceNode.jsx'
import DetailPanel from '../components/DetailPanel.jsx'
import KetenMenu from '../components/graph/KetenMenu.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { KetenPromoveerDialoog } from '../components/dialogen.jsx'
import { Banner, Button, Chip, EnvChip, Spinner, Leeg } from '../components/ui/index.jsx'
import { GEEL, ORANJE, VIOLET, ROOD } from '../lib/kleuren.js'

const NODE_TYPES = { model: ModelNode, interface: InterfaceNode }

function PaneelFout({ label, fout, onClose }) {
  return (
    <aside className="bg-card border-l border-line flex flex-col shrink-0" style={{ width: 440 }}>
      <header className="px-4 pt-3 pb-3 border-b border-line flex items-start gap-2">
        <div className="flex-1 min-w-0 text-ink font-bold text-sm break-words">{label}</div>
        <button onClick={onClose} className="text-ink-3 hover:text-ink text-xl leading-none transition-colors shrink-0">×</button>
      </header>
      <div className="px-4 py-3">
        <Banner ok={false}>Het detailpaneel kon niet worden getoond: {fout?.message ?? 'onbekende fout'}</Banner>
      </div>
    </aside>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────
export default function GraphView({ route, ga }) {
  const { snap, ketens, error } = useSnapshot()

  const chainKey = useMemo(() => {
    if (!ketens) return null
    if (route.keten && ketens.perKey[route.keten]) return route.keten
    return ketens.lijst[0]?.chain.key ?? null
  }, [ketens, route.keten])

  // De keten in het adres houden, ook als er geen stond
  useEffect(() => {
    if (chainKey && route.keten !== chainKey) ga({ tab: 'ketens', keten: chainKey, model: route.model }, { vervang: true })
  }, [chainKey, route.keten])

  if (!snap || !ketens) return error ? <div className="p-6"><Banner ok={false}>{error}</Banner></div> : <Spinner tekst="Ketens laden…" />
  if (!chainKey) {
    return (
      <div className="p-6 max-w-lg">
        <Leeg>Nog geen ketens. Maak er een aan bij Beheer: kies het hoofdmodel, en leg daarna bij Aanroepen vast wat het aanroept.</Leeg>
      </div>
    )
  }

  return (
    <GraphViewInner
      key={chainKey}
      chainKey={chainKey}
      entry={ketens.perKey[chainKey]}
      routeModel={route.model}
      ga={ga}
    />
  )
}

// Inner component zodat useNodesState opnieuw initialiseert bij het wisselen van keten
function GraphViewInner({ chainKey, entry, routeModel, ga }) {
  const { snap, ketens } = useSnapshot()
  const { chain, graaf, stats } = entry
  const rf = useRef(null)

  const sharedIn = useMemo(() => {
    const m = {}
    for (const n of graaf.nodes) m[n.modelId] = gedeeldIn(ketens, n.modelId, chainKey).map(k => snap.chain(k)?.label ?? k)
    return m
  }, [graaf, ketens, chainKey, snap])

  const layout = useMemo(() => applyLayout(graaf, sharedIn), [graaf, sharedIn])

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)
  const vorigeIds = useRef(layout.nodes.map(n => n.id).sort().join('|'))

  // Nieuwe snapshot: data van de nodes bijwerken, maar de posities die de
  // gebruiker heeft gesleept bewaren zolang de set nodes gelijk blijft
  useEffect(() => {
    const ids = layout.nodes.map(n => n.id).sort().join('|')
    setNodes(oud => {
      const positie = ids === vorigeIds.current ? Object.fromEntries(oud.map(n => [n.id, n.position])) : {}
      vorigeIds.current = ids
      return layout.nodes.map(n => positie[n.id] ? { ...n, position: positie[n.id] } : n)
    })
  }, [layout, setNodes])

  // Selectie: het adres wijst naar een model (nodeKey); wij houden de variant bij
  const [selId, setSelId] = useState(() => layout.nodes.find(n => n.data.nodeKey === routeModel)?.id ?? null)
  useEffect(() => {
    if (!routeModel) { setSelId(null); return }
    setSelId(cur => {
      const huidige = layout.nodes.find(n => n.id === cur)
      if (huidige?.data.nodeKey === routeModel) return cur
      return layout.nodes.find(n => n.data.nodeKey === routeModel)?.id ?? null
    })
  }, [routeModel, layout])

  const selectedNode = useMemo(() => {
    if (!selId) return null
    const zelfde = nodes.find(n => n.id === selId)
    if (zelfde) return zelfde
    // Na een actie kan een variant andere versies (en dus een andere id) hebben:
    // val terug op de variant van hetzelfde model die het meest lijkt
    const nodeKey = selId.split('@')[0]
    return nodes.filter(n => n.data.nodeKey === nodeKey)[0] ?? null
  }, [selId, nodes])

  const onNodeClick = useCallback((_, node) => {
    setSelId(node.id)
    ga({ tab: 'ketens', keten: chainKey, model: node.data.nodeKey }, { vervang: true })
  }, [ga, chainKey])

  function sluitPaneel() {
    setSelId(null)
    ga({ tab: 'ketens', keten: chainKey, model: null }, { vervang: true })
  }

  // Het pad van de geselecteerde node: voorouders en nakomelingen lichten op
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!selectedNode) return { rfNodes: nodes, rfEdges: layout.edges }
    const boven = {}, onder = {}
    for (const e of layout.edges) { (boven[e.target] ??= []).push(e.source); (onder[e.source] ??= []).push(e.target) }
    const pad = new Set([selectedNode.id])
    const loop = (start, richting) => {
      const stapel = [start]
      while (stapel.length) { const id = stapel.pop(); for (const x of richting[id] ?? []) if (!pad.has(x)) { pad.add(x); stapel.push(x) } }
    }
    loop(selectedNode.id, boven); loop(selectedNode.id, onder)
    return {
      rfNodes: nodes.map(n => ({ ...n, data: { ...n.data, opPad: pad.has(n.id) && n.id !== selectedNode.id, gedimd: !pad.has(n.id) } })),
      rfEdges: layout.edges.map(e => pad.has(e.source) && pad.has(e.target)
        ? { ...e, style: { stroke: 'var(--accent)', strokeWidth: 2 }, markerEnd: { ...e.markerEnd, color: 'var(--accent)' }, zIndex: 10 }
        : { ...e, style: { ...e.style, opacity: 0.3 } }),
    }
  }, [nodes, layout.edges, selectedNode])

  const [ketenPromotie, setKetenPromotie] = useState(null)   // null | 'ACC' | 'PROD'
  const kanKeten = {
    ACC:  stats.tstAfwijkend.length > 0,
    PROD: stats.accAfwijkend.length > 0,
  }

  return (
    <div className="flex w-full h-full">
      <KetenMenu ketens={ketens} actief={chainKey}
        onKies={(key, modelId) => ga({ tab: 'ketens', keten: key, model: modelId ?? null })} />

      <div className="relative flex-1 min-w-0 flex flex-col">
        {/* Ketenbalk */}
        <div className="bg-card border-b border-line px-4 py-2 flex items-center gap-3 flex-wrap shrink-0">
          <div className="min-w-0">
            <div className="text-ink text-sm font-semibold truncate">{chain.label}</div>
            <div className="text-meta text-xs">{stats.models} modellen</div>
          </div>
          <Chip familie={stats.cfg.familie} title={stats.cfg.uitleg}>{stats.cfg.label}</Chip>
          <div className="flex items-center gap-1">
            {ENVS.map(e => (
              <EnvChip key={e} env={e} className="font-mono" title={`Hoofdmodel in ${e}`}>
                {e} <span className="font-normal">{stats.rootVersions[e] ?? '—'}</span>
              </EnvChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => rf.current?.fitView({ padding: 0.25 })} title="Alles in beeld">Fit</Button>
            {(kanKeten.ACC || kanKeten.PROD) && (
              <Button variant="green" onClick={() => setKetenPromotie(kanKeten.ACC ? 'ACC' : 'PROD')}>
                Promoveer keten
              </Button>
            )}
          </div>
        </div>

        <div className="relative flex-1 min-w-0">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onPaneClick={() => selectedNode && sluitPaneel()}
            onInit={inst => { rf.current = inst }}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.3}
            maxZoom={2}
            translateExtent={layout.translateExtent}
            style={{ background: 'var(--bg)' }}
          >
            <Background color="var(--line)" gap={20} size={1} />
          </ReactFlow>

          {graaf.nodes.length <= 1 && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <Banner warn>
                {stats.nietIn.length === 3
                  ? `${chain.label} draait nergens. Registreer een versie van het hoofdmodel, of leg bij Beheer de juiste versie vast.`
                  : 'Dit hoofdmodel roept nog niets aan. Klik erop en voeg bij Aanroepen vast wat het aanroept.'}
              </Banner>
            </div>
          )}
          {graaf.teGroot && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <Banner ok={false}>De keten is te groot om volledig te tekenen; een deel is weggelaten.</Banner>
            </div>
          )}

          {/* Legenda */}
          <div className="absolute bottom-3 left-3 right-3 z-10 w-fit max-w-full bg-card/90 backdrop-blur-sm border border-line rounded-lg px-2.5 py-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-ink-2">
            <LegendaItem f={GEEL}   t={STATUS_TEKEN.voor}>nieuwer dan PROD</LegendaItem>
            <LegendaItem f={ORANJE} t={STATUS_TEKEN.achter}>ouder dan PROD</LegendaItem>
            <LegendaItem f={VIOLET} t={STATUS_TEKEN.anders}>afwijkend</LegendaItem>
            <LegendaItem f={ROOD}   t="⚠">ontbreekt in eCon</LegendaItem>
            <LegendaItem f={VIOLET} t="⧉">ook in andere ketens</LegendaItem>
            <LegendaItem f={GEEL}   t="●">lopend werk</LegendaItem>
          </div>
        </div>
      </div>

      {selectedNode && (
        <ErrorBoundary
          key={selectedNode.data.nodeKey}
          fallback={fout => <PaneelFout label={selectedNode.data.label} fout={fout} onClose={sluitPaneel} />}>
          <DetailPanel
            node={selectedNode}
            graaf={graaf}
            chainKey={chainKey}
            ga={ga}
            onClose={sluitPaneel}
          />
        </ErrorBoundary>
      )}

      {ketenPromotie && (
        <KetenPromoveerDialoog chainKey={chainKey} graaf={graaf} standaardDoel={ketenPromotie} onClose={() => setKetenPromotie(null)} />
      )}
    </div>
  )
}

function LegendaItem({ f, t, children }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-4 h-4 rounded flex items-center justify-center font-bold text-[10px]" style={{ background: f.bg, color: f.ink }}>{t}</span>
      {children}
    </span>
  )
}
