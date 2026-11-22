import { printingLabel } from './population'

/** Même conversion que le reste de l’appli : les prix de la source sont en dollars. */
export const USD_TO_EUR = 0.92

/** À changer quand public/data/psa-hunt.json est régénéré. */
export const PSA_HUNT_VERSION = '2026-11-22'

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

export function cardImageUrl(cardId: string): string | null {
  if (!cardId) return null
  return `https://api.cardprice.com/images/cards/${encodeURIComponent(cardId)}.png`
}

export function cardPageUrl(slug: string): string {
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

export function loadPsaHunt(): Promise<PsaHuntData> {
  if (pending) return pending
  const base = import.meta.env.BASE_URL
  pending = fetch(`${base}data/psa-hunt.json?v=${PSA_HUNT_VERSION}`, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Le fichier des notes PSA est introuvable.')
      }
      return expand((await response.json()) as PsaHuntFile)
    })
    .catch((error: unknown) => {
      pending = null
      throw error
    })
  return pending
}
