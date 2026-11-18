import type { CardPrices, CardVariant, PokemonCard } from '../types'
import { pricesFor } from '../types'
import type { SetInfo } from '../sets'

export async function fetchSetCards(set: SetInfo): Promise<PokemonCard[]> {
  const response = await fetch(set.dataUrl)
  if (!response.ok) {
    throw new Error(`Impossible de charger ${set.name} (code ${response.status})`)
  }
  return (await response.json()) as PokemonCard[]
}

export function formatPrices(prices: CardPrices): string {
  if (prices.eur != null) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(prices.eur)
  }
  if (prices.usd != null) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(prices.usd)
  }
  return '—'
}

export function formatPrice(card: PokemonCard, variant: CardVariant = 'normal'): string {
  return formatPrices(pricesFor(card, variant))
}

export function euroValue(card: PokemonCard, variant: CardVariant = 'normal'): number {
  const prices = pricesFor(card, variant)
  if (prices.eur != null) return prices.eur
  if (prices.usd != null) return prices.usd * 0.92
  return 0
}
