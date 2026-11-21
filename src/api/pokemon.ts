import type {
  CardmarketLiveStats,
  CardPrices,
  CardVariant,
  PokemonCard,
} from '../types'
import { cardmarketPricesFor, pricesFor } from '../types'
import type { SetInfo } from '../sets'
import type { PopulationFile } from '../utils/population'

/** Change ce numéro quand les fichiers de côtes sont mis à jour, pour éviter un vieux cache. */
const DATA_VERSION = '2026-11-19-cm'

const TCGDEX_CARD_URL = 'https://api.tcgdex.net/v2/fr/cards'

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function fetchSetCards(set: SetInfo): Promise<PokemonCard[]> {
  const url = `${set.dataUrl}${set.dataUrl.includes('?') ? '&' : '?'}v=${DATA_VERSION}`
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Impossible de charger ${set.name} (code ${response.status})`)
  }
  return (await response.json()) as PokemonCard[]
}

export async function fetchPopulation(set: SetInfo): Promise<PopulationFile> {
  const url = `${set.populationUrl}${set.populationUrl.includes('?') ? '&' : '?'}v=${DATA_VERSION}`
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Impossible de charger la population de ${set.name} (code ${response.status})`)
  }
  return (await response.json()) as PopulationFile
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

/** Moyennes Cardmarket live via TCGdex (avg1 / avg7 / avg30 / tendance). */
export async function fetchCardmarketLive(
  tcgdexId: string,
): Promise<CardmarketLiveStats | null> {
  const response = await fetch(`${TCGDEX_CARD_URL}/${encodeURIComponent(tcgdexId)}`, {
    cache: 'no-cache',
  })
  if (!response.ok) return null

  const data = (await response.json()) as {
    pricing?: { cardmarket?: Record<string, unknown> }
  }
  const cm = data.pricing?.cardmarket
  if (!cm) return null

  return {
    updated: typeof cm.updated === 'string' ? cm.updated : null,
    low: numOrNull(cm.low),
    avg: numOrNull(cm.avg),
    trend: numOrNull(cm.trend),
    avg1: numOrNull(cm.avg1),
    avg7: numOrNull(cm.avg7),
    avg30: numOrNull(cm.avg30),
  }
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}
