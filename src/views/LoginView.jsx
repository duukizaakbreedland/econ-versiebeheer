import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { Banner, Button, TextInput } from '../components/ui/index.jsx'

export default function LoginView() {
  const { urlFout } = useAuth()
  const [email,    setEmail]    = useState('')
  const [wachtw,   setWachtw]   = useState('')
  const [bezig,    setBezig]    = useState(false)
  const [fout,     setFout]     = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setBezig(true); setFout(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: wachtw,
      })
      if (error) {
        setFout(error.message === 'Invalid login credentials'
          ? 'E-mailadres of wachtwoord klopt niet'
          : error.message)
      }
    } catch (err) {
      setFout(err.message ?? 'Inloggen mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm leading-none">eCon Versiebeheer</h1>
            <p className="text-slate-400 text-xs mt-1">CPQ Model Dependency Tracker</p>
          </div>
        </div>

        {urlFout && (
          <div className="mb-3">
            <Banner ok={false}>{urlFout}</Banner>
          </div>
        )}

        <form onSubmit={handleLogin} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
          <div>
            <label className="text-slate-400 text-xs block mb-1.5">E-mailadres</label>
            <TextInput type="email" autoFocus required autoComplete="username"
              placeholder="jij@enshore.nl" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="text-slate-400 text-xs block mb-1.5">Wachtwoord</label>
            <TextInput type="password" required autoComplete="current-password"
              value={wachtw} onChange={e => setWachtw(e.target.value)} />
          </div>

          {fout && <Banner ok={false} onClose={() => setFout(null)}>{fout}</Banner>}

          <Button type="submit" variant="primary" className="w-full" disabled={bezig || !email.trim() || !wachtw}>
            {bezig ? 'Bezig…' : 'Inloggen'}
          </Button>

          <p className="text-slate-600 text-xs leading-relaxed">
            Geen account of wachtwoord kwijt? Vraag de beheerder om er een aan te maken —
            aanmelden kan niet uit jezelf.
          </p>
        </form>
      </div>
    </div>
  )
}
