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
    <div className="min-h-screen hero-glow flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-3 mb-6">
          <img src={`${import.meta.env.BASE_URL}brand/icon.svg`} alt="" className="w-10 h-10 shrink-0" />
          <div>
            <h1 className="text-ink font-semibold text-base leading-none">eCon Versiebeheer</h1>
            <p className="text-meta text-xs mt-1">CPQ Model Dependency Tracker</p>
          </div>
        </div>

        {urlFout && (
          <div className="mb-3">
            <Banner ok={false}>{urlFout}</Banner>
          </div>
        )}

        <form onSubmit={handleLogin} className="bg-card border border-line rounded-xl p-5 space-y-3">
          <div>
            <label className="text-ink-2 text-xs block mb-1.5">E-mailadres</label>
            <TextInput type="email" autoFocus required autoComplete="username"
              placeholder="jij@enshore.nl" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="text-ink-2 text-xs block mb-1.5">Wachtwoord</label>
            <TextInput type="password" required autoComplete="current-password"
              value={wachtw} onChange={e => setWachtw(e.target.value)} />
          </div>

          {fout && <Banner ok={false} onClose={() => setFout(null)}>{fout}</Banner>}

          <Button type="submit" variant="primary" className="w-full" disabled={bezig || !email.trim() || !wachtw}>
            {bezig ? 'Bezig…' : 'Inloggen'}
          </Button>

          <p className="text-ink-3 text-xs leading-relaxed">
            Geen account of wachtwoord kwijt? Vraag de beheerder om er een aan te maken —
            aanmelden kan niet uit jezelf.
          </p>
        </form>
      </div>
    </div>
  )
}
