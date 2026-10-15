import { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ENV, tint } from '../../lib/kleuren.js'

// ─── Sectie met kop ───────────────────────────────────────────────────────────
export function Section({ title, right, children, collapsible = false, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen)
  const kop = <>
    <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
    {count !== undefined && <span className="text-ink-3 text-xs font-normal">{count}</span>}
  </>
  return (
    <section className="border-t border-line/60 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 mb-2">
        {collapsible ? (
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-meta hover:text-ink transition-colors">
            <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
            {kop}
          </button>
        ) : (
          <span className="text-meta flex items-center gap-1.5">{kop}</span>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {(!collapsible || open) && children}
    </section>
  )
}

// ─── Meldingsbalk ─────────────────────────────────────────────────────────────
export function Banner({ ok, warn, children, onClose }) {
  const kleur = warn ? 'bg-mid-bg text-mid border border-mid-bg-2'
              : ok   ? 'bg-add-bg text-add border border-add-bg-2'
                     : 'bg-del-bg text-del border border-del-bg-2'
  return (
    <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-2 ${kleur}`}>
      <span className="flex-1 min-w-0 break-words">{children}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100 leading-none">×</button>
      )}
    </div>
  )
}

// ─── Invoer ───────────────────────────────────────────────────────────────────
export function TextInput({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full bg-page border border-line rounded-lg px-3 py-1.5 text-ink text-xs
                  focus:outline-none focus:border-accent placeholder-ink-3 ${className}`}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      {...props}
      className={`bg-page border border-line rounded-lg px-2 py-1.5 text-ink text-xs
                  focus:outline-none focus:border-accent cursor-pointer ${className}`}
    >
      {children}
    </select>
  )
}

// Gelabeld veld: label links met vaste breedte, veld rechts
export function Veld({ label, children, hint }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-ink-3 w-24 shrink-0 pt-1.5">{label}</span>
      <div className="flex-1 min-w-0">
        {children}
        {hint && <div className="text-ink-3 text-[11px] mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}

export function Checkbox({ checked, onChange, children, disabled, className = '' }) {
  return (
    <label className={`flex items-start gap-2 text-xs cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--accent)]" />
      <span className="min-w-0">{children}</span>
    </label>
  )
}

// ─── Knop ─────────────────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'btn-primary border border-transparent',
  green:   'btn-ok border border-transparent',
  outline: 'bg-card border border-line hover:border-line-2 text-ink-2 hover:text-ink',
  ghost:   'bg-transparent border border-transparent text-meta hover:text-ink',
  danger:  'bg-card border border-del-bg-2 hover:bg-del-bg text-del',
}

export function Button({ variant = 'outline', className = '', children, ...props }) {
  return (
    <button
      {...props}
      className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40
                  disabled:cursor-not-allowed flex items-center justify-center gap-1.5
                  ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// ─── Bevestigingsknop (twee stappen) ──────────────────────────────────────────
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Zeker weten?', variant = 'danger', ...props }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <Button
      {...props}
      variant={armed ? 'danger' : variant}
      onClick={() => { if (armed) { setArmed(false); onConfirm() } else setArmed(true) }}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}

// ─── Chips ────────────────────────────────────────────────────────────────────
export function EnvChip({ env, children, className = '', title }) {
  const f = ENV[env]
  if (!f) return null
  return (
    <span title={title} className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${className}`}
      style={{ background: f.bg, color: f.ink }}>
      {children ?? env}
    </span>
  )
}

export function Chip({ familie, children, className = '', title }) {
  return (
    <span title={title} className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`} style={tint(familie)}>
      {children}
    </span>
  )
}

// ─── Klik-om-te-bewerken tekst ────────────────────────────────────────────────
export function InlineEdit({ value, onSave, placeholder = '—', mono = false, multiline = false, rows = 3, className = '', textClass = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  const [busy,    setBusy]    = useState(false)
  const ref = useRef(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  async function commit() {
    const next = draft.trim()
    setEditing(false)
    if (next === (value ?? '')) return
    setBusy(true)
    try { await onSave(next) } finally { setBusy(false) }
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref}
          rows={rows}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
          }}
          className={`w-full bg-page border border-accent rounded px-2 py-1.5 text-ink text-xs
                      leading-relaxed resize-y focus:outline-none ${className}`}
        />
      )
    }
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className={`bg-page border border-accent rounded px-1.5 py-0.5 text-ink text-xs
                    focus:outline-none ${mono ? 'font-mono' : ''} ${className}`}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Klik om te bewerken"
      className={`group text-left rounded px-1 -mx-1 hover:bg-hover transition-colors
                  ${multiline ? 'flex w-full items-start gap-1' : 'inline-flex items-center gap-1'}
                  ${busy ? 'opacity-50' : ''} ${className}`}
    >
      <span className={`${mono ? 'font-mono' : ''} ${multiline ? 'whitespace-pre-wrap break-words' : ''}
                        ${value ? textClass : 'text-ink-3 italic'}`}>
        {value || placeholder}
      </span>
      <svg className={`w-2.5 h-2.5 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0
                       ${multiline ? 'mt-0.5 ml-auto' : ''}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
      </svg>
    </button>
  )
}

// ─── Dialoog ──────────────────────────────────────────────────────────────────
// Zweeft boven alles, sluit met Esc of een klik naast het venster.
export function Modal({ title, children, onClose, width = 'max-w-lg', footer }) {
  useEffect(() => {
    function opToets(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', opToets)
    return () => document.removeEventListener('keydown', opToets)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`bg-card border border-line-2 rounded-xl shadow-depth-3 w-full ${width} max-h-[90vh] flex flex-col`}
        role="dialog" aria-modal="true">
        <header className="flex items-start gap-3 px-4 pt-3 pb-3 border-b border-line">
          <div className="text-ink font-semibold text-sm flex-1 min-w-0 break-words">{title}</div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-xl leading-none shrink-0">×</button>
        </header>
        <div className="px-4 py-3 overflow-y-auto flex-1">{children}</div>
        {footer && <footer className="px-4 py-3 border-t border-line flex items-center gap-2">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
// Eén korte melding rechtsboven na een geslaagde actie; verdwijnt vanzelf.
const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const teller = useRef(0)

  const toon = useCallback((tekst, { ok = true, actie } = {}) => {
    const id = ++teller.current
    setToasts(t => [...t, { id, tekst, ok, actie }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ok ? 6000 : 10000)
  }, [])

  const value = useMemo(() => toon, [toon])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed top-14 right-4 z-[90] space-y-2 w-80 max-w-[90vw]">
          {toasts.map(t => (
            <div key={t.id} className={`text-xs px-3 py-2 rounded-lg shadow-depth-2 border flex items-start gap-2
              ${t.ok ? 'bg-add-bg text-add border-add-bg-2' : 'bg-del-bg text-del border-del-bg-2'}`}>
              <span className="flex-1 min-w-0 break-words">{t.tekst}</span>
              {t.actie && (
                <button onClick={() => { t.actie.onClick(); setToasts(x => x.filter(y => y.id !== t.id)) }}
                  className="underline shrink-0">{t.actie.label}</button>
              )}
              <button onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} className="opacity-60 hover:opacity-100 leading-none">×</button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

// ─── Lege toestand ────────────────────────────────────────────────────────────
export function Leeg({ children, className = '' }) {
  return <div className={`text-ink-3 text-xs ${className}`}>{children}</div>
}

export function Spinner({ tekst = 'Laden…' }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <svg className="w-6 h-6 text-meta animate-spin mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
        <div className="text-meta text-sm">{tekst}</div>
      </div>
    </div>
  )
}
