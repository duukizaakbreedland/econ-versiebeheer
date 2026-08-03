import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { Banner, Button, TextInput } from '../components/ui/index.jsx'

export default function LoginView() {
  const { urlFout } = useAuth()
  const [email,     setEmail]     = useState('')
  const [bezig,     setBezig]     = useState(false)
  const [verstuurd, setVerstuurd] = useState(false)
  const [fout,      setFout]      = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBezig(true); setFout(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (error) throw error
      setVerstuurd(true)
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
            <Banner ok={false}>Inloggen via de link mislukte: {urlFout}</Banner>
          </div>
        )}

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          {verstuurd ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>
                </svg>
                <span className="text-slate-200 text-sm font-medium">Check je mail</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Er is een inloglink gestuurd naar <span className="text-slate-200">{email}</span>.
                Klik erop om verder te gaan — de link is één keer te gebruiken.
              </p>
              <button onClick={() => { setVerstuurd(false); setEmail('') }}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                Ander e-mailadres gebruiken
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1.5">E-mailadres</label>
                <TextInput type="email" autoFocus required placeholder="jij@enshore.nl"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              {fout && <Banner ok={false} onClose={() => setFout(null)}>{fout}</Banner>}
              <Button type="submit" variant="primary" className="w-full" disabled={bezig || !email.trim()}>
                {bezig ? 'Versturen…' : 'Stuur inloglink'}
              </Button>
              <p className="text-slate-600 text-xs leading-relaxed">
                Je krijgt een link per mail, geen wachtwoord om te onthouden.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
