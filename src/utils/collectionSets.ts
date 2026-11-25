import { SETS, type SetInfo } from '../sets'
import type { PokemonCard } from '../types'
import { frenchCardName } from './generations'
import type { PopulationFile, PsaPrinting } from './population'
import {
  catalogSetName,
  catalogSetSearch,
  huntImageUrl,
  SERIES_ORDER,
  seriesLabel,
  toEur,
  type PsaHuntCard,
  type PsaHuntData,
} from './psaHunt'

export interface CollectionSetInfo {
  id: string
  name: string
  shortName: string
  series: string
  language: 'fr' | 'en' | 'ja'
  logo: string
  logoFallback?: string
  cardCount?: number
  featured?: boolean
  /** Identifiant correspondant dans `psa-hunt.json` pour les données PSA / prix. */
  huntSetId?: string
  searchText: string
}

/** Correspondance entre une série locale française (`SETS`) et son équivalent anglais dans `psa-hunt.json`. */
const FEATURED_HUNT_ALIAS: Record<string, string> = {
  'sv03.5': 'sv3pt5',
}

const FEATURED_SERIES: Record<string, string> = {
  'sv03.5': 'Scarlet & Violet',
  me06: 'Mega Evolution',
}

const SKIPPED_HUNT_SET_IDS = new Set(Object.values(FEATURED_HUNT_ALIAS))

function toFeaturedMeta(set: SetInfo): CollectionSetInfo {
  const series = FEATURED_SERIES[set.id] ?? 'Other'
  return {
    id: set.id,
    name: set.name,
    shortName: set.shortName,
    series,
    language: 'fr',
    logo: set.logo,
    logoFallback: set.logoFallback,
    featured: true,
    huntSetId: FEATURED_HUNT_ALIAS[set.id],
    searchText: `${set.name} ${set.shortName} ${seriesLabel(series)} ${set.id}`,
  }
}

export function buildAllCollectionSets(hunt: PsaHuntData | null): CollectionSetInfo[] {
  const featured = SETS.map(toFeaturedMeta)
  if (!hunt) return featured

  // Compte les cartes uniques + trouve la carte la plus représentative par série pour la miniature.
  const uniqueBySet = new Map<string, Set<string>>()
  const heroCardBySet = new Map<string, PsaHuntCard>()
  for (const card of hunt.cards) {
    const sid = card.set.id
    let ids = uniqueBySet.get(sid)
    if (!ids) {
      ids = new Set<string>()
      uniqueBySet.set(sid, ids)
    }
    ids.add(card.cardId)
    const currentHero = heroCardBySet.get(sid)
    if (
      !currentHero ||
      (card.rawUsd ?? 0) > (currentHero.rawUsd ?? 0) ||
      (card.rawUsd === currentHero.rawUsd && card.total > currentHero.total)
    ) {
      heroCardBySet.set(sid, card)
    }
  }

  const fromHunt: CollectionSetInfo[] = []
  for (const set of hunt.sets) {
    // Les séries FR du fichier recensement PSA doublonnent déjà les séries internationales.
    if (set.language === 'fr') continue
    if (SKIPPED_HUNT_SET_IDS.has(set.id)) continue
    const count = uniqueBySet.get(set.id)?.size ?? 0
    if (count === 0) continue

    const displayName = catalogSetName(set)
    const hero = heroCardBySet.get(set.id)
    fromHunt.push({
      id: set.id,
      name: displayName,
      shortName: displayName,
      series: set.series || 'Other',
      language: set.language === 'ja' ? 'ja' : 'en',
      logo: (hero ? huntImageUrl(hero) : null) ?? '',
      cardCount: count,
      featured: false,
      huntSetId: set.id,
      searchText: `${catalogSetSearch(set)} ${seriesLabel(set.series)} ${set.id}`,
    })
  }

  const orderIndex = (series: string) => {
    const i = SERIES_ORDER.indexOf(series)
    return i === -1 ? 999 : i
  }

  fromHunt.sort((a, b) => {
    const sa = orderIndex(a.series)
    const sb = orderIndex(b.series)
    if (sa !== sb) return sa - sb
    return a.name.localeCompare(b.name, 'fr')
  })

  return [...featured, ...fromHunt]
}

function compareCardNumbers(a: string, b: string): number {
  const na = Number.parseInt(a.replace(/\D/g, ''), 10)
  const nb = Number.parseInt(b.replace(/\D/g, ''), 10)
  const aHasNum = Number.isFinite(na)
  const bHasNum = Number.isFinite(nb)
  const aPrefix = a.replace(/\d.*/, '')
  const bPrefix = b.replace(/\d.*/, '')
  if (aPrefix !== bPrefix) {
    if (!aPrefix) return -1
    if (!bPrefix) return 1
    return aPrefix.localeCompare(bPrefix)
  }
  if (aHasNum && bHasNum && na !== nb) return na - nb
  return a.localeCompare(b)
}

function isReversePrinting(printing: string): boolean {
  return /reverse/i.test(printing)
}

/**
 * Construit les cartes `PokemonCard[]` d’une série issue du catalogue `psa-hunt.json`
 * pour la suivre dans Collection (cases J’ai / Recherchée / Reverse + côtes).
 */
export function buildCatalogSetCards(setId: string, hunt: PsaHuntData): PokemonCard[] {
  const byCardId = new Map<string, PsaHuntCard[]>()
  for (const row of hunt.cards) {
    if (row.set.id !== setId) continue
    const list = byCardId.get(row.cardId) ?? []
    list.push(row)
    byCardId.set(row.cardId, list)
  }

  const totalCount = byCardId.size
  const cards: PokemonCard[] = []

  for (const [cardId, rows] of byCardId.entries()) {
    const reverseRow = rows.find((r) => isReversePrinting(r.printing)) ?? null
    const normalCandidates = rows.filter((r) => !isReversePrinting(r.printing))
    const primary =
      normalCandidates.sort(
        (a, b) => (a.printing === '' ? -1 : 0) - (b.printing === '' ? -1 : 0) || b.total - a.total,
      )[0] ?? rows[0]

    const img = huntImageUrl(primary) ?? ''
    const normalUsd = primary.rawUsd
    const reverseUsd = reverseRow?.rawUsd ?? null

    cards.push({
      id: cardId,
      setId,
      name: frenchCardName(primary.name),
      number: primary.number,
      rarity: primary.rarity || 'Autre',
      artist: '',
      types: [],
      imageSmall: img,
      imageLarge: img,
      hasNormal: true,
      hasReverse: reverseRow != null,
      prices: {
        eur: toEur(normalUsd),
        usd: normalUsd,
        source: normalUsd != null ? 'tcgplayer' : null,
        updatedAt: hunt.fetchedAt,
      },
      reversePrices: reverseRow
        ? {
            eur: toEur(reverseUsd),
            usd: reverseUsd,
            source: reverseUsd != null ? 'tcgplayer' : null,
            updatedAt: hunt.fetchedAt,
          }
        : null,
      printedTotal: totalCount,
    })
  }

  return cards.sort((a, b) => compareCardNumbers(a.number, b.number))
}

/** Construit un fichier `PopulationFile` à la volée pour n’importe quelle série du catalogue. */
export function buildCatalogSetPopulation(setId: string, hunt: PsaHuntData): PopulationFile {
  const cards: PopulationFile['cards'] = {}
  for (const row of hunt.cards) {
    if (row.set.id !== setId) continue
    const entry = cards[row.cardId] ?? {
      printings: [] as PsaPrinting[],
    }
    entry.printings.push({
      label: row.printing,
      total: row.total,
      psa10: row.psa10,
      updatedAt: hunt.fetchedAt,
    })
    cards[row.cardId] = entry
  }

  return {
    source: hunt.source,
    sourceName: hunt.sourceName,
    fetchedAt: hunt.fetchedAt,
    cards,
  }
}
