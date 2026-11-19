import type { CardStatus, CardVariant, PokemonCard } from '../types'
import { cardmarketPricesFor, pricesFor } from '../types'

export interface ListEntry {
  card: PokemonCard
  variant: CardVariant
  status: CardStatus
}

export type ListFormat = 'numbers' | 'numbers-names' | 'csv'

export function buildEntries(
  cards: PokemonCard[],
  getStatus: (cardId: string, variant: CardVariant) => CardStatus,
): ListEntry[] {
  const entries: ListEntry[] = []
  for (const card of cards) {
    entries.push({
      card,
      variant: 'normal',
      status: getStatus(card.id, 'normal'),
    })
    if (card.hasReverse) {
      entries.push({
        card,
        variant: 'reverse',
        status: getStatus(card.id, 'reverse'),
      })
    }
  }
  return sortEntries(entries)
}

export function sortEntries(entries: ListEntry[]): ListEntry[] {
  return [...entries].sort((a, b) => {
    const n = Number.parseInt(a.card.number, 10) - Number.parseInt(b.card.number, 10)
    if (n !== 0) return n
    return a.variant.localeCompare(b.variant)
  })
}

export function formatList(entries: ListEntry[], format: ListFormat): string {
  // Conserve l’ordre fourni (tri numéro, rareté, etc. géré par l’appelant).
  if (format === 'numbers') {
    return entries
      .map((e) => (e.variant === 'reverse' ? `${e.card.number}R` : e.card.number))
      .join(', ')
  }
  if (format === 'numbers-names') {
    return entries
      .map(
        (e) =>
          `${e.card.number} — ${e.card.name}${e.variant === 'reverse' ? ' (reverse)' : ''}`,
      )
      .join('\n')
  }
  return [
    'numero;nom;version;statut;rarete;prix_tcgplayer_eur;prix_cardmarket_eur',
    ...entries.map((e) => {
      const price = pricesFor(e.card, e.variant)
      const cm = cardmarketPricesFor(e.card, e.variant)
      const statut =
        e.status === 'owned' ? 'possedee' : e.status === 'wanted' ? 'recherchee' : 'manquante'
      return `${e.card.number};${e.card.name};${e.variant};${statut};${e.card.rarity};${price.eur ?? price.usd ?? ''};${cm.eur ?? ''}`
    }),
  ].join('\n')
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
