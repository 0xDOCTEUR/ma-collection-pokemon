import { useDeferredValue, useMemo, useState } from 'react'
import { euroValue, formatPrice } from '../api/pokemon'
import type { CustomList } from '../hooks/useCustomLists'
import { SETS } from '../sets'
import type { CardVariant, PokemonCard } from '../types'
import { variantKey } from '../types'
import {
  downloadText,
  formatList,
  slugify,
  type ListEntry,
  type ListFormat,
} from '../utils/lists'

interface Props {
  cardsBySet: Record<string, PokemonCard[]>
  lists: CustomList[]
  createList: (name: string, setId: string) => string
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => void
  setListSet: (id: string, setId: string) => void
  toggleCard: (id: string, cardId: string, variant: CardVariant) => void
  clearSelection: (id: string) => void
  selectMany: (id: string, keys: string[], mode: 'add' | 'replace') => void
}

export function CustomLists({
  cardsBySet,
  lists,
  createList,
  renameList,
  deleteList,
  setListSet,
  toggleCard,
  clearSelection,
  selectMany,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(lists[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [newSetId, setNewSetId] = useState(SETS[0]?.id ?? 'sv03.5')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [format, setFormat] = useState<ListFormat>('numbers-names')
  const [copied, setCopied] = useState(false)
  const [onlySelected, setOnlySelected] = useState(false)

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null

  const setInfo = SETS.find((s) => s.id === active?.setId)
  const cards = active ? (cardsBySet[active.setId] ?? []) : []
  const selectedSet = useMemo(() => new Set(active?.selected ?? []), [active?.selected])

  const selectedEntries = useMemo(() => {
    if (!active) return [] as ListEntry[]
    const entries: ListEntry[] = []
    for (const card of cards) {
      const normalKey = variantKey(card.id, 'normal')
      if (selectedSet.has(normalKey)) {
        entries.push({ card, variant: 'normal', status: 'missing' })
      }
      if (card.hasReverse) {
        const reverseKey = variantKey(card.id, 'reverse')
        if (selectedSet.has(reverseKey)) {
          entries.push({ card, variant: 'reverse', status: 'missing' })
        }
      }
    }
    return entries.sort((a, b) => {
      const n = Number.parseInt(a.card.number, 10) - Number.parseInt(b.card.number, 10)
      if (n !== 0) return n
      return a.variant.localeCompare(b.variant)
    })
  }, [active, cards, selectedSet])

  const selectedValue = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + euroValue(e.card, e.variant), 0),
    [selectedEntries],
  )

  const money = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n)

  const listValues = useMemo(() => {
    const map = new Map<string, number>()
    for (const list of lists) {
      const setCards = cardsBySet[list.setId] ?? []
      const keys = new Set(list.selected)
      let total = 0
      for (const card of setCards) {
        if (keys.has(variantKey(card.id, 'normal'))) total += euroValue(card, 'normal')
        if (card.hasReverse && keys.has(variantKey(card.id, 'reverse'))) {
          total += euroValue(card, 'reverse')
        }
      }
      map.set(list.id, total)
    }
    return map
  }, [lists, cardsBySet])

  const text = useMemo(() => {
    const body = formatList(selectedEntries, format)
    if (selectedEntries.length === 0) return body
    const footer =
      format === 'csv'
        ? `\ntotal_estime_eur;${selectedValue.toFixed(2)}`
        : `\n\nEstimation totale : ${money(selectedValue)} (${selectedEntries.length} carte${selectedEntries.length > 1 ? 's' : ''})`
    return body + footer
  }, [selectedEntries, format, selectedValue])

  const visibleCards = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return cards.filter((card) => {
      if (onlySelected) {
        const hasNormal = selectedSet.has(variantKey(card.id, 'normal'))
        const hasReverse =
          card.hasReverse && selectedSet.has(variantKey(card.id, 'reverse'))
        if (!hasNormal && !hasReverse) return false
      }
      if (!q) return true
      return (
        card.name.toLowerCase().includes(q) ||
        card.number.includes(q) ||
        `${card.number}/${card.printedTotal}`.includes(q)
      )
    })
  }, [cards, deferredQuery, onlySelected, selectedSet])

  function handleCreate() {
    const id = createList(newName || `Liste ${lists.length + 1}`, newSetId)
    setActiveId(id)
    setNewName('')
  }

  async function copy() {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function download() {
    if (!active || !text) return
    downloadText(text, `${slugify(active.name)}-selection.txt`)
  }

  function selectAllVisible() {
    if (!active) return
    const keys: string[] = []
    for (const card of visibleCards) {
      keys.push(variantKey(card.id, 'normal'))
      if (card.hasReverse) keys.push(variantKey(card.id, 'reverse'))
    }
    selectMany(active.id, keys, 'add')
  }

  return (
    <section className="custom-lists">
      <header className="estimate-hero panel">
        <div>
          <p className="eyebrow">Listes perso</p>
          <h2>Crée ta liste, coche, copie</h2>
          <p className="muted">
            Choisis une collection, sélectionne les cartes (normale / reverse), puis copie la liste.
          </p>
        </div>
      </header>

      <section className="panel list-create">
        <h3>Nouvelle liste</h3>
        <div className="list-create-row">
          <label>
            Nom
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex. Achats du week-end"
            />
          </label>
          <label>
            Collection
            <select value={newSetId} onChange={(e) => setNewSetId(e.target.value)}>
              {SETS.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={handleCreate}>
            Créer la liste
          </button>
        </div>
      </section>

      {lists.length === 0 ? (
        <p className="state-msg">Aucune liste pour le moment. Crée-en une ci-dessus.</p>
      ) : (
        <>
          <div className="list-picker panel">
            {lists.map((list) => {
              const setName = SETS.find((s) => s.id === list.setId)?.shortName ?? list.setId
              const value = listValues.get(list.id) ?? 0
              return (
                <button
                  key={list.id}
                  type="button"
                  className={list.id === active?.id ? 'list-chip active' : 'list-chip'}
                  onClick={() => setActiveId(list.id)}
                >
                  <strong>{list.name}</strong>
                  <span>
                    {setName} · {list.selected.length} carte(s)
                  </span>
                  <em className="list-chip-price">{money(value)}</em>
                </button>
              )
            })}
          </div>

          {active && (
            <section className="panel list-editor">
              <div className="list-editor-head">
                <label>
                  Nom de la liste
                  <input
                    value={active.name}
                    onChange={(e) => renameList(active.id, e.target.value)}
                  />
                </label>
                <label>
                  Collection
                  <select
                    value={active.setId}
                    onChange={(e) => {
                      if (
                        active.selected.length === 0 ||
                        window.confirm(
                          'Changer de collection efface la sélection actuelle. Continuer ?',
                        )
                      ) {
                        setListSet(active.id, e.target.value)
                      }
                    }}
                  >
                    {SETS.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() => {
                    if (window.confirm(`Supprimer la liste « ${active.name} » ?`)) {
                      deleteList(active.id)
                      setActiveId(lists.find((l) => l.id !== active.id)?.id ?? null)
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>

              <div className="list-price-panel">
                <div>
                  <span className="stat-label">Estimation de la liste</span>
                  <strong className="list-price-total">{money(selectedValue)}</strong>
                  <small>
                    {selectedEntries.length} carte
                    {selectedEntries.length > 1 ? 's' : ''} sélectionnée
                    {selectedEntries.length > 1 ? 's' : ''}
                    {setInfo ? ` · ${setInfo.name}` : ''}
                    {selectedEntries.length > 0
                      ? ` · moyenne ${money(selectedValue / selectedEntries.length)}`
                      : ''}
                  </small>
                </div>
                <div className="export-actions">
                  <button type="button" className="btn ghost" onClick={selectAllVisible}>
                    Tout cocher (filtrées)
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => clearSelection(active.id)}
                  >
                    Tout décocher
                  </button>
                </div>
              </div>

              <div className="list-copy-box">
                <div className="export-filters">
                  <label>
                    Format à copier
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as ListFormat)}
                    >
                      <option value="numbers">Numéros (1, 4, 25R…)</option>
                      <option value="numbers-names">Numéro + nom</option>
                      <option value="csv">Tableau CSV</option>
                    </select>
                  </label>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={onlySelected}
                      onChange={(e) => setOnlySelected(e.target.checked)}
                    />
                    Afficher seulement la sélection
                  </label>
                </div>
                <textarea
                  className="export-box"
                  readOnly
                  rows={5}
                  value={text}
                  placeholder="Coche des cartes pour remplir la liste…"
                />
                <div className="export-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={copy}
                    disabled={selectedEntries.length === 0}
                  >
                    {copied ? 'Copié !' : 'Copier la sélection'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={download}
                    disabled={selectedEntries.length === 0}
                  >
                    Télécharger
                  </button>
                </div>
              </div>

              <label className="search list-search">
                Recherche dans {setInfo?.name ?? 'la collection'}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom ou numéro"
                />
              </label>

              <div className="select-grid">
                {visibleCards.map((card) => (
                  <SelectCard
                    key={card.id}
                    card={card}
                    selectedSet={selectedSet}
                    onToggle={(variant) => toggleCard(active.id, card.id, variant)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  )
}

function SelectCard({
  card,
  selectedSet,
  onToggle,
}: {
  card: PokemonCard
  selectedSet: Set<string>
  onToggle: (variant: CardVariant) => void
}) {
  const normalOn = selectedSet.has(variantKey(card.id, 'normal'))
  const reverseOn = card.hasReverse && selectedSet.has(variantKey(card.id, 'reverse'))
  const active = normalOn || reverseOn

  return (
    <article className={active ? 'select-tile active' : 'select-tile'}>
      <button type="button" className="tile-media" onClick={() => onToggle('normal')}>
        <img src={card.imageSmall} alt={card.name} loading="lazy" width={245} height={342} />
      </button>
      <div className="tile-body">
        <div className="tile-top">
          <span className="tile-num">
            {card.number}/{card.printedTotal}
          </span>
          <span className="tile-price">{formatPrice(card, 'normal')}</span>
        </div>
        <h3 className="tile-name">{card.name}</h3>
        <p className="tile-meta">{card.rarity}</p>
        <div className="tile-actions">
          <button
            type="button"
            className={normalOn ? 'chip active-owned' : 'chip'}
            onClick={() => onToggle('normal')}
          >
            {normalOn ? 'Normale ✓' : 'Normale'}
          </button>
          {card.hasReverse && (
            <button
              type="button"
              className={reverseOn ? 'chip active-wanted' : 'chip'}
              onClick={() => onToggle('reverse')}
            >
              {reverseOn ? 'Reverse ✓' : 'Reverse'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
