export type CardStatus = 'owned' | 'missing' | 'wanted'
export type CardVariant = 'normal' | 'reverse'

export interface CardPrices {
  eur: number | null
  usd: number | null
  source: 'cardmarket' | 'tcgplayer' | null
  updatedAt: string | null
}

export interface PokemonCard {
  id: string
  setId: string
  name: string
  number: string
  localId?: string
  /** Identifiant TCGdex (ex. sv03.5-199) pour les côtes live Cardmarket. */
  tcgdexId?: string
  rarity: string
  artist: string
  types: string[]
  imageSmall: string
  imageLarge: string
  hasReverse: boolean
  hasNormal: boolean
  prices: CardPrices
  reversePrices: CardPrices | null
  cardmarketPrices?: CardPrices | null
  reverseCardmarketPrices?: CardPrices | null
  printedTotal: number
}

/** Moyennes glissantes Cardmarket renvoyées par TCGdex. */
export interface CardmarketLiveStats {
  updated: string | null
  low: number | null
  avg: number | null
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
}

export type PriceRangeDays = 30 | 90

export interface PriceHistoryPoint {
  /** Jour au format YYYY-MM-DD */
  date: string
  value: number
  /** true = relevé enregistré dans l’appli ; false = point dérivé des moyennes */
  recorded: boolean
}

export type CollectionMap = Record<string, CardStatus>
export type CollectionsBySet = Record<string, CollectionMap>

export type FilterStatus = 'all' | CardStatus | 'reverse-missing' | 'reverse-owned'
export type SortKey = 'number' | 'price-asc' | 'price-desc' | 'name' | 'pop-asc' | 'pop-desc'

export function variantKey(cardId: string, variant: CardVariant): string {
  return variant === 'reverse' ? `${cardId}:reverse` : cardId
}

const EMPTY_PRICES: CardPrices = {
  eur: null,
  usd: null,
  source: null,
  updatedAt: null,
}

export function pricesFor(card: PokemonCard, variant: CardVariant): CardPrices {
  if (variant === 'reverse') {
    return card.reversePrices ?? EMPTY_PRICES
  }
  return card.prices
}

export function cardmarketPricesFor(card: PokemonCard, variant: CardVariant): CardPrices {
  if (variant === 'reverse') {
    return card.reverseCardmarketPrices ?? EMPTY_PRICES
  }
  return card.cardmarketPrices ?? EMPTY_PRICES
}
