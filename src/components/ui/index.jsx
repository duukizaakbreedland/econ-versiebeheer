import { useState, useRef, useEffect } from 'react'

// ─── Sectie met kop ───────────────────────────────────────────────────────────
export function Section({ title, right, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
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
            <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
          </button>
        ) : (
          <span className="text-meta text-xs font-semibold uppercase tracking-wide">{title}</span>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {(!collapsible || open) && children}
    </section>
  )
}

// ─── Meldingsbalk ─────────────────────────────────────────────────────────────
export function Banner({ ok, children, onClose }) {
  return (
    <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-2 ${
      ok ? 'bg-add-bg text-add border border-add-bg-2'
         : 'bg-del-bg text-del border border-del-bg-2'}`}>
      <span className="flex-1">{children}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100 leading-none">×</button>
      )}
    </div>
  )
}

// ─── Invoerveld ───────────────────────────────────────────────────────────────
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

// ─── Knop ─────────────────────────────────────────────────────────────────────
// Zoals in de toolbox: Enshore-rood (het verloop) alleen voor de hoofdknop,
// al het andere neutraal. Doorzetten naar een omgeving is groen.
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
    // Meerregelig: Enter maakt een nieuwe regel, opslaan gaat met Ctrl+Enter of
    // door weg te klikken. Eenregelig blijft Enter opslaan.
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

// ─── ⋯ menu ───────────────────────────────────────────────────────────────────
// Het menu zweeft los van de pagina (position: fixed) zodat het niet wordt
// afgeknipt door een paneel met overflow, en klapt omhoog als het onderaan
// het scherm niet past.
export function Menu({ items }) {
  const [plek, setPlek] = useState(null)
  const ref = useRef(null)

  const usable = items.filter(Boolean)

  useEffect(() => {
    if (!plek) return
    function sluit(e) { if (!ref.current?.contains(e.target)) setPlek(null) }
    function opEscape(e) { if (e.key === 'Escape') setPlek(null) }
    document.addEventListener('mousedown', sluit)
    document.addEventListener('keydown', opEscape)
    window.addEventListener('scroll', () => setPlek(null), true)
    return () => {
      document.removeEventListener('mousedown', sluit)
      document.removeEventListener('keydown', opEscape)
    }
  }, [plek])

  if (usable.length === 0) return null

  const hoogte = usable.length * 30 + 8

  function toggle(e) {
    if (plek) { setPlek(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const pastOnder = window.innerHeight - r.bottom > hoogte + 12
    setPlek({
      top:   pastOnder ? r.bottom + 4 : r.top - hoogte - 4,
      right: window.innerWidth - r.right,
    })
  }

  return (
    <div ref={ref} className="inline-block">
      <button onClick={toggle}
        className="text-ink-3 hover:text-ink px-1 leading-none transition-colors"
        title="Meer acties">
        ⋯
      </button>
      {plek && (
        <div style={{ position: 'fixed', top: plek.top, right: plek.right, zIndex: 60 }}
          className="w-56 bg-card border border-line-2 rounded-lg shadow-depth-3 overflow-hidden py-1">
          {usable.map((item, i) => (
            <button key={i}
              onClick={() => { setPlek(null); item.onClick() }}
              disabled={item.disabled}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors disabled:opacity-40
                          disabled:cursor-not-allowed ${item.danger
                            ? 'text-del hover:bg-del-bg'
                            : 'text-ink hover:bg-hover'}`}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
