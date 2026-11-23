import type { PokemonCard } from '../types'
import type { PsaHuntCard, PsaHuntData } from './psaHunt'
import { huntImageUrl } from './psaHunt'
import { SETS } from '../sets'

/** Carte searchable pour le scan : collection locale ou catalogue mondial. */
export interface ScanTarget {
  id: string
  name: string
  number: string
  printedTotal: number
  setLabel: string
  imageSmall: string
  rarity: string
  collectionCard?: PokemonCard
  hunt?: PsaHuntCard
}

export function buildScanTargets(
  cardsBySet: Record<string, PokemonCard[]>,
  hunt: PsaHuntData | null,
): ScanTarget[] {
  const targets: ScanTarget[] = []
  const seen = new Set<string>()

  for (const set of SETS) {
    const cards = cardsBySet[set.id] ?? []
    for (const card of cards) {
      seen.add(`col:${card.id}`)
      targets.push({
        id: `col:${card.id}`,
        name: card.name,
        number: card.number,
        printedTotal: card.printedTotal,
        setLabel: set.name,
        imageSmall: card.imageSmall,
        rarity: card.rarity,
        collectionCard: card,
      })
    }
  }

  if (!hunt) return targets

  for (const card of hunt.cards) {
    const key = `hunt:${card.key}`
    if (seen.has(key)) continue
    // Évite de doubler une carte déjà en collection (même set CardPrice + même numéro)
    const collectionHit = targets.find(
      (row) =>
        row.collectionCard &&
        row.number === card.number &&
        (card.set.id === 'sv3pt5' || card.set.id === 'me6' || card.set.id.includes(row.collectionCard.setId)),
    )
    if (collectionHit && card.set.language === 'en' && !card.printing) continue

    seen.add(key)
    targets.push({
      id: key,
      name: card.name,
      number: card.number || '0',
      printedTotal: Number.parseInt(card.number, 10) > 0 ? Math.max(Number.parseInt(card.number, 10), 165) : 165,
      setLabel: `${card.set.name} · ${card.set.language === 'fr' ? 'FR' : card.set.language === 'ja' ? 'JP' : 'EN'}`,
      imageSmall: huntImageUrl(card) ?? '',
      rarity: card.printing || 'Normale',
      hunt: card,
    })
  }

  return targets
}
