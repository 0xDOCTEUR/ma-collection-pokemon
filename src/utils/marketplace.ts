export type Marketplace = 'leboncoin' | 'cardmarket' | 'ebay'

/** Catégorie Leboncoin « Collection » (pas Électronique / Tablettes). */
const LEBONCOIN_COLLECTION = '40'

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
  return `https://www.ebay.fr/sch/i.html?_nkw=${q}&_sop=15`
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
