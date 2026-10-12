import { useState } from 'react'
import OverzichtView from './views/OverzichtView.jsx'
import GraphView from './views/GraphView.jsx'
import ReleaseView from './views/ReleaseView.jsx'
import BeheerView from './views/BeheerView.jsx'
import LoginView from './views/LoginView.jsx'
import WachtwoordWijzigen from './components/WachtwoordWijzigen.jsx'
import { useChains } from './hooks/useChains.js'
import { useAuth, signOut } from './lib/auth.jsx'
import { ThemeToggle } from './lib/theme.jsx'

const TABS = [
  { id: 'overzicht', label: 'Overzicht',            icon: IconGrid },
  { id: 'graph',     label: 'Dependency Graph',     icon: IconGraph },
  { id: 'release',   label: 'Release geschiedenis',  icon: IconHistory },
  { id: 'beheer',    label: 'Beheer',                icon: IconSettings },
]

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
  const [activeTab,     setActiveTab]     = useState('overzicht')
  const [selectedChain, setSelectedChain] = useState(null)
  const [wachtwoordOpen, setWachtwoordOpen] = useState(false)
  const { session, loading: authLoading } = useAuth()
  const { chains, loading, error, refresh } = useChains(session ? 'buva' : null)

  function navigateToGraph(chainKey) {
    setSelectedChain(chainKey)
    setActiveTab('graph')
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center text-meta text-sm">
        Laden…
      </div>
    )
  }

  if (!session) return <LoginView />

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <Header loading={loading} error={error} onRefresh={refresh}
        email={session.user?.email} onWachtwoord={() => setWachtwoordOpen(true)} />
      {wachtwoordOpen && (
        <WachtwoordWijzigen email={session.user?.email} onClose={() => setWachtwoordOpen(false)} />
      )}
      <Tabs active={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-hidden">
        {activeTab === 'overzicht' && <OverzichtView chains={chains} loading={loading} error={error} onBekijkGraph={navigateToGraph} />}
        {activeTab === 'graph'     && <GraphView chains={chains} initialChain={selectedChain} onRefresh={refresh} />}
        {activeTab === 'release'   && <ReleaseView />}
        {activeTab === 'beheer'    && <BeheerView onRefresh={refresh} />}
      </main>
    </div>
  )
}

// De balk heeft de vorm van de toolboxbalk (44 px, schaduw naar beneden,
// themaschakelaar rechts), maar de app staat op zichzelf: geen link naar het
// portaal, en het Enshore-icoon in plaats van het toolbox-logo.
function Header({ loading, error, onRefresh, email, onWachtwoord }) {
  const icoonKnop = 'p-1.5 rounded-md text-meta hover:text-ink hover:bg-hover transition-colors'
  return (
    <header className="app-bar px-4 flex items-center gap-3 shrink-0">
      <img src={`${import.meta.env.BASE_URL}brand/icon.svg`} alt="" className="w-7 h-7 shrink-0" />
      <h1 className="text-ink font-semibold text-sm leading-none">eCon Versiebeheer</h1>
      <span className="text-ink-3 text-xs hidden md:inline">
        <span className="mr-2 text-line-2">/</span>CPQ Model Dependency Tracker
      </span>

      <div className="ml-auto flex items-center gap-2">
        {error && <span className="text-del text-xs">Verbindingsfout</span>}
        <button onClick={onRefresh} disabled={loading} className={`${icoonKnop} disabled:opacity-40`}
          title="Vernieuwen">
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
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

// Tabbladen zoals in de toolbox: het actieve tabblad neutraal (accent), niet
// in een merkkleur — rood betekent in de apps al iets anders.
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
              isActive
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            <Icon />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
