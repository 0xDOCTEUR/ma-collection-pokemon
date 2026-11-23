import { printingLabel } from './population'

/** Même conversion que le reste de l’appli : les prix de la source sont en dollars. */
export const USD_TO_EUR = 0.92

/** À changer quand public/data/psa-hunt.json ou psa-french.json est régénéré. */
export const PSA_HUNT_VERSION = '2026-11-23'

export interface PsaHuntSet {
  id: string
  name: string
  series: string
  language: string
}

/** [série, id carte, nom, numéro, version, total noté, psa10, prix psa10 $, prix brut $, lien] */
export type PsaHuntTuple = [
  number,
  string,
  string,
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  string,
]

export interface PsaHuntFile {
  source: string
  sourceName: string
  fetchedAt: string
  sets: PsaHuntSet[]
  cards: PsaHuntTuple[]
}

export interface PsaHuntCard {
  key: string
  set: PsaHuntSet
  cardId: string
  name: string
  number: string
  printing: string
  total: number
  psa10: number
  psa10Usd: number | null
  rawUsd: number | null
  slug: string
}

export interface PsaHuntData {
  source: string
  sourceName: string
  fetchedAt: string
  frenchSource?: string
  frenchSourceName?: string
  frenchFetchedAt?: string
  sets: PsaHuntSet[]
  cards: PsaHuntCard[]
}

const SERIES_FR: Record<string, string> = {
  'Mega Evolution': 'Méga-Évolution',
  'Scarlet & Violet': 'Écarlate et Violet',
  'Sword & Shield': 'Épée et Bouclier',
  'Sun & Moon': 'Soleil et Lune',
  XY: 'XY',
  'Black & White': 'Noir et Blanc',
  'HeartGold & SoulSilver': 'HeartGold et SoulSilver',
  Platinum: 'Platine',
  POP: 'POP',
  'Diamond & Pearl': 'Diamant et Perle',
  EX: 'EX',
  'E-Card': 'e-Card',
  Neo: 'Neo',
  Gym: 'Gym',
  Base: 'Set de base',
  'Special Promos': 'Cartes promo',
  Japanese: 'Japon',
  Other: 'Autres',
}

export const SERIES_ORDER = [
  'Mega Evolution',
  'Scarlet & Violet',
  'Sword & Shield',
  'Sun & Moon',
  'XY',
  'Black & White',
  'HeartGold & SoulSilver',
  'Platinum',
  'Diamond & Pearl',
  'POP',
  'EX',
  'E-Card',
  'Neo',
  'Gym',
  'Base',
  'Special Promos',
  'Japanese',
  'Other',
]

const EXTRA_PRINTINGS: Record<string, string> = {
  Holo: 'Holo',
  HOLO: 'Holo',
  Holofoil: 'Holo',
  '1st Edition': '1re édition',
  '1st Edition Holofoil': '1re édition holo',
  'Holo 1st Edition': '1re édition holo',
  Shadowless: 'Sans ombre',
  'Shadowless Holofoil': 'Sans ombre holo',
  Unlimited: 'Illimitée',
  'Unlimited Holofoil': 'Illimitée holo',
  'Poke Ball': 'Poké Ball',
  'Gold Star': 'Étoile d’or',
  'Gold Star 1st Edition': 'Étoile d’or, 1re édition',
  'Cosmos Holo': 'Holo cosmos',
}

export function seriesLabel(series: string): string {
  return SERIES_FR[series] ?? series
}

export function huntPrintingLabel(label: string): string {
  if (!label) return 'Normale'
  return EXTRA_PRINTINGS[label] ?? printingLabel(label)
}

export function languageLabel(language: string): string {
  if (language === 'ja') return 'Japonais'
  if (language === 'en') return 'Anglais'
  if (language === 'fr') return 'Français'
  return language
}

export function toEur(usd: number | null): number | null {
  if (usd == null || !Number.isFinite(usd)) return null
  return usd * USD_TO_EUR
}

/**
 * Plus le nombre est grand, plus les trois signes sont réunis :
 * la carte non notée est déjà demandée, les notes 10 restent rares,
 * et la PSA 10 n'est pas déjà hors de prix par rapport à la carte brute.
 */
export function upsideScore(psa10: number, total: number, psaEur: number, rawEur: number): number {
  if (total <= 0 || psaEur <= 0 || rawEur <= 0) return 0
  const rate = psa10 / total
  const premium = psaEur / rawEur
  const scarcity = 1 / Math.log10(Math.max(psa10, 80) + 25)
  const lock = Math.max(0.08, 0.8 - rate)
  const demand = Math.log10(rawEur + 3)
  const room = premium < 1.2 ? 0.55 : premium > 10 ? 0.4 : premium > 6 ? 0.75 : 1
  return scarcity * lock * demand * room
}

export type PotentialLevel = 'open' | 'watch' | 'narrow' | 'unknown'

export interface CardPotential {
  level: PotentialLevel
  title: string
  reason: string
}

/** Pastilles du catalogue, pour filtrer facilement. */
export const INDICATOR_FILTERS = [
  { id: 'all', label: 'Tous les indicateurs', level: null },
  { id: 'Marge ouverte', label: 'Marge ouverte', level: 'open' as PotentialLevel },
  { id: 'À suivre', label: 'À suivre', level: 'watch' as PotentialLevel },
  { id: 'Déjà chère', label: 'Déjà chère', level: 'narrow' as PotentialLevel },
  { id: 'Déjà courante', label: 'Déjà courante', level: 'narrow' as PotentialLevel },
  { id: 'Peu demandée', label: 'Peu demandée', level: 'narrow' as PotentialLevel },
  { id: 'Pas assez d’infos', label: 'Pas assez d’infos', level: 'unknown' as PotentialLevel },
] as const

export type IndicatorFilterId = (typeof INDICATOR_FILTERS)[number]['id']

/**
 * Lecture d’aujourd’hui, pas une promesse de hausse.
 * Marge ouverte = les trois signes ensemble : la carte sans note se vend déjà,
 * les notes 10 restent peu nombreuses, et la note 10 n’est pas encore hors de prix.
 */
export function cardPotential(
  psa10: number,
  total: number,
  psaEur: number | null,
  rawEur: number | null,
): CardPotential {
  if (psaEur == null || rawEur == null || psaEur <= 0 || rawEur <= 0 || total <= 0) {
    return {
      level: 'unknown',
      title: 'Pas assez d’infos',
      reason: 'Il manque un prix. Sans le prix de la note 10 et celui de la carte sans note, on ne voit pas s’il reste de la marge.',
    }
  }

  const premium = psaEur / rawEur
  const rate = psa10 / total
  const wanted = rawEur >= 8
  const scarce = psa10 <= 500 && rate <= 0.6
  const room = premium >= 1.2 && premium <= 5

  if (!wanted) {
    return {
      level: 'narrow',
      title: 'Peu demandée',
      reason: 'La carte sans note se vend encore peu. Une note 10 prend de la valeur seulement si des gens la cherchent déjà.',
    }
  }
  if (premium > 6) {
    return {
      level: 'narrow',
      title: 'Déjà chère',
      reason: 'La note 10 coûte déjà plusieurs fois la carte sans note. Une grande partie de la hausse possible est déjà dans le prix.',
    }
  }
  if (psa10 > 2500) {
    return {
      level: 'narrow',
      title: 'Déjà courante',
      reason: 'Beaucoup d’exemplaires sont déjà notés 10. Le côté rare de la note parfaite est en grande partie passé.',
    }
  }
  if (wanted && scarce && room) {
    return {
      level: 'open',
      title: 'Marge ouverte',
      reason: 'La carte sans note se vend déjà, les notes 10 restent peu nombreuses, et cette note n’est pas encore hors de prix.',
    }
  }
  if (premium < 1.2) {
    return {
      level: 'watch',
      title: 'À suivre',
      reason: 'Les notes 10 ne se vendent pas plus cher que la carte sans note. Le marché ne paie pas encore cette note.',
    }
  }
  if (premium > 5) {
    return {
      level: 'watch',
      title: 'À suivre',
      reason: 'La carte sans note se vend déjà, mais la note 10 est déjà bien plus chère. La marge est plus petite.',
    }
  }
  return {
    level: 'watch',
    title: 'À suivre',
    reason: 'La carte sans note se vend déjà, mais les notes 10 sont déjà assez nombreuses.',
  }
}

export function cardImageUrl(cardId: string): string | null {
  if (!cardId || cardId.startsWith('fr:')) return null
  return `https://api.cardprice.com/images/cards/${encodeURIComponent(cardId)}.png`
}

/** Image française quand on connaît la série. Sinon l’image de la source anglaise. */
export function huntImageUrl(card: PsaHuntCard): string | null {
  if (card.set.id === 'french-mew-fr-151' && /^\d+$/.test(card.number)) {
    const localId = card.number.padStart(3, '0')
    return `https://assets.tcgdex.net/fr/sv/sv03.5/${localId}/low.webp`
  }
  return cardImageUrl(card.cardId)
}

export function cardPageUrl(slug: string): string {
  if (slug.startsWith('http://') || slug.startsWith('https://')) return slug
  return `https://cardprice.com/card/${slug}`
}

function expand(file: PsaHuntFile): PsaHuntData {
  const cards: PsaHuntCard[] = []
  file.cards.forEach((row, index) => {
    const set = file.sets[row[0]]
    if (!set) return
    cards.push({
      key: `${row[0]}-${row[1]}-${row[4]}-${index}`,
      set,
      cardId: row[1],
      name: row[2],
      number: row[3],
      printing: row[4],
      total: row[5],
      psa10: row[6],
      psa10Usd: row[7],
      rawUsd: row[8],
      slug: row[9],
    })
  })
  return {
    source: file.source,
    sourceName: file.sourceName,
    fetchedAt: file.fetchedAt,
    sets: file.sets,
    cards,
  }
}

let pending: Promise<PsaHuntData> | null = null

async function loadHuntFile(url: string): Promise<PsaHuntFile> {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error('Le fichier des notes PSA est introuvable.')
  }
  return (await response.json()) as PsaHuntFile
}

export function loadPsaHunt(): Promise<PsaHuntData> {
  if (pending) return pending
  const base = import.meta.env.BASE_URL
  pending = Promise.all([
    loadHuntFile(`${base}data/psa-hunt.json?v=${PSA_HUNT_VERSION}`),
    loadHuntFile(`${base}data/psa-french.json?v=${PSA_HUNT_VERSION}`).catch(() => null),
  ])
    .then(([file, french]) => {
      const data = expand(file)
      if (!french) return data
      const extra = expand(french)
      data.cards.push(...extra.cards)
      data.sets.push(...extra.sets)
      data.frenchSource = french.source
      data.frenchSourceName = french.sourceName
      data.frenchFetchedAt = french.fetchedAt
      return data
    })
    .catch((error: unknown) => {
      pending = null
      throw error
    })
  return pending
}
