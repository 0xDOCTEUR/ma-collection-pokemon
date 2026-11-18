import { useMemo, useState } from 'react'
import type { CardStatus, CardVariant, PokemonCard } from '../types'
import {
  buildEntries,
  downloadText,
  formatList,
  slugify,
  type ListEntry,
  type ListFormat,
} from '../utils/lists'

interface Props {
  setName: string
  cards: PokemonCard[]
  getStatus: (cardId: string, variant: CardVariant) => CardStatus
}

type ListKind = 'complete' | 'owned' | 'missing' | 'wanted'

const KIND_LABEL: Record<ListKind, string> = {
  complete: 'Liste complète',
  owned: 'Cartes possédées',
  missing: 'Cartes manquantes',
  wanted: 'Cartes recherchées',
}

function filterEntries(all: ListEntry[], kind: ListKind): ListEntry[] {
  if (kind === 'complete') return all
  if (kind === 'owned') return all.filter((e) => e.status === 'owned')
  if (kind === 'missing') return all.filter((e) => e.status !== 'owned')
  return all.filter((e) => e.status === 'wanted')
}

export function ExportPanel({ setName, cards, getStatus }: Props) {
  const [format, setFormat] = useState<ListFormat>('numbers-names')
  const [kind, setKind] = useState<ListKind>('owned')
  const [copied, setCopied] = useState(false)

  const allEntries = useMemo(() => buildEntries(cards, getStatus), [cards, getStatus])

  const counts = useMemo(
    () => ({
      complete: allEntries.length,
      owned: allEntries.filter((e) => e.status === 'owned').length,
      missing: allEntries.filter((e) => e.status !== 'owned').length,
      wanted: allEntries.filter((e) => e.status === 'wanted').length,
    }),
    [allEntries],
  )

  const entries = useMemo(() => filterEntries(allEntries, kind), [allEntries, kind])
  const text = useMemo(() => formatList(entries, format), [entries, format])

  const filenameBase = `${slugify(setName) || 'collection'}-${kind}`
  const filename = `${filenameBase}.${format === 'csv' ? 'csv' : 'txt'}`

  async function copy() {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function download() {
    if (!text) return
    downloadText(text, filename)
  }

  function downloadQuick(target: ListKind) {
    const list = filterEntries(allEntries, target)
    const body = formatList(list, 'numbers-names')
    downloadText(body, `${slugify(setName)}-${target}.txt`)
  }

  const emptyMessage =
    kind === 'owned'
      ? 'Aucune carte possédée pour le moment. Coche « J’ai » sur tes cartes.'
      : kind === 'wanted'
        ? 'Aucune carte recherchée pour le moment.'
        : kind === 'missing'
          ? 'Bravo, tu as tout ! Aucune carte manquante.'
          : 'Aucune carte dans cette série.'

  return (
    <section className="export panel" id="export">
      <div className="export-head">
        <div>
          <h2>Voir et télécharger les listes</h2>
          <p className="muted">
            Possédées, manquantes, recherchées ou complète · reverse notées avec un R (ex. 25R)
          </p>
        </div>
      </div>

      <div className="export-quick">
        <button type="button" className="btn primary" onClick={() => setKind('owned')}>
          Voir les possédées ({counts.owned})
        </button>
        <button type="button" className="btn ghost" onClick={() => downloadQuick('owned')}>
          Télécharger les possédées
        </button>
        <button type="button" className="btn ghost" onClick={() => downloadQuick('missing')}>
          Télécharger les manquantes
        </button>
        <button type="button" className="btn ghost" onClick={() => downloadQuick('complete')}>
          Télécharger la liste complète
        </button>
      </div>

      <div className="export-filters">
        <label>
          Liste affichée
          <select value={kind} onChange={(e) => setKind(e.target.value as ListKind)}>
            <option value="owned">Possédées ({counts.owned})</option>
            <option value="missing">Manquantes ({counts.missing})</option>
            <option value="wanted">Recherchées ({counts.wanted})</option>
            <option value="complete">Complète ({counts.complete})</option>
          </select>
        </label>
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as ListFormat)}>
            <option value="numbers">Numéros (1, 4, 25R…)</option>
            <option value="numbers-names">Numéro + nom</option>
            <option value="csv">Tableau CSV</option>
          </select>
        </label>
      </div>

      {entries.length === 0 ? (
        <p className="muted export-empty">{emptyMessage}</p>
      ) : (
        <>
          <p className="muted export-count">
            {KIND_LABEL[kind]} · {entries.length} version(s)
          </p>
          <textarea className="export-box" readOnly value={text} rows={8} />
          <div className="export-actions">
            <button type="button" className="btn primary" onClick={copy}>
              {copied ? 'Copié !' : 'Copier la liste'}
            </button>
            <button type="button" className="btn ghost" onClick={download}>
              Télécharger ({filename})
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export type { ListEntry }
