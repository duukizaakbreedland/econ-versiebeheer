import { useState } from 'react'
import { registerVersion, promoteModel } from '../lib/api.js'
import { useVoornaam } from '../lib/auth.jsx'
import { Section, Banner, Button, TextInput } from './ui/index.jsx'

// Versienummers volgen bij Buva het patroon jj.mm.dd — vandaag is de logische start
function versieVanVandaag() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getFullYear() % 100)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

// Uitklapbare actiekaart — neemt het paneel niet over, de gegevens blijven zichtbaar
function ActieKaart({ titel, subtitel, icon, open, onToggle, children }) {
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-hover transition-colors">
        {icon}
        <span className="text-xs font-medium text-ink">{titel}</span>
        {subtitel && <span className="text-xs text-ink-3">{subtitel}</span>}
        <svg className={`w-3.5 h-3.5 ml-auto text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && <div className="border-t border-line p-3 space-y-2">{children}</div>}
    </div>
  )
}

export default function NodeActions({ modelName, modelId, versions, aanroepers = [], onRefresh }) {
  const canToAcc  = versions.TST && versions.ACC  !== versions.TST
  const canToProd = versions.ACC && versions.PROD !== versions.ACC
  const canPromote = canToAcc || canToProd

  const voornaam = useVoornaam()
  const tstAanroepers = aanroepers.filter(a => a.versions.TST)

  const [openKaart, setOpenKaart] = useState(null) // null | 'register' | 'promote'
  const [target,    setTarget]    = useState(() => canToAcc ? 'ACC' : 'PROD')
  const [versie,    setVersie]    = useState(versieVanVandaag)
  const [cons,      setCons]      = useState(voornaam)
  const [note,      setNote]      = useState('')
  const [regTicket, setRegTicket] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState(null)

  function toggle(kaart) {
    setMsg(null)
    setOpenKaart(k => k === kaart ? null : kaart)
  }

  async function handleRegister() {
    if (!versie.trim() || !cons.trim()) return
    setSaving(true); setMsg(null)
    try {
      await registerVersion({
        modelName, envName: 'TST', version: versie.trim(), consultant: cons.trim(),
        note: note.trim(), ticket: regTicket.trim(),
        aanroepers: tstAanroepers.map(a => ({ modelId: a.modelId, version: a.versions.TST })),
      })
      setMsg({ ok: true, text: `${versie.trim()} geregistreerd in TST` })
      setVersie(versieVanVandaag()); setCons(voornaam); setNote(''); setRegTicket(''); setOpenKaart(null)
      await onRefresh()
    } catch (e) {
      setMsg({ ok: false, text: e.message ?? 'Onbekende fout' })
    } finally { setSaving(false) }
  }

  async function handlePromote() {
    const fromEnv = target === 'ACC' ? 'TST' : 'ACC'
    const fromVer = target === 'ACC' ? versions.TST : versions.ACC
    setSaving(true); setMsg(null)
    try {
      await promoteModel({ modelId, fromEnv, toEnv: target })
      setMsg({ ok: true, text: `${fromVer} gepromoveerd naar ${target}` })
      setOpenKaart(null)
      await onRefresh()
    } catch (e) {
      setMsg({ ok: false, text: e.message ?? 'Onbekende fout' })
    } finally { setSaving(false) }
  }

  const fromVer = target === 'ACC' ? versions.TST : versions.ACC

  return (
    <Section title="Acties">
      <div className="space-y-2">
        {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}

        <ActieKaart
          titel="Nieuwe versie registreren"
          subtitel="in TST"
          open={openKaart === 'register'}
          onToggle={() => toggle('register')}
          icon={
            <svg className="w-3.5 h-3.5 text-mov shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
            </svg>
          }>
          <TextInput placeholder="Versie" value={versie} onChange={e => setVersie(e.target.value)} />
          <TextInput placeholder="Consultant" value={cons} onChange={e => setCons(e.target.value)} />
          <TextInput placeholder="Omschrijving (optioneel)" value={note} onChange={e => setNote(e.target.value)} />
          <TextInput placeholder="Ticket (optioneel)" value={regTicket} onChange={e => setRegTicket(e.target.value)} />
          {tstAanroepers.length > 0 && (
            <div className="text-meta text-xs">
              Wordt in TST aangeroepen door{' '}
              {tstAanroepers.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  <span className="text-ink">{a.label}</span> <span className="font-mono text-ink">{a.versions.TST}</span>
                </span>
              ))}
              <span className="text-ink-3"> — die aanroep gaat mee naar de nieuwe versie</span>
            </div>
          )}
          <div className="flex gap-2 pt-0.5">
            <Button variant="primary" className="flex-1" onClick={handleRegister}
              disabled={saving || !versie.trim() || !cons.trim()}>
              {saving ? 'Opslaan…' : 'Registreer in TST'}
            </Button>
            <Button variant="ghost" onClick={() => toggle('register')}>Annuleer</Button>
          </div>
        </ActieKaart>

        {canPromote ? (
          <ActieKaart
            titel="Promoveren"
            subtitel={canToAcc ? 'TST → ACC' : 'ACC → PROD'}
            open={openKaart === 'promote'}
            onToggle={() => toggle('promote')}
            icon={
              <svg className="w-3.5 h-3.5 text-add shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            }>
            <div className="flex rounded-lg overflow-hidden border border-line">
              {canToAcc && (
                <button onClick={() => setTarget('ACC')}
                  className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'ACC' ? 'bg-acc-bg text-acc' : 'bg-card text-ink-2 hover:text-ink'}`}>
                  TST → ACC
                </button>
              )}
              {canToProd && (
                <button onClick={() => setTarget('PROD')}
                  className={`flex-1 text-xs py-1.5 font-medium transition-colors ${target === 'PROD' ? 'bg-prod-bg text-prod' : 'bg-card text-ink-2 hover:text-ink'}`}>
                  ACC → PROD
                </button>
              )}
            </div>
            <div className="text-meta text-xs">
              <span className="font-mono text-ink">{fromVer}</span> gaat naar {target}
              <span className="text-ink-3"> — het ticket komt mee uit het werk bij deze versie</span>
            </div>
            <div className="flex gap-2 pt-0.5">
              <Button variant="green" className="flex-1" onClick={handlePromote} disabled={saving}>
                {saving ? 'Bezig…' : `Naar ${target}`}
              </Button>
              <Button variant="ghost" onClick={() => toggle('promote')}>Annuleer</Button>
            </div>
          </ActieKaart>
        ) : (
          <div className="border border-line rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-ink-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Alle omgevingen gesynchroniseerd
          </div>
        )}
      </div>
    </Section>
  )
}
