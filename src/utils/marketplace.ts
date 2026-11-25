export type Marketplace = 'leboncoin' | 'cardmarket' | 'ebay' | 'vinted'

/** Catégorie Leboncoin « Collection » (pas Électronique / Tablettes). */
const LEBONCOIN_COLLECTION = '40'

export const BUY_MARKETPLACES: Array<{ id: Marketplace; label: string }> = [
  { id: 'cardmarket', label: 'Cardmarket' },
  { id: 'leboncoin', label: 'Leboncoin' },
  { id: 'vinted', label: 'Vinted' },
]

export function encodeQuery(text: string): string {
  return encodeURIComponent(text.trim())
}

export function searchUrl(market: Marketplace, query: string): string {
  const q = encodeQuery(query)
  if (market === 'leboncoin') {
    return `https://www.leboncoin.fr/recherche?text=${q}&category=${LEBONCOIN_COLLECTION}`
  }
  if (market === 'cardmarket') {
    return `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q}`
  }
  if (market === 'vinted') {
    return `https://www.vinted.fr/catalog?search_text=${q}&catalog[]=2319`
  }
  return `https://www.ebay.fr/sch/i.html?_nkw=${q}&_sop=15`
}

/** Texte de recherche : nom + numéro (ex. « Bulbizarre 1/165 »). */
export function cardBuyQuery(card: {
  name: string
  number: string
  printedTotal?: number
}): string {
  const num =
    card.printedTotal && card.printedTotal > 0
      ? `${card.number}/${card.printedTotal}`
      : card.number
  return `${card.name} ${num}`.replace(/\s+/g, ' ').trim()
}

/** Ouvre Cardmarket, Leboncoin et Vinted dans de nouveaux onglets. */
export function openCardBuySearches(card: {
  name: string
  number: string
  printedTotal?: number
}): void {
  const query = cardBuyQuery(card)
  for (const market of BUY_MARKETPLACES) {
    window.open(searchUrl(market.id, query), '_blank', 'noopener,noreferrer')
  }
}

export interface SearchIdea {
  id: string
  title: string
  why: string
  query: string
}

export function lotIdeas(setName: string, shortName: string): SearchIdea[] {
  return [
    {
      id: 'lot-cartes',
      title: `Lots de cartes ${shortName}`,
      why: 'La recherche la plus efficace sur Leboncoin.',
      query: `lot cartes pokemon ${shortName}`,
    },
    {
      id: 'lot-set',
      title: `Lots ${shortName}`,
      why: 'Variante plus courte, souvent beaucoup d’annonces.',
      query: `pokemon ${shortName} lot`,
    },
    {
      id: 'lot-full',
      title: `Lots « ${setName} »`,
      why: 'Avec le nom complet de l’extension.',
      query: `lot pokemon ${setName}`,
    },
    {
      id: 'lot-bulk',
      title: `Lots reverse ${shortName}`,
      why: 'Utile pour combler beaucoup de reverse d’un coup.',
      query: `lot pokemon ${shortName} reverse`,
    },
  ]
}
