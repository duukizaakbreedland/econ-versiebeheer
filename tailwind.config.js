/** @type {import('tailwindcss').Config} */

// Het palet volgt de Enshore e-Con Toolbox: elke kleur wijst naar een token uit
// src/styles/theme.css, zodat licht en donker vanzelf kloppen. Namen gelijk aan
// Matrix Compare en Trace Analyzer in de toolbox.
//
// Twee schrijfwijzen, en het verschil is niet cosmetisch:
//   var(--x)                          — kleur zonder transparantie
//   rgb(var(--x-rgb) / <alpha-value>) — kleur die óók met /40 e.d. voorkomt
// Zet je een rol die met een alpha-variant in de code staat op var(--x), dan
// verdwijnt de transparantie zonder foutmelding.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* vlakken en lijnen */
        page:        'rgb(var(--bg-rgb) / <alpha-value>)',
        card:        'rgb(var(--surface-rgb) / <alpha-value>)',
        'card-2':    'var(--surface-2)',
        line:        'rgb(var(--line-rgb) / <alpha-value>)',
        'line-2':    'var(--line-strong)',
        hover:       'var(--hover-bg)',
        overlay:     'var(--overlay-bg)',

        /* de inkttrap; ink-3 en ink-4 zijn bewust stil (geen lopende tekst) */
        ink:         'var(--ink)',
        'ink-2':     'var(--ink-2)',
        'ink-3':     'var(--ink-3)',
        'ink-4':     'var(--ink-4)',
        meta:        'var(--meta-ink)',

        /* accent: neutraal grijs voor tabbladen, selectie en focus.
           Enshore-rood (primary) alleen voor de hoofdknop en het merk. */
        accent:      'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-2':  'var(--accent-hover)',
        'accent-ink':'var(--accent-ink)',
        info:        'var(--accent-bg-ink)',
        'info-bg':   'var(--accent-bg)',
        'info-bg-2': 'var(--sel-bg-2)',
        primary:     'rgb(var(--primary-rgb) / <alpha-value>)',
        focus:       'var(--focus)',

        /* status */
        ok:          'var(--ok)',
        add:         'var(--add-ink)',
        'add-bg':    'var(--add-bg)',
        'add-bg-2':  'var(--add-bg-2)',
        del:         'var(--del-ink)',
        'del-bg':    'var(--del-bg)',
        'del-bg-2':  'var(--del-bg-2)',
        chg:         'rgb(var(--chg-ink-rgb) / <alpha-value>)',
        'chg-bg':    'var(--chg-bg)',
        'chg-bg-2':  'var(--chg-bg-2)',
        mov:         'var(--mov-ink)',
        'mov-bg':    'var(--mov-bg)',
        'mov-bg-2':  'var(--mov-bg-2)',
        cond:        'var(--cond-ink)',
        'cond-bg':   'var(--cond-bg)',
        'cond-bg-2': 'var(--cond-bg-2)',
        mid:         'rgb(var(--mid-ink-rgb) / <alpha-value>)',
        'mid-bg':    'var(--mid-bg)',
        'mid-bg-2':  'var(--mid-bg-2)',

        /* de omgevingen van deze app — zie src/index.css */
        prod:        'var(--env-prod)',
        'prod-bg':   'var(--env-prod-bg)',
        'prod-line': 'var(--env-prod-line)',
        acc:         'var(--env-acc)',
        'acc-bg':    'var(--env-acc-bg)',
        'acc-line':  'var(--env-acc-line)',
        tst:         'var(--env-tst)',
        'tst-bg':    'var(--env-tst-bg)',
        'tst-line':  'var(--env-tst-line)',
      },
      /* de dieptetrap uit theme.css als vaste klassen */
      boxShadow: {
        'depth-1': 'var(--shadow-1)',
        'depth-2': 'var(--shadow-2)',
        'depth-3': 'var(--shadow-3)',
      },
      fontFamily: {
        mono: 'var(--mono)',
      },
    },
  },
  plugins: [],
}
