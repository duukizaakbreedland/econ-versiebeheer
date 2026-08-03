import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Banner, Button, TextInput } from './ui/index.jsx'

const EISEN = [
  { test: w => w.length >= 12,    tekst: 'minstens 12 tekens' },
  { test: w => /[a-z]/.test(w),   tekst: 'een kleine letter'  },
  { test: w => /[A-Z]/.test(w),   tekst: 'een hoofdletter'    },
  { test: w => /[0-9]/.test(w),   tekst: 'een cijfer'         },
]

export default function WachtwoordWijzigen({ email, onClose }) {
  const [huidig,  setHuidig]  = useState('')
  const [nieuw,   setNieuw]   = useState('')
  const [herhaal, setHerhaal] = useState('')
  const [bezig,   setBezig]   = useState(false)
  const [fout,    setFout]    = useState(null)
  const [klaar,   setKlaar]   = useState(false)

  const voldoet = EISEN.every(e => e.test(nieuw)) && nieuw === herhaal && huidig.length > 0

  async function handleOpslaan(e) {
    e.preventDefault()
    setBezig(true); setFout(null)
    try {
      // Eerst het huidige wachtwoord controleren — Supabase doet dat op dit
      // plan niet zelf, en zonder die stap kan iedereen met een openstaande
      // sessie het wachtwoord overnemen.
      const check = await supabase.auth.signInWithPassword({ email, password: huidig })
      if (check.error) {
        setFout('Je huidige wachtwoord klopt niet')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: nieuw })
      if (error) throw error
      setKlaar(true)
    } catch (err) {
      setFout(err.message ?? 'Wijzigen mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center px-6"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-5"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-slate-200 text-sm font-semibold">Wachtwoord wijzigen</h2>
          <button onClick={onClose}
            className="ml-auto text-slate-600 hover:text-slate-300 text-xl leading-none transition-colors">×</button>
        </div>

        {klaar ? (
          <div className="space-y-3">
            <Banner ok={true}>Je wachtwoord is gewijzigd.</Banner>
            <Button variant="primary" className="w-full" onClick={onClose}>Sluiten</Button>
          </div>
        ) : (
          <form onSubmit={handleOpslaan} className="space-y-3">
            <div>
              <label className="text-slate-400 text-xs block mb-1.5">Huidig wachtwoord</label>
              <TextInput type="password" autoFocus required autoComplete="current-password"
                value={huidig} onChange={e => setHuidig(e.target.value)} />
            </div>

            <div>
              <label className="text-slate-400 text-xs block mb-1.5">Nieuw wachtwoord</label>
              <TextInput type="password" required autoComplete="new-password"
                value={nieuw} onChange={e => setNieuw(e.target.value)} />
            </div>

            <div>
              <label className="text-slate-400 text-xs block mb-1.5">Nogmaals ter controle</label>
              <TextInput type="password" required autoComplete="new-password"
                value={herhaal} onChange={e => setHerhaal(e.target.value)} />
            </div>

            <ul className="space-y-0.5">
              {EISEN.map(e => {
                const ok = e.test(nieuw)
                return (
                  <li key={e.tekst} className={`text-xs flex items-center gap-1.5 ${ok ? 'text-green-500' : 'text-slate-600'}`}>
                    <span>{ok ? '✓' : '·'}</span> {e.tekst}
                  </li>
                )
              })}
              <li className={`text-xs flex items-center gap-1.5 ${
                herhaal && nieuw === herhaal ? 'text-green-500' : 'text-slate-600'}`}>
                <span>{herhaal && nieuw === herhaal ? '✓' : '·'}</span> beide velden gelijk
              </li>
            </ul>

            {fout && <Banner ok={false} onClose={() => setFout(null)}>{fout}</Banner>}

            <Button type="submit" variant="primary" className="w-full" disabled={bezig || !voldoet}>
              {bezig ? 'Opslaan…' : 'Wachtwoord wijzigen'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
