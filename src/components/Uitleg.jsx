import { Modal, EnvChip, Chip } from './ui/index.jsx'
import { ORANJE, VIOLET, ROOD, GEEL, BLAUW, GROEN } from '../lib/kleuren.js'
import { STATUS_CFG } from '../lib/chainUtils.js'

// Het hele idee in één scherm, voor wie hier voor het eerst komt.
export default function Uitleg({ onClose }) {
  return (
    <Modal title="Hoe werkt eCon Versiebeheer?" onClose={onClose} width="max-w-2xl">
      <div className="space-y-4 text-xs text-ink-2 leading-relaxed">
        <section>
          <h3 className="text-ink font-semibold mb-1">In vijf zinnen</h3>
          <p>
            Een <b className="text-ink">keten</b> is een hoofdmodel uit eCon, met alles wat het aanroept.
            Per omgeving (<EnvChip env="TST" /> <EnvChip env="ACC" /> <EnvChip env="PROD" />) draait het hoofdmodel op één versie;
            elk <b className="text-ink">submodel</b> eronder draait op de versie die zijn <b className="text-ink">ouder aanroept</b>, via een <b className="text-ink">interface</b>.
            Hetzelfde submodel mag door meerdere ouders en in meerdere ketens worden aangeroepen, ook op verschillende versies tegelijk.
            Een nieuwe versie gaat altijd <b className="text-ink">Registreren in TST → Promoveren naar ACC → Promoveren naar PROD</b>, elke stap met een ticket en terug te draaien.
            Vóór elke actie zie je precies wat er verandert, ook in andere ketens.
          </p>
        </section>

        <section>
          <h3 className="text-ink font-semibold mb-1">De vier acties</h3>
          <ul className="space-y-1">
            <li><b className="text-ink">Registreren</b>: nieuwe versie in TST, met wie eraan werkt en welk ticket. De ouders in TST gaan hem aanroepen; zijn eigen aanroepen neemt hij over van de vorige versie.</li>
            <li><b className="text-ink">Promoveren</b>: de versie uit TST naar ACC (of ACC naar PROD), met ticket en tester. Dat is een <b className="text-ink">release</b>. De ouders in de doelomgeving gaan hem aanroepen.</li>
            <li><b className="text-ink">Terugdraaien</b>: een release ongedaan maken, met reden. De release blijft in de geschiedenis staan als teruggedraaid.</li>
            <li><b className="text-ink">Verwijderen</b>: een versie die verkeerd is geregistreerd weghalen. Kan alleen als hij alleen in TST staat en niet in een release zit.</li>
          </ul>
        </section>

        <section>
          <h3 className="text-ink font-semibold mb-1">Wat de symbolen betekenen</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Legenda kleur={GEEL}   teken="↑">nieuwer dan PROD (werk onderweg)</Legenda>
            <Legenda kleur={ORANJE} teken="↓">ouder dan PROD (loopt achter)</Legenda>
            <Legenda kleur={VIOLET} teken="≠">niet te vergelijken met PROD</Legenda>
            <Legenda kleur={ROOD}   teken="⚠">versie ontbreekt in eCon</Legenda>
            <Legenda kleur={VIOLET} teken="⧉">model wordt ook in andere ketens gebruikt</Legenda>
            <Legenda kleur={GEEL}   teken="●">lopend werk aan deze versie</Legenda>
          </div>
        </section>

        <section>
          <h3 className="text-ink font-semibold mb-1">Status van een keten</h3>
          <div className="space-y-1">
            {Object.values(STATUS_CFG).map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <Chip familie={s.familie}>{s.label}</Chip>
                <span>{s.uitleg}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-ink font-semibold mb-1">Begrippen</h3>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-ink">Keten</dt><dd>een hoofdmodel met alles wat het aanroept</dd>
            <dt className="text-ink">Hoofdmodel</dt><dd>het model dat eCon start (Generic Model); draait per omgeving op één actuele versie</dd>
            <dt className="text-ink">Submodel</dt><dd>een model dat door een ander model wordt aangeroepen</dd>
            <dt className="text-ink">Interface</dt><dd>het koppelstuk tussen ouder en submodel, met een eigen versie</dd>
            <dt className="text-ink">Aanroep</dt><dd>ouder → submodel via interface, per omgeving en per ouderversie</dd>
            <dt className="text-ink">Aanwezig</dt><dd>de versie bestaat in die omgeving</dd>
            <dt className="text-ink">Actueel</dt><dd>de versie die het hoofdmodel daar nu draait</dd>
            <dt className="text-ink">Release</dt><dd>één promotie, met ticket en tester</dd>
            <dt className="text-ink">Werk</dt><dd>wie werkt aan welke versie, met ticket en status</dd>
          </dl>
        </section>

        <section>
          <h3 className="text-ink font-semibold mb-1">Handig</h3>
          <ul className="space-y-0.5">
            <li>Klik op een model in de keten: het paneel rechts toont alles over dat model, en zijn pad licht op.</li>
            <li>Het adres in de browser wijst naar de keten en het model; stuur het door als link.</li>
            <li><kbd className="font-mono bg-page border border-line rounded px-1">/</kbd> springt naar het zoekveld, <kbd className="font-mono bg-page border border-line rounded px-1">Esc</kbd> sluit panelen.</li>
            <li>Deze uitleg staat altijd achter het vraagteken rechtsboven.</li>
          </ul>
        </section>
      </div>
    </Modal>
  )
}

function Legenda({ kleur, teken, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded flex items-center justify-center font-bold shrink-0"
        style={{ background: kleur.bg, color: kleur.ink }}>{teken}</span>
      <span>{children}</span>
    </div>
  )
}
