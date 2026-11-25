import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cardmarketEuroValue,
  euroValue,
  formatCardmarketPrice,
  formatPrice,
} from '../api/pokemon'
import {
  parseListItemKey,
  type CustomList,
} from '../hooks/useCustomLists'
import type { CardStatus, CardVariant, PokemonCard } from '../types'
import {
  downloadText,
  formatSearchList,
  slugify,
  type ListEntry,
  type ListFormat,
} from '../utils/lists'
import { downloadListImage } from '../utils/listImage'

interface SetOption {
  id: string
  name: string
  shortName: string
}

interface Props {
  sets?: SetOption[]
  cardsBySet: Record<string, PokemonCard[]>
  getStatus: (setId: string, id: string, variant: CardVariant) => CardStatus
  lists: CustomList[]
  createList: (name: string) => string
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => void
  removeCard: (id: string, setId: string, cardId: string, variant: CardVariant) => void
  clearSelection: (id: string) => void
}

export function CustomLists({
  sets = [],
  cardsBySet,
  getStatus,
  lists,
  createList,
  renameList,
  deleteList,
  removeCard,
  clearSelection,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(lists[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [format, setFormat] = useState<ListFormat>('numbers-names')
  const [copied, setCopied] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null

  useEffect(() => {
    if (active && !lists.some((l) => l.id === active.id)) {
      setActiveId(lists[0]?.id ?? null)
    }
  }, [lists, active])

  const setNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const set of sets) map.set(set.id, set.name)
    return map
  }, [sets])

  const selectedEntries = useMemo(() => {
    if (!active) return [] as ListEntry[]
    const entries: ListEntry[] = []
    for (const key of active.selected) {
      const parsed = parseListItemKey(key)
      if (!parsed) continue
      const card = (cardsBySet[parsed.setId] ?? []).find((c) => c.id === parsed.cardId)
      if (!card) continue
      if (parsed.variant === 'reverse' && !card.hasReverse) continue
      entries.push({
        card,
        variant: parsed.variant,
        status: getStatus(parsed.setId, parsed.cardId, parsed.variant),
        setName: setNameById.get(parsed.setId) ?? parsed.setId,
      })
    }
    return entries.sort((a, b) => {
      const bySet = (a.setName ?? '').localeCompare(b.setName ?? '', 'fr')
      if (bySet !== 0) return bySet
      const byNum = Number.parseInt(a.card.number, 10) - Number.parseInt(b.card.number, 10)
      if (byNum !== 0) return byNum
      return a.variant.localeCompare(b.variant)
    })
  }, [active, cardsBySet, getStatus, setNameById])

  const searchEntries = useMemo(
    () => selectedEntries.filter((entry) => entry.status !== 'owned'),
    [selectedEntries],
  )
  const alreadyOwnedCount = selectedEntries.length - searchEntries.length

  const selectedValue = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + euroValue(e.card, e.variant), 0),
    [selectedEntries],
  )
  const selectedCardmarketValue = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + cardmarketEuroValue(e.card, e.variant), 0),
    [selectedEntries],
  )
  const toBuyValue = useMemo(
    () => searchEntries.reduce((sum, e) => sum + euroValue(e.card, e.variant), 0),
    [searchEntries],
  )

  const money = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n)

  const listValues = useMemo(() => {
    const map = new Map<string, { count: number; toBuy: number }>()
    for (const list of lists) {
      let count = 0
      let toBuy = 0
      for (const key of list.selected) {
        const parsed = parseListItemKey(key)
        if (!parsed) continue
        const card = (cardsBySet[parsed.setId] ?? []).find((c) => c.id === parsed.cardId)
        if (!card) continue
        count += 1
        if (getStatus(parsed.setId, parsed.cardId, parsed.variant) !== 'owned') {
          toBuy += euroValue(card, parsed.variant)
        }
      }
      map.set(list.id, { count, toBuy })
    }
    return map
  }, [lists, cardsBySet, getStatus])

  const text = useMemo(() => {
    if (!active || searchEntries.length === 0) return ''
    const body = formatSearchList(searchEntries, format, {
      title: active.name,
      subtitle: 'Liste d’achat (cartes pas encore possédées)',
    })
    if (format !== 'csv') return body
    return `${body}\ntotal_cartes;${searchEntries.length}\ntotal_tcgplayer_eur;${toBuyValue.toFixed(2)}\ntotal_cardmarket_eur;${searchEntries.reduce((sum, entry) => sum + cardmarketEuroValue(entry.card, entry.variant), 0).toFixed(2)}`
  }, [active, format, searchEntries, toBuyValue])

  function openList(id: string) {
    setActiveId(id)
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleCreate() {
    const id = createList(newName || `Achats ${lists.length + 1}`)
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
    const extension = format === 'csv' ? 'csv' : 'txt'
    downloadText(text, `${slugify(active.name)}-achats.${extension}`)
  }

  async function downloadImage() {
    if (!active || selectedEntries.length === 0 || imageBusy) return
    setImageBusy(true)
    setImageError(null)
    try {
      await downloadListImage({
        title: active.name,
        setName: 'Plusieurs séries',
        rows: selectedEntries.map((entry) => ({
          number: entry.card.number,
          name: `${entry.card.name}${entry.setName ? ` · ${entry.setName}` : ''}`,
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
      setImageError('Impossible de créer l’image.')
    } finally {
      setImageBusy(false)
    }
  }

  return (
    <div className="lists-layout">
      <aside className="panel lists-sidebar">
        <h2>Mes listes</h2>
        <p className="muted lists-intro">
          Listes d’achat multi-séries. Ajoute des cartes depuis Collection avec le bouton « + Liste ».
        </p>

        <div className="lists-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex. Achats week-end"
            aria-label="Nom de la nouvelle liste"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <button type="button" className="btn primary" onClick={handleCreate}>
            Créer
          </button>
        </div>

        {lists.length === 0 ? (
          <p className="state-msg">Aucune liste. Crée-en une, puis ajoute des cartes depuis Collection.</p>
        ) : (
          <ul className="lists-nav">
            {lists.map((list) => {
              const values = listValues.get(list.id)
              const activeList = active?.id === list.id
              return (
                <li key={list.id}>
                  <button
                    type="button"
                    className={activeList ? 'lists-nav-item active' : 'lists-nav-item'}
                    onClick={() => openList(list.id)}
                  >
                    <span className="lists-nav-name">{list.name}</span>
                    <span className="lists-nav-meta">
                      {values?.count ?? 0} carte{(values?.count ?? 0) > 1 ? 's' : ''}
                      {values && values.toBuy > 0 ? ` · ${money(values.toBuy)}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      <section className="panel lists-detail" ref={detailRef}>
        {!active ? (
          <p className="state-msg">Choisis ou crée une liste pour commencer.</p>
        ) : (
          <>
            <header className="lists-detail-head">
              <div>
                <label className="lists-rename">
                  Nom de la liste
                  <input
                    type="text"
                    value={active.name}
                    onChange={(e) => renameList(active.id, e.target.value)}
                  />
                </label>
                <p className="hero-sub">
                  {selectedEntries.length} carte{selectedEntries.length > 1 ? 's' : ''} · à acheter{' '}
                  <strong>{money(toBuyValue)}</strong>
                  {alreadyOwnedCount > 0
                    ? ` · ${alreadyOwnedCount} déjà possédée${alreadyOwnedCount > 1 ? 's' : ''}`
                    : ''}
                </p>
              </div>
              <div className="hero-tool-actions">
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() => {
                    if (window.confirm(`Supprimer la liste « ${active.name} » ?`)) {
                      deleteList(active.id)
                    }
                  }}
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={selectedEntries.length === 0}
                  onClick={() => {
                    if (window.confirm('Vider toutes les cartes de cette liste ?')) {
                      clearSelection(active.id)
                    }
                  }}
                >
                  Vider
                </button>
              </div>
            </header>

            {selectedEntries.length === 0 ? (
              <p className="state-msg">
                Liste vide. Va dans Collection, ouvre une carte, puis clique sur « + Liste ».
              </p>
            ) : (
              <ul className="lists-cart">
                {selectedEntries.map((entry) => {
                  const parsedSetId = entry.card.setId
                  return (
                    <li
                      key={`${parsedSetId}|${entry.card.id}|${entry.variant}`}
                      className="lists-cart-row"
                    >
                      <img
                        src={entry.card.imageSmall}
                        alt=""
                        width={48}
                        height={67}
                        loading="lazy"
                      />
                      <div className="lists-cart-copy">
                        <strong>
                          {entry.card.number} — {entry.card.name}
                          {entry.variant === 'reverse' ? ' (reverse)' : ''}
                        </strong>
                        <span>
                          {entry.setName} · {entry.card.rarity} · {formatPrice(entry.card, entry.variant)}
                          {entry.status === 'owned' ? ' · déjà possédée' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost danger"
                        onClick={() =>
                          removeCard(active.id, parsedSetId, entry.card.id, entry.variant)
                        }
                      >
                        Retirer
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="lists-export">
              <h3>Exporter les cartes à acheter</h3>
              <p className="muted">
                Les cartes déjà « J’ai » sont exclues de l’export ({alreadyOwnedCount}).
              </p>
              <div className="controls-row">
                <label>
                  Format
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ListFormat)}
                  >
                    <option value="numbers-names">Numéros + noms</option>
                    <option value="numbers">Numéros seuls</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
                <button type="button" className="btn ghost" disabled={!text} onClick={copy}>
                  {copied ? 'Copié' : 'Copier'}
                </button>
                <button type="button" className="btn ghost" disabled={!text} onClick={download}>
                  Télécharger
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={selectedEntries.length === 0 || imageBusy}
                  onClick={downloadImage}
                >
                  {imageBusy ? 'Image…' : 'Image PNG'}
                </button>
              </div>
              {imageError && <p className="state-msg error">{imageError}</p>}
              {text && <pre className="lists-export-preview">{text}</pre>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
