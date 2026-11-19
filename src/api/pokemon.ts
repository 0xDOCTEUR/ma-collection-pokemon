import type { CardPrices, CardVariant, PokemonCard } from '../types'
import { cardmarketPricesFor, pricesFor } from '../types'
import type { SetInfo } from '../sets'

/** Change ce numéro quand les fichiers de côtes sont mis à jour, pour éviter un vieux cache. */
const DATA_VERSION = '2026-11-19-cm'

export async function fetchSetCards(set: SetInfo): Promise<PokemonCard[]> {
  const url = `${set.dataUrl}${set.dataUrl.includes('?') ? '&' : '?'}v=${DATA_VERSION}`
  const response = await fetch(url, { cache: 'no-cache' })
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

export function formatCardmarketPrice(
  card: PokemonCard,
  variant: CardVariant = 'normal',
): string {
  return formatPrices(cardmarketPricesFor(card, variant))
}

/** Côte TCGPlayer convertie en euros (estimation actuelle de l’appli). */
export function euroValue(card: PokemonCard, variant: CardVariant = 'normal'): number {
  const prices = pricesFor(card, variant)
  if (prices.eur != null) return prices.eur
  if (prices.usd != null) return prices.usd * 0.92
  return 0
}

/** Côte Cardmarket en euros (tendance du marché européen). */
export function cardmarketEuroValue(
  card: PokemonCard,
  variant: CardVariant = 'normal',
): number {
  return cardmarketPricesFor(card, variant).eur ?? 0
}
