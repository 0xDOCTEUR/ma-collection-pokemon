/** Nom anglais de la source → nom affiché. */
const RARITY_FR: Record<string, string> = {
  common: 'Commune',
  uncommon: 'Peu Commune',
  rare: 'Rare',
  promo: 'Promo',
  'holo rare': 'Rare holo',
  'rare holo': 'Rare holo',
  'super rare': 'Super rare',
  'art rare': 'Art rare',
  'pikachu rare': 'Pikachu rare',
  'double rare': 'Double rare',
  'illustration rare': 'Illustration rare',
  'ultra rare': 'Ultra Rare',
  'rare ultra': 'Ultra Rare',
  'special illustration rare': 'Illustration spéciale rare',
  'special art rare': 'Art rare spécial',
  'illustration spéciale': 'Illustration spéciale rare',
  'futuristic rare': 'Rare futuriste',
  'hyper rare': 'Hyper rare',
  'mega hyper rare': 'Méga Hyper Rare',
  'mega ultra rare': 'Méga ultra rare',
  'shiny rare': 'Rare brillante',
  'shiny ultra rare': 'Ultra rare brillante',
  'shiny secret rare': 'Rare secrète brillante',
  'ace spec rare': 'Rare Ace Spec',
  'prism rare': 'Rare prisme',
  'ace rare': 'Rare Ace',
  'rare ace': 'Rare Ace',
  'rare break': 'Rare BREAK',
  'rare holo star': 'Rare étoile',
  'rare holo lv.x': 'Rare NIV.X',
  'rare holo v': 'Rare V',
  'rare holo vmax': 'Rare VMAX',
  'rare holo vstar': 'Rare VSTAR',
  'rare holo ex': 'Rare EX',
  'rare holo gx': 'Rare GX',
  'rare prism star': 'Rare prisme étoile',
  'rare secret': 'Rare secrète',
  'rare rainbow': 'Rare arc-en-ciel',
  'radiant rare': 'Rare radieuse',
  shining: 'Brillant',
  'rare shining': 'Rare brillant',
  'mega attack rare': 'Mega Attack Rare',
  mega_attack_rare: 'Mega Attack Rare',
  'black white rare': 'Black White Rare',
  'rgb rare': 'Rgb Rare',
  'classic collection': 'Collection classique',
  'code card': 'Carte code',
  unconfirmed: 'Non confirmée',
  'triple rare': 'Triple rare',
  'rare shiny': 'Rare brillante',
  'character rare': 'Rare personnage',
  'character super rare': 'Super rare personnage',
  'trainer gallery rare holo': 'Rare holo galerie',
  'super rare holo': 'Super rare holo',
  'trainer rare': 'Rare dresseur',
  legend: 'Légende',
  'amazing rare': 'Rare magnifique',
  'secret rare': 'Rare secrète',
  'rare holo ex': 'Rare EX',
  'holo rare vmax': 'Rare VMAX',
  'holo rare vstar': 'Rare VSTAR',
  'holo rare v': 'Rare V',
}

/** Ordre du moins rare au plus rare. */
const RARITY_ORDER = [
  'Commune',
  'Peu Commune',
  'Rare',
  'Promo',
  'Rare holo',
  'Pikachu rare',
  'Rare EX',
  'Rare GX',
  'Rare V',
  'Rare VMAX',
  'Rare VSTAR',
  'Double rare',
  'Triple rare',
  'Super rare',
  'Art rare',
  'Illustration rare',
  'Ultra Rare',
  'Illustration spéciale rare',
  'Art rare spécial',
  'Rare futuriste',
  'Rare brillante',
  'Ultra rare brillante',
  'Rare secrète',
  'Rare secrète brillante',
  'Rare arc-en-ciel',
  'Hyper rare',
  'Méga Hyper Rare',
  'Méga ultra rare',
  'Rare Ace Spec',
  'Collection classique',
]

export function rarityLabel(raw: string): string {
  const key = raw.trim().toLowerCase()
  if (!key || key === 'none') return ''
  return RARITY_FR[key] ?? raw.trim()
}

/** La version imprimée est parfois déjà une rareté (cartes françaises). */
export function rarityFromPrinting(printing: string): string {
  const label = rarityLabel(printing)
  if (!label) return ''
  if (RARITY_FR[printing.trim().toLowerCase()]) return label
  if (/rare/i.test(printing)) return label
  return ''
}

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
