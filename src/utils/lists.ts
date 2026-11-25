import type { CardStatus, CardVariant, PokemonCard } from '../types'
import { cardmarketPricesFor, pricesFor } from '../types'

export interface ListEntry {
  card: PokemonCard
  variant: CardVariant
  status: CardStatus
  setName?: string
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
      .map((e) => {
        const setPart = e.setName ? ` [${e.setName}]` : ''
        return `${e.card.number} — ${e.card.name}${e.variant === 'reverse' ? ' (reverse)' : ''}${setPart}`
      })
      .join('\n')
  }
  return [
    'serie;numero;nom;version;statut;rarete;prix_tcgplayer_eur;prix_cardmarket_eur',
    ...entries.map((e) => {
      const price = pricesFor(e.card, e.variant)
      const cm = cardmarketPricesFor(e.card, e.variant)
      const statut = e.status === 'owned' ? 'possedee' : 'manquante'
      return `${e.setName ?? e.card.setId};${e.card.number};${e.card.name};${e.variant};${statut};${e.card.rarity};${price.eur ?? price.usd ?? ''};${cm.eur ?? ''}`
    }),
  ].join('\n')
}

/** Liste à envoyer ou à coller, à partir des cartes cochées encore à trouver. */
export function formatSearchList(
  entries: ListEntry[],
  format: ListFormat,
  options: { title: string; subtitle?: string },
): string {
  if (entries.length === 0) return ''
  if (format === 'csv') return formatList(entries, 'csv')

  const count = `${entries.length} carte${entries.length > 1 ? 's' : ''}`
  const body =
    format === 'numbers'
      ? formatList(entries, 'numbers')
      : entries
          .map((entry) => {
            const version = entry.variant === 'reverse' ? 'reverse' : 'normale'
            const setPart = entry.setName ? ` · ${entry.setName}` : ''
            return `${entry.card.number} — ${entry.card.name} · ${version} · ${entry.card.rarity}${setPart}`
          })
          .join('\n')

  const lines = [`Cartes recherchées — ${options.title}`]
  if (options.subtitle) lines.push(options.subtitle)
  lines.push('', body, '', count)
  return lines.join('\n')
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
