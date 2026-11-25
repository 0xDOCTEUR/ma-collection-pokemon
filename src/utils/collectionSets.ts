import { SETS, type SetInfo } from '../sets'
import type { PokemonCard } from '../types'
import {
  normalizeCardNum,
  resolveSetLogo,
  type TcgdexFrenchCardInfo,
} from './frenchSets'
import { frenchCardName } from './generations'
import type { PopulationFile, PsaPrinting } from './population'
import {
  cardImageUrl,
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
  /** Logo officiel de la série (jamais une carte). */
  logo: string
  logoFallback?: string
  /** Image de la carte phare (chase) pour le thème du bandeau. */
  chaseImage?: string
  cardCount?: number
  featured?: boolean
  /** Identifiant correspondant dans `psa-hunt.json` pour les données PSA / prix. */
  huntSetId?: string
  searchText: string
}

function isOfficialLogoUrl(url: string | undefined): boolean {
  return Boolean(url && /\/logo\./i.test(url))
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

function toFeaturedMeta(set: SetInfo, chaseImage?: string): CollectionSetInfo {
  const series = FEATURED_SERIES[set.id] ?? 'Other'
  const resolved = resolveSetLogo(set.id)
  const official = isOfficialLogoUrl(set.logo)
    ? set.logo
    : resolved.logo || (isOfficialLogoUrl(set.logoFallback) ? set.logoFallback : '')
  const cardAsLogo = set.logo && !isOfficialLogoUrl(set.logo) ? set.logo : undefined
  return {
    id: set.id,
    name: set.name,
    shortName: set.shortName,
    series,
    language: 'fr',
    logo: official || resolved.logo || '',
    logoFallback: set.logoFallback || resolved.logoFallback,
    chaseImage: chaseImage || cardAsLogo,
    featured: true,
    huntSetId: FEATURED_HUNT_ALIAS[set.id],
    searchText: `${set.name} ${set.shortName} ${seriesLabel(series)} ${set.id}`,
  }
}

export function buildAllCollectionSets(hunt: PsaHuntData | null): CollectionSetInfo[] {
  if (!hunt) return SETS.map((set) => toFeaturedMeta(set))

  // Compte les cartes uniques + trouve la carte la plus représentative par série (chase).
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

  const chaseFor = (huntSetId: string | undefined) => {
    if (!huntSetId) return undefined
    const hero = heroCardBySet.get(huntSetId)
    return (hero ? huntImageUrl(hero, 'high') : null) ?? undefined
  }

  const featured = SETS.map((set) =>
    toFeaturedMeta(set, chaseFor(FEATURED_HUNT_ALIAS[set.id])),
  )

  const fromHunt: CollectionSetInfo[] = []
  for (const set of hunt.sets) {
    // Les séries FR du fichier recensement PSA doublonnent déjà les séries internationales.
    if (set.language === 'fr') continue
    if (SKIPPED_HUNT_SET_IDS.has(set.id)) continue
    const count = uniqueBySet.get(set.id)?.size ?? 0
    if (count === 0) continue

    const displayName = catalogSetName(set)
    const resolved = resolveSetLogo(set.id)
    fromHunt.push({
      id: set.id,
      name: displayName,
      shortName: displayName,
      series: set.series || 'Other',
      language: set.language === 'ja' ? 'ja' : 'en',
      logo: resolved.logo,
      logoFallback: resolved.logoFallback,
      chaseImage: chaseFor(set.id),
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
 * pour la suivre dans Collection (J’ai / Reverse + côtes + listes).
 */
export function buildCatalogSetCards(
  setId: string,
  hunt: PsaHuntData,
  frenchCards?: Map<string, TcgdexFrenchCardInfo> | null,
): PokemonCard[] {
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

    const frInfo = frenchCards?.get(normalizeCardNum(primary.number)) ?? null
    // Image confirmée TCGdex seulement (les URL « devinées » 404 souvent sur V/VSTAR/TG).
    const cardpriceImg = cardImageUrl(cardId) ?? ''
    const frSmall = frInfo?.imageSmall || ''
    const frLarge = frInfo?.imageLarge || ''

    const normalUsd = primary.rawUsd
    const reverseUsd = reverseRow?.rawUsd ?? null

    cards.push({
      id: cardId,
      setId,
      tcgdexId: frInfo?.id,
      name: frInfo?.name || frenchCardName(primary.name),
      number: primary.number,
      rarity: primary.rarity || 'Autre',
      artist: '',
      types: [],
      imageSmall: frSmall || cardpriceImg,
      imageLarge: frLarge || cardpriceImg,
      imageFallback:
        frSmall && cardpriceImg && frSmall !== cardpriceImg ? cardpriceImg : undefined,
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
