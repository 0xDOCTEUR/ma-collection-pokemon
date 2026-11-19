import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  cardmarketEuroValue,
  euroValue,
  formatCardmarketPrice,
  formatPrice,
} from '../api/pokemon'
import type { CustomList } from '../hooks/useCustomLists'
import { SETS } from '../sets'
import type {
  CardStatus,
  CardVariant,
  FilterStatus,
  PokemonCard,
  SortKey,
} from '../types'
import { cardmarketPricesFor, pricesFor, variantKey } from '../types'
import {
  downloadText,
  formatList,
  slugify,
  type ListEntry,
  type ListFormat,
} from '../utils/lists'
import { downloadListImage } from '../utils/listImage'
import { sortRarities } from '../utils/rarity'

function compareCards(a: PokemonCard, b: PokemonCard, sort: SortKey): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
  if (sort === 'price-asc') return euroValue(a) - euroValue(b)
  if (sort === 'price-desc') return euroValue(b) - euroValue(a)
  return Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10)
}

interface Props {
  cardsBySet: Record<string, PokemonCard[]>
  getStatus: (setId: string, id: string, variant: CardVariant) => CardStatus
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
  getStatus,
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
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [rarity, setRarity] = useState('all')
  const [sort, setSort] = useState<SortKey>('number')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null

  const setInfo = SETS.find((s) => s.id === active?.setId)
  const cards = active ? (cardsBySet[active.setId] ?? []) : []
  const selectedSet = useMemo(() => new Set(active?.selected ?? []), [active?.selected])

  const rarities = useMemo(() => {
    const set = new Set(cards.map((c) => c.rarity))
    return sortRarities([...set])
  }, [cards])

  useEffect(() => {
    setQuery('')
    setFilter('all')
    setRarity('all')
    setSort('number')
    setOnlySelected(false)
  }, [active?.id, active?.setId])

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
      const byCard = compareCards(a.card, b.card, sort)
      if (byCard !== 0) return byCard
      return a.variant.localeCompare(b.variant)
    })
  }, [active, cards, selectedSet, sort])

  const selectedValue = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + euroValue(e.card, e.variant), 0),
    [selectedEntries],
  )

  const selectedCardmarketValue = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + cardmarketEuroValue(e.card, e.variant), 0),
    [selectedEntries],
  )

  const money = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n)

  const listValues = useMemo(() => {
    const map = new Map<string, { tcg: number; cardmarket: number }>()
    for (const list of lists) {
      const setCards = cardsBySet[list.setId] ?? []
      const keys = new Set(list.selected)
      let tcg = 0
      let cardmarket = 0
      for (const card of setCards) {
        if (keys.has(variantKey(card.id, 'normal'))) {
          tcg += euroValue(card, 'normal')
          cardmarket += cardmarketEuroValue(card, 'normal')
        }
        if (card.hasReverse && keys.has(variantKey(card.id, 'reverse'))) {
          tcg += euroValue(card, 'reverse')
          cardmarket += cardmarketEuroValue(card, 'reverse')
        }
      }
      map.set(list.id, { tcg, cardmarket })
    }
    return map
  }, [lists, cardsBySet])

  const text = useMemo(() => {
    const body = formatList(selectedEntries, format)
    if (selectedEntries.length === 0) return body
    const count = `${selectedEntries.length} carte${selectedEntries.length > 1 ? 's' : ''}`
    const footer =
      format === 'csv'
        ? `\ntotal_tcgplayer_eur;${selectedValue.toFixed(2)}\ntotal_cardmarket_eur;${selectedCardmarketValue.toFixed(2)}`
        : `\n\nTotal TCGPlayer : ${money(selectedValue)}\nTotal Cardmarket : ${money(selectedCardmarketValue)}\n(${count})`
    return body + footer
  }, [selectedEntries, format, selectedValue, selectedCardmarketValue])

  const visibleCards = useMemo(() => {
    if (!active) return [] as PokemonCard[]
    const q = deferredQuery.trim().toLowerCase()
    const filtered = cards.filter((card) => {
      const normalStatus = getStatus(active.setId, card.id, 'normal')
      const reverseStatus = card.hasReverse
        ? getStatus(active.setId, card.id, 'reverse')
        : ('missing' as CardStatus)

      if (onlySelected) {
        const hasNormal = selectedSet.has(variantKey(card.id, 'normal'))
        const hasReverse =
          card.hasReverse && selectedSet.has(variantKey(card.id, 'reverse'))
        if (!hasNormal && !hasReverse) return false
      }

      if (filter === 'owned') {
        if (!(normalStatus === 'owned' || reverseStatus === 'owned')) return false
      } else if (filter === 'wanted') {
        if (!(normalStatus === 'wanted' || reverseStatus === 'wanted')) return false
      } else if (filter === 'missing') {
        if (!(normalStatus === 'missing' || (card.hasReverse && reverseStatus === 'missing'))) {
          return false
        }
      } else if (filter === 'reverse-missing') {
        if (!(card.hasReverse && reverseStatus === 'missing')) return false
      } else if (filter === 'reverse-owned') {
        if (!(card.hasReverse && reverseStatus === 'owned')) return false
      }

      if (rarity !== 'all' && card.rarity !== rarity) return false
      if (!q) return true
      return (
        card.name.toLowerCase().includes(q) ||
        card.number.includes(q) ||
        `${card.number}/${card.printedTotal}`.includes(q)
      )
    })
    return [...filtered].sort((a, b) => compareCards(a, b, sort))
  }, [
    active,
    cards,
    deferredQuery,
    filter,
    getStatus,
    onlySelected,
    rarity,
    selectedSet,
    sort,
  ])

  function resetFilters() {
    setQuery('')
    setFilter('all')
    setRarity('all')
    setSort('number')
    setOnlySelected(false)
  }

  function formatQuoteDate(raw: string | null | undefined) {
    if (!raw) return null
    const [year, month, day] = raw.split(/[/-]/).map((part) => Number.parseInt(part, 10))
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const quoteDate = useMemo(() => {
    const raw = selectedEntries
      .map((entry) => pricesFor(entry.card, entry.variant).updatedAt)
      .find((value): value is string => Boolean(value))
    return formatQuoteDate(raw)
  }, [selectedEntries])

  const cardmarketQuoteDate = useMemo(() => {
    const raw = selectedEntries
      .map((entry) => cardmarketPricesFor(entry.card, entry.variant).updatedAt)
      .find((value): value is string => Boolean(value))
    return formatQuoteDate(raw)
  }, [selectedEntries])

  function openList(id: string) {
    setActiveId(id)
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

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

  async function downloadImage() {
    if (!active || selectedEntries.length === 0 || imageBusy) return
    setImageBusy(true)
    setImageError(null)
    try {
      await downloadListImage({
        title: active.name,
        setName: setInfo?.name ?? active.setId,
        rows: selectedEntries.map((entry) => ({
          number: entry.card.number,
          name: entry.card.name,
          variantLabel: entry.variant === 'reverse' ? 'Reverse' : 'Normale',
          rarity: entry.card.rarity,
          tcgPrice: formatPrice(entry.card, entry.variant),
          cardmarketPrice: formatCardmarketPrice(entry.card, entry.variant),
          imageUrl: entry.card.imageSmall,
        })),
        tcgTotal: money(selectedValue),
        cardmarketTotal: money(selectedCardmarketValue),
        filename: `${slugify(active.name)}-liste.png`,
      })
    } catch {
      setImageError('Impossible de créer l’image. Réessaie.')
    } finally {
      setImageBusy(false)
    }
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
            Clique une liste pour comparer les cotes TCGPlayer et Cardmarket, carte par carte.
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
              const value = listValues.get(list.id) ?? { tcg: 0, cardmarket: 0 }
              return (
                <button
                  key={list.id}
                  type="button"
                  className={list.id === active?.id ? 'list-chip active' : 'list-chip'}
                  onClick={() => openList(list.id)}
                >
                  <strong>{list.name}</strong>
                  <span>
                    {setName} · {list.selected.length} carte(s)
                  </span>
                  <em className="list-chip-price">
                    TCG {money(value.tcg)}
                    <span className="list-chip-price-cm">CM {money(value.cardmarket)}</span>
                  </em>
                </button>
              )
            })}
          </div>

          {active && (
            <section className="panel list-editor" ref={detailRef}>
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
                <div className="list-price-compare">
                  <div>
                    <span className="stat-label">Total TCGPlayer</span>
                    <strong className="list-price-total">{money(selectedValue)}</strong>
                    <small>Côte américaine convertie en euros</small>
                  </div>
                  <div>
                    <span className="stat-label">Total Cardmarket</span>
                    <strong className="list-price-total list-price-total-cm">
                      {money(selectedCardmarketValue)}
                    </strong>
                    <small>Côte européenne en euros</small>
                  </div>
                </div>
                <div className="list-price-side">
                  <small>
                    {selectedEntries.length} carte
                    {selectedEntries.length > 1 ? 's' : ''}
                    {setInfo ? ` · ${setInfo.name}` : ''}
                  </small>
                  {selectedEntries.length > 0 && (
                    <p className="list-price-note">
                      TCGPlayer : {quoteDate ?? 'dernier relevé'}. Cardmarket :{' '}
                      {cardmarketQuoteDate ?? 'dernier relevé'}. Indicatif pour comparer, pas un
                      prix d’achat garanti.
                    </p>
                  )}
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
              </div>

              <section className="list-contents" aria-label="Cartes de la liste">
                <div className="list-contents-head">
                  <h3>
                    Cartes dans « {active.name} »
                    {selectedEntries.length > 0 ? ` (${selectedEntries.length})` : ''}
                  </h3>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={downloadImage}
                    disabled={selectedEntries.length === 0 || imageBusy}
                  >
                    {imageBusy ? 'Création…' : 'Télécharger en image'}
                  </button>
                </div>
                {imageError && <p className="state-msg error">{imageError}</p>}
                {selectedEntries.length === 0 ? (
                  <p className="state-msg">
                    Cette liste est vide. Coche des cartes plus bas pour les ajouter.
                  </p>
                ) : (
                  <ul className="list-contents-rows">
                    {selectedEntries.map((entry) => (
                      <li key={variantKey(entry.card.id, entry.variant)}>
                        <img
                          src={entry.card.imageSmall}
                          alt=""
                          width={42}
                          height={58}
                          crossOrigin="anonymous"
                        />
                        <div>
                          <strong>
                            {entry.card.number} — {entry.card.name}
                          </strong>
                          <span>
                            {entry.variant === 'reverse' ? 'Reverse' : 'Normale'}
                            {' · '}
                            {entry.card.rarity}
                          </span>
                        </div>
                        <div className="list-contents-price">
                          <em>
                            <span className="price-source">TCG</span>
                            {formatPrice(entry.card, entry.variant)}
                          </em>
                          <em className="price-cm">
                            <span className="price-source">CM</span>
                            {formatCardmarketPrice(entry.card, entry.variant)}
                          </em>
                          <button
                            type="button"
                            className="list-row-remove"
                            onClick={() => toggleCard(active.id, entry.card.id, entry.variant)}
                          >
                            Retirer
                          </button>
                        </div>
                      </li>
                    ))}
                    <li className="list-contents-total">
                      <span>Totaux</span>
                      <div className="list-contents-totals">
                        <strong>
                          <span className="price-source">TCG</span>
                          {money(selectedValue)}
                        </strong>
                        <strong className="price-cm">
                          <span className="price-source">CM</span>
                          {money(selectedCardmarketValue)}
                        </strong>
                      </div>
                    </li>
                  </ul>
                )}
              </section>

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

              <h3 className="list-picker-title">Ajouter ou retirer des cartes</h3>
              <section className="controls panel list-controls">
                <label className="search">
                  Recherche
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nom ou numéro"
                  />
                </label>

                <label>
                  Statut
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as FilterStatus)}
                  >
                    <option value="all">Toutes</option>
                    <option value="owned">Possédées</option>
                    <option value="missing">Manquantes</option>
                    <option value="wanted">Recherchées</option>
                    <option value="reverse-missing">Reverse manquantes</option>
                    <option value="reverse-owned">Reverse possédées</option>
                  </select>
                </label>

                <label>
                  Rareté
                  <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                    <option value="all">Toutes</option>
                    {rarities.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tri
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="number">Numéro</option>
                    <option value="name">Nom</option>
                    <option value="price-desc">Côte décroissante</option>
                    <option value="price-asc">Côte croissante</option>
                  </select>
                </label>

                <button type="button" className="btn ghost danger" onClick={resetFilters}>
                  Réinitialiser
                </button>
              </section>
              <p className="result-count">
                {visibleCards.length} carte{visibleCards.length > 1 ? 's' : ''} affichée
                {visibleCards.length > 1 ? 's' : ''}
                {setInfo ? ` · ${setInfo.name}` : ''}
              </p>

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
        </div>
        <h3 className="tile-name">{card.name}</h3>
        <p className="tile-meta">{card.rarity}</p>
        <div className="tile-actions">
          <button
            type="button"
            className={normalOn ? 'chip active-owned' : 'chip'}
            onClick={() => onToggle('normal')}
          >
            <span>{normalOn ? 'Normale ✓' : 'Normale'}</span>
            <span className="chip-price">
              TCG {formatPrice(card, 'normal')}
              <span className="chip-price-cm">CM {formatCardmarketPrice(card, 'normal')}</span>
            </span>
          </button>
          {card.hasReverse && (
            <button
              type="button"
              className={reverseOn ? 'chip active-wanted' : 'chip'}
              onClick={() => onToggle('reverse')}
            >
              <span>{reverseOn ? 'Reverse ✓' : 'Reverse'}</span>
              <span className="chip-price">
                TCG {formatPrice(card, 'reverse')}
                <span className="chip-price-cm">CM {formatCardmarketPrice(card, 'reverse')}</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
