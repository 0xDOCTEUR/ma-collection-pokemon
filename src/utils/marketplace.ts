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
    // searchMode=v2 = barre de recherche du haut (pas le filtre « Nom » avancé).
    return `https://www.cardmarket.com/fr/Pokemon/Products/Search?category=-1&searchMode=v2&searchString=${q}`
  }
  if (market === 'vinted') {
    // 4874 = Cartes à collectionner (pas Fiction / livres).
    return `https://www.vinted.fr/catalog?search_text=${q}&catalog[]=4874`
  }
  return `https://www.ebay.fr/sch/i.html?_nkw=${q}&_sop=15`
}

/** Numéro d’affichage type catalogue : 1 → 001, 12 → 012, TG01 reste TG01. */
function padCatalogNum(value: string | number): string {
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) return raw
  return raw.padStart(3, '0')
}

/** Numéro simple sans zéros : 001 → 1, TG01 reste TG01. */
function plainCatalogNum(value: string | number): string {
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) return raw
  return String(Number.parseInt(raw, 10))
}

type BuyCard = {
  name: string
  number: string
  printedTotal?: number
}

/**
 * Mots-clés selon le site :
 * - Cardmarket : « Bulbizarre 1 » (barre du haut)
 * - Leboncoin / Vinted : « bulbizarre 001/165 »
 */
export function cardBuyQuery(card: BuyCard, market: Marketplace = 'cardmarket'): string {
  // Si le numéro stocké contient déjà un « / », ne garder que la partie locale.
  const localRaw = String(card.number).split('/')[0]?.trim() || String(card.number)
  if (market === 'cardmarket') {
    return `${card.name} ${plainCatalogNum(localRaw)}`.replace(/\s+/g, ' ').trim()
  }
  const local = padCatalogNum(localRaw)
  const total =
    card.printedTotal && card.printedTotal > 0 ? padCatalogNum(card.printedTotal) : null
  const num = total ? `${local}/${total}` : local
  return `${card.name} ${num}`.replace(/\s+/g, ' ').trim().toLowerCase()
}

export type BuyLink = {
  id: Marketplace
  label: string
  url: string
}

export type BuyOpenResult = {
  opened: BuyLink[]
  blocked: BuyLink[]
}

export function buyLinksForCard(card: BuyCard): BuyLink[] {
  return BUY_MARKETPLACES.map((market) => ({
    id: market.id,
    label: market.label,
    url: searchUrl(market.id, cardBuyQuery(card, market.id)),
  }))
}

/**
 * Ouvre un site d’achat tout de suite (pas about:blank).
 * Rend le focus à la page pour enchaîner d’autres ouvertures dans le même geste.
 */
export function tryOpenBuyLink(link: BuyLink): boolean {
  const win = window.open(link.url, `pokedoc-buy-${link.id}`)
  if (!win) return false
  try {
    win.blur()
  } catch {
    /* ignore */
  }
  try {
    window.focus()
  } catch {
    /* ignore */
  }
  return true
}

/**
 * Tente d’ouvrir les 3 d’un coup (clavier / secours).
 * Souvent 1 seul passe : les autres vont dans `blocked`.
 */
export function openCardBuySearches(card: BuyCard): BuyOpenResult {
  const links = buyLinksForCard(card)
  const opened: BuyLink[] = []
  const blocked: BuyLink[] = []

  for (const link of links) {
    if (tryOpenBuyLink(link)) opened.push(link)
    else blocked.push(link)
  }

  return { opened, blocked }
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
