import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext({ session: null, loading: true, urlFout: null })

// Supabase stuurt na een magic link terug met de tokens in de hash:
//   .../#access_token=…&refresh_token=…   of bij een probleem:
//   .../#error=access_denied&error_description=…
function leesUrlHash() {
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash) return null
  const p = new URLSearchParams(hash)
  const accessToken = p.get('access_token')
  const refreshToken = p.get('refresh_token')
  const fout = p.get('error_description') || p.get('error')
  if (!accessToken && !fout) return null
  return { accessToken, refreshToken, fout: fout ? decodeURIComponent(fout.replace(/\+/g, ' ')) : null }
}

function wisHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [urlFout, setUrlFout] = useState(null)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))

    ;(async () => {
      try {
        const uit = leesUrlHash()

        if (uit?.fout) {
          setUrlFout(uit.fout)
          wisHash()
        }

        // De client pikt de hash normaal zelf op; lukt dat niet, dan wisselen we
        // de tokens hier alsnog in. Anders zou je zonder melding op het
        // inlogscherm blijven staan terwijl de inlog wél is gelukt.
        let { data } = await supabase.auth.getSession()

        if (!data.session && uit?.accessToken && uit?.refreshToken) {
          const res = await supabase.auth.setSession({
            access_token: uit.accessToken,
            refresh_token: uit.refreshToken,
          })
          if (res.error) setUrlFout(res.error.message)
          data = res.data
        }

        if (data?.session) wisHash()
        setSession(data?.session ?? null)
      } finally {
        setLoading(false)
      }
    })()

    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, urlFout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// Consultants loggen in met hun werkmail — daar zit de voornaam al in, dus die
// hoeven ze niet elke keer opnieuw in te tikken.
//   duuk.breedland@enshore.nl → Duuk
export function voornaamUitEmail(email) {
  const eerste = (email ?? '').split('@')[0].split(/[._-]/)[0]
  if (!eerste) return ''
  return eerste.charAt(0).toUpperCase() + eerste.slice(1).toLowerCase()
}

export function useVoornaam() {
  const { session } = useAuth()
  return voornaamUitEmail(session?.user?.email)
}

export async function signOut() {
  await supabase.auth.signOut()
}
