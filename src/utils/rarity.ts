/** Ordre du moins rare au plus rare (noms français TCGdex). */
const RARITY_ORDER = [
  'Commune',
  'Peu Commune',
  'Rare',
  'Double rare',
  'Illustration rare',
  'Ultra Rare',
  'Illustration spéciale rare',
  'Hyper rare',
  'Méga Hyper Rare',
]

const RANK = new Map(RARITY_ORDER.map((name, index) => [name.toLowerCase(), index]))

export function compareRarity(a: string, b: string): number {
  const ra = RANK.get(a.toLowerCase())
  const rb = RANK.get(b.toLowerCase())
  if (ra != null && rb != null) return ra - rb
  if (ra != null) return -1
  if (rb != null) return 1
  return a.localeCompare(b, 'fr')
}

export function sortRarities(rarities: string[]): string[] {
  return [...rarities].sort(compareRarity)
}
