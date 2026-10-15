import { useEffect, useState } from 'react'
import OverzichtView from './views/OverzichtView.jsx'
import GraphView from './views/GraphView.jsx'
import ReleaseView from './views/ReleaseView.jsx'
import BeheerView from './views/BeheerView.jsx'
import LoginView from './views/LoginView.jsx'
import WachtwoordWijzigen from './components/WachtwoordWijzigen.jsx'
import Uitleg from './components/Uitleg.jsx'
import { SnapshotProvider, useSnapshot } from './hooks/useSnapshot.jsx'
import { useAuth, signOut } from './lib/auth.jsx'
import { ThemeToggle } from './lib/theme.jsx'
import { useRoute } from './lib/route.js'
import { ToastProvider } from './components/ui/index.jsx'

const TABS = [
  { id: 'overzicht', label: 'Overzicht', icon: IconGrid },
  { id: 'ketens',    label: 'Ketens',    icon: IconGraph },
  { id: 'releases',  label: 'Releases',  icon: IconHistory },
  { id: 'beheer',    label: 'Beheer',    icon: IconSettings },
]

const UITLEG_GEZIEN = 'uitlegGezien'

function IconGrid({ c = 'w-4 h-4' }) {
  return (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}

function IconGraph({ c = 'w-4 h-4' }) {
  return (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}

function IconSettings({ c = 'w-4 h-4' }) {
  return (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
    </svg>
  )
}

function IconHistory({ c = 'w-4 h-4' }) {
  return (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

export default function App() {
  const { session, loading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center text-meta text-sm">
        Laden…
      </div>
    )
  }

  if (!session) return <LoginView />

  return (
    <ToastProvider>
      <SnapshotProvider orgSlug="buva">
        <Shell email={session.user?.email} />
      </SnapshotProvider>
    </ToastProvider>
  )
}

function Shell({ email }) {
  const { route, ga } = useRoute()
  const { loading, error, refresh } = useSnapshot()
  const [wachtwoordOpen, setWachtwoordOpen] = useState(false)
  const [uitlegOpen, setUitlegOpen] = useState(() => {
    try { return localStorage.getItem(UITLEG_GEZIEN) !== 'ja' } catch { return false }
  })

  function sluitUitleg() {
    setUitlegOpen(false)
    try { localStorage.setItem(UITLEG_GEZIEN, 'ja') } catch { /* privémodus */ }
  }

  // "/" zet de cursor in het zoekveld van de actieve view
  useEffect(() => {
    function opToets(e) {
      if (e.key !== '/' || e.target.closest('input, textarea, select, [contenteditable]')) return
      const veld = document.querySelector('[data-zoekveld]')
      if (veld) { e.preventDefault(); veld.focus() }
    }
    document.addEventListener('keydown', opToets)
    return () => document.removeEventListener('keydown', opToets)
  }, [])

  return (
    <div className="h-screen bg-page flex flex-col">
      <Header loading={loading} error={error} onRefresh={refresh} email={email}
        onWachtwoord={() => setWachtwoordOpen(true)} onUitleg={() => setUitlegOpen(true)} />
      {wachtwoordOpen && <WachtwoordWijzigen email={email} onClose={() => setWachtwoordOpen(false)} />}
      {uitlegOpen && <Uitleg onClose={sluitUitleg} />}
      <Tabs active={route.tab} onChange={tab => ga({ tab, keten: null, model: null, query: {} })} />
      <main className="flex-1 overflow-hidden">
        {route.tab === 'overzicht' && <OverzichtView ga={ga} />}
        {route.tab === 'ketens'    && <GraphView route={route} ga={ga} />}
        {route.tab === 'releases'  && <ReleaseView route={route} ga={ga} />}
        {route.tab === 'beheer'    && <BeheerView ga={ga} />}
      </main>
    </div>
  )
}

function Header({ loading, error, onRefresh, email, onWachtwoord, onUitleg }) {
  const icoonKnop = 'p-1.5 rounded-md text-meta hover:text-ink hover:bg-hover transition-colors'
  return (
    <header className="app-bar px-4 flex items-center gap-3 shrink-0">
      <img src={`${import.meta.env.BASE_URL}brand/icon.svg`} alt="" className="w-7 h-7 shrink-0" />
      <h1 className="text-ink font-semibold text-sm leading-none">eCon Versiebeheer</h1>
      <span className="text-ink-3 text-xs hidden md:inline">
        <span className="mr-2 text-line-2">/</span>welke versie draait waar, en wie roept wat aan
      </span>

      <div className="ml-auto flex items-center gap-2">
        {error && <span className="text-del text-xs" title={error}>Verbindingsfout</span>}
        <button onClick={onRefresh} disabled={loading} className={`${icoonKnop} disabled:opacity-40`} title="Vernieuwen">
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        <button onClick={onUitleg} className={icoonKnop} title="Uitleg: hoe werkt dit?">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
          </svg>
        </button>
        <span className="text-meta text-xs">Organisatie</span>
        <span className="bg-info-bg text-info text-xs px-2 py-0.5 rounded-md font-medium">Buva</span>
        {email && (
          <>
            <span className="w-px h-4 bg-line mx-1" />
            <span className="text-meta text-xs max-w-[14rem] truncate hidden sm:inline" title={email}>{email}</span>
            <button onClick={onWachtwoord} className={icoonKnop} title="Wachtwoord wijzigen">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </button>
            <button onClick={signOut} className={icoonKnop} title="Uitloggen">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </>
        )}
        <span className="w-px h-4 bg-line mx-1" />
        <ThemeToggle />
      </div>
    </header>
  )
}

function Tabs({ active, onChange }) {
  return (
    <nav className="bg-card border-b border-line px-4 flex gap-1 shrink-0">
      {TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
          >
            <Icon />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
