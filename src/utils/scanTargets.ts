import type { PokemonCard } from '../types'
import type { PsaHuntCard, PsaHuntData } from './psaHunt'
import { catalogSetName, huntImageUrl } from './psaHunt'
import { SETS } from '../sets'

/** Carte searchable pour le scan : collection locale ou catalogue mondial. */
export interface ScanTarget {
  id: string
  name: string
  number: string
  /** Total imprimé affiché sur la carte (ex. 165 pour 151). */
  printedTotal: number
  setId: string
  setLabel: string
  language: string
  imageSmall: string
  rarity: string
  collectionCard?: PokemonCard
  hunt?: PsaHuntCard
}

/** Totaux imprimés connus (CardPrice / boîte). */
const KNOWN_PRINTED_TOTAL: Record<string, number> = {
  sv3pt5: 165,
  'sv03.5': 165,
  me55: 128,
  me55c: 128,
  me6: 94,
  me06: 94,
  base1: 102,
  base2: 64,
  base3: 62,
  swsh12pt5gg: 70,
  swsh12pt5: 159,
}

const BASE_RARITY =
  /^(common|uncommon|rare|double rare|holo rare|rare holo|commune|peu commune|promo)$/i
const POST_SET_RARITY =
  /illustration rare|special illustration|hyper rare|mega hyper|shiny secret|classic collection/i

/**
 * Devine le total imprimé d’une série.
 * Préfère le plus grand numéro « de base » (commune → double rare),
 * sinon le numéro juste avant la première Illustration Rare.
 */
export function inferPrintedTotal(
  numbers: string[],
  setId?: string,
  rarities: string[] = [],
): number {
  if (setId && KNOWN_PRINTED_TOTAL[setId]) return KNOWN_PRINTED_TOTAL[setId]

  const rows = numbers.map((number, index) => ({
    number: Number.parseInt(number, 10),
    rarity: rarities[index] ?? '',
  })).filter((row) => Number.isFinite(row.number) && row.number > 0 && row.number < 1000)

  if (rows.length === 0) return 165

  const baseNums = rows
    .filter((row) => BASE_RARITY.test(row.rarity.trim()))
    .map((row) => row.number)
  if (baseNums.length >= 20) return Math.max(...baseNums)

  const postNums = rows
    .filter((row) => POST_SET_RARITY.test(row.rarity))
    .map((row) => row.number)
  if (postNums.length > 0) {
    const firstPost = Math.min(...postNums)
    if (firstPost > 40) return firstPost - 1
  }

  const present = [...new Set(rows.map((row) => row.number))].sort((a, b) => a - b)
  return present[Math.min(present.length - 1, Math.floor(present.length * 0.72))] ?? 165
}

function normalizeNumber(value: string): string {
  const text = value.trim()
  if (/^\d+$/.test(text)) return String(Number.parseInt(text, 10))
  return text.toUpperCase()
}

export function buildScanTargets(
  cardsBySet: Record<string, PokemonCard[]>,
  hunt: PsaHuntData | null,
): ScanTarget[] {
  const targets: ScanTarget[] = []
  const seenCollection = new Set<string>()
  const seenHunt = new Set<string>()

  for (const set of SETS) {
    const cards = cardsBySet[set.id] ?? []
    for (const card of cards) {
      seenCollection.add(`${set.id}:${normalizeNumber(card.number)}`)
      targets.push({
        id: `col:${card.id}`,
        name: card.name,
        number: normalizeNumber(card.number),
        printedTotal: card.printedTotal || inferPrintedTotal(cards.map((row) => row.number)),
        setId: set.id,
        setLabel: set.name,
        language: 'fr',
        imageSmall: card.imageSmall,
        rarity: card.rarity,
        collectionCard: card,
      })
    }
  }

  if (!hunt) return targets

  const rowsBySet = new Map<string, { number: string; rarity: string }[]>()
  for (const card of hunt.cards) {
    const list = rowsBySet.get(card.set.id) ?? []
    list.push({ number: card.number, rarity: card.rarity || card.printing || '' })
    rowsBySet.set(card.set.id, list)
  }
  const printedBySet = new Map<string, number>()
  for (const [setId, rows] of rowsBySet) {
    printedBySet.set(
      setId,
      inferPrintedTotal(
        rows.map((row) => row.number),
        setId,
        rows.map((row) => row.rarity),
      ),
    )
  }

  // Une entrée par série + numéro (évite 3 versions de la même carte).
  const bestByKey = new Map<string, PsaHuntCard>()
  for (const card of hunt.cards) {
    if (!card.number) continue
    // Les cartes japonaises brouillent souvent le scan français/anglais.
    if (card.set.language === 'ja') continue
    const key = `${card.set.id}:${normalizeNumber(card.number)}`
    if (seenCollection.has(key)) continue
    const current = bestByKey.get(key)
    if (!current) {
      bestByKey.set(key, card)
      continue
    }
    // Préfère la version sans variante, puis celle avec un prix.
    const currentScore =
      (current.printing ? 0 : 2) + (current.rawUsd != null || current.psa10Usd != null ? 1 : 0)
    const nextScore =
      (card.printing ? 0 : 2) + (card.rawUsd != null || card.psa10Usd != null ? 1 : 0)
    if (nextScore > currentScore) bestByKey.set(key, card)
  }

  for (const card of bestByKey.values()) {
    const number = normalizeNumber(card.number)
    const key = `${card.set.id}:${number}`
    if (seenHunt.has(key)) continue
    seenHunt.add(key)
    targets.push({
      id: `hunt:${card.set.id}:${number}`,
      name: card.name,
      number,
      printedTotal: printedBySet.get(card.set.id) ?? 165,
      setId: card.set.id,
      setLabel: `${catalogSetName(card.set)} · ${card.set.language === 'fr' ? 'FR' : 'EN'}`,
      language: card.set.language,
      imageSmall: huntImageUrl(card) ?? '',
      rarity: card.rarity || card.printing || 'Normale',
      hunt: card,
    })
  }

  return targets
}
