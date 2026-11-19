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

export type CollectionMap = Record<string, CardStatus>
export type CollectionsBySet = Record<string, CollectionMap>

export type FilterStatus = 'all' | CardStatus | 'reverse-missing' | 'reverse-owned'
export type SortKey = 'number' | 'price-asc' | 'price-desc' | 'name'

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
