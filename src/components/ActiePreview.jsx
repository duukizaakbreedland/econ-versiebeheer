import { useState } from 'react'
import { Modal, Banner, Button } from './ui/index.jsx'
import { ENV, GROEN } from '../lib/kleuren.js'

// "Dit gaat er gebeuren": dezelfde dialoog voor registreren, promoveren,
// terugdraaien, verwijderen en een aanroep vastleggen. Het plan komt uit
// lib/releasePlan.js; hier wordt alleen getoond en bevestigd.
//
// plan: { titel, kan, reden, groepen, waarschuwingen }
// onBevestig: async () => void  (de RPC); fouten worden hier getoond
// env: kleur van de bevestigknop (doelomgeving), anders neutraal

const SOORT_KLEUR = { versie: 'text-ink', aanroep: 'text-ink', werk: 'text-ink-2', info: 'text-ink-3 italic' }

export default function ActiePreview({ plan, env, bevestigLabel = 'Bevestig', onBevestig, onClose, children }) {
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState(null)

  async function bevestig() {
    setBusy(true); setFout(null)
    try { await onBevestig() }
    catch (e) { setFout(e.message ?? 'Onbekende fout'); setBusy(false) }
  }

  const f = env ? ENV[env] : GROEN
  return (
    <Modal title={plan.titel} onClose={busy ? undefined : onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleer</Button>
        <Button className="ml-auto" disabled={busy || !plan.kan} onClick={bevestig}
          style={plan.kan ? { background: f.ink, color: 'white', borderColor: f.ink } : undefined}>
          {busy ? 'Bezig…' : bevestigLabel}
        </Button>
      </>}>
      <div className="space-y-3">
        {children}
        {fout && <Banner ok={false} onClose={() => setFout(null)}>{fout}</Banner>}
        {!plan.kan && plan.reden && <Banner ok={false}>{plan.reden}</Banner>}
        {plan.waarschuwingen.map((w, i) => <Banner key={i} warn>{w}</Banner>)}

        {plan.groepen.map((g, i) => (
          <div key={i}>
            <div className="text-meta text-xs font-semibold uppercase tracking-wide mb-1">{g.kop}</div>
            <div className="bg-page rounded-lg border border-line/50 divide-y divide-line/50">
              {g.regels.length === 0 && <div className="px-2.5 py-1.5 text-ink-3 text-xs italic">Niets</div>}
              {g.regels.map((r, j) => (
                <div key={j} className="px-2.5 py-1.5 text-xs flex items-center gap-2 flex-wrap">
                  <span className={`min-w-0 ${SOORT_KLEUR[r.soort] ?? 'text-ink'}`}>{r.tekst}</span>
                  {r.extra && <span className="text-ink-3">· {r.extra}</span>}
                  {(r.oud !== undefined || r.nieuw !== undefined) && (
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      {r.oud != null && r.oud !== '' && <span className="font-mono text-ink-3 line-through">{r.oud}</span>}
                      {r.oud != null && r.oud !== '' && r.nieuw != null && <span className="text-ink-3">→</span>}
                      {r.nieuw != null && <span className="font-mono text-ink font-semibold">{r.nieuw}</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
