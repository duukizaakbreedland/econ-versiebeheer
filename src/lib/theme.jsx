import { useEffect, useState } from 'react'

// Themaschakelaar, naar het voorbeeld van econ-toolbox/shared/theme.js.
//
// Drie standen, in deze volgorde als je klikt: systeem → licht → donker.
// "Systeem" is de afwezigheid van data-theme; theme.css volgt dan zelf de
// media-query. De eerste stand zet index.html al vóór de eerste paint.
// Eigen sleutel: de app staat los van de toolbox en deelt geen instellingen.

const KEY   = 'econVersiebeheer.theme'
const ORDER = ['system', 'light', 'dark']
const LABEL = { system: 'Systeem', light: 'Licht', dark: 'Donker' }

const ICON = {
  system: <><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
  light:  <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  dark:   <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
}

const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)')

function readStored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

function apply(mode) {
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
  try {
    if (mode === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch { /* de stand werkt binnen deze sessie gewoon door */ }
}

function titel(mode) {
  if (mode === 'light') return 'Thema: licht, vastgezet. Klik voor donker.'
  if (mode === 'dark')  return 'Thema: donker, vastgezet. Klik om het systeem weer te volgen.'
  const nu = darkQuery?.matches ? 'donker' : 'licht'
  return `Thema volgt het systeem (nu ${nu}). Klik om licht vast te zetten.`
}

export function ThemeToggle() {
  const [mode, setMode] = useState(readStored)
  const [, herteken] = useState(0)

  // Zolang de stand "systeem" is, moet de titel meebewegen met Windows
  useEffect(() => {
    if (!darkQuery) return
    const volg = () => herteken(n => n + 1)
    darkQuery.addEventListener('change', volg)
    return () => darkQuery.removeEventListener('change', volg)
  }, [])

  function volgende() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    apply(next)
    setMode(next)
  }

  const t = titel(mode)
  return (
    <button type="button" className="theme-toggle" onClick={volgende} title={t} aria-label={t}>
      <svg className="w-[13px] h-[13px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON[mode]}
      </svg>
      <span className="hidden sm:inline">{LABEL[mode]}</span>
    </button>
  )
}
