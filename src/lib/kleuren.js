// Kleurrollen voor inline styles (React Flow-nodes, statuslabels). Alles verwijst
// naar tokens uit src/styles/theme.css, zodat licht en donker vanzelf kloppen.
// Nooit een kleurcode hier, en geen hex+alpha meer ('#22c55e20'): met een var()
// kan dat niet. Een getint vlak komt uit de -bg/-bg-2 van dezelfde familie.

const familie = naam => ({
  ink:  `var(--${naam}-ink)`,
  bg:   `var(--${naam}-bg)`,
  line: `var(--${naam}-bg-2)`,
})

// Betekenis per tint, gelijk aan de toolbox waar die overlapt
export const GROEN  = familie('add')   // gelijk, klaar, PROD
export const GEEL   = familie('chg')   // in ontwikkeling, TST
export const BLAUW  = familie('mov')   // klaar voor PROD, ACC
export const ORANJE = familie('mid')   // loopt achter, meerdere plekken open
export const VIOLET = familie('cond')  // wijkt af, gedeeld
export const ROOD   = familie('del')   // ontbreekt in de export, fout
export const GRIJS  = { ink: 'var(--ink-3)', bg: 'var(--off-bg)', line: 'var(--line)' }

export const ENV = { PROD: GROEN, ACC: BLAUW, TST: GEEL }

// Een label of chip in de kleur van een familie
export const tint = f => ({ background: f.bg, color: f.ink, border: `1px solid ${f.line}` })
