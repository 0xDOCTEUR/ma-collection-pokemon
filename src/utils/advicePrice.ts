import { USD_TO_EUR } from './psaHunt'

/** Part du prix quasi neuf. Conseil, pas une vente relevée. */
export const LOOSE_CONDITIONS = [
  { id: 'mint', label: 'Neuf', hint: 'Aucun défaut visible.', ratio: 1.08 },
  { id: 'nm', label: 'Quasi neuf', hint: 'Le prix de référence, celui de Cardmarket.', ratio: 1 },
  { id: 'ex', label: 'Excellent', hint: 'Petites traces, coins encore propres.', ratio: 0.8 },
  { id: 'gd', label: 'Bon', hint: 'Usure visible, carte encore présentable.', ratio: 0.65 },
  { id: 'lp', label: 'Léger jeu', hint: 'Rayures légères ou bords un peu blancs.', ratio: 0.5 },
  { id: 'pl', label: 'Jouée', hint: 'Usure nette, petit pli possible.', ratio: 0.35 },
  { id: 'po', label: 'Abîmée', hint: 'Plis, coins cassés ou taches.', ratio: 0.2 },
] as const

export interface PsaPriceRow {
  label: string
  eur: number
}

export interface PsaPriceQuote {
  date: string | null
  rows: PsaPriceRow[]
}

export function cardpriceId(cardId: string): string {
  return cardId.replace(/^me06-/, 'me6-')
}

export function loosePrices(nearMintEur: number): { id: string; label: string; hint: string; eur: number; reference: boolean }[] {
  return LOOSE_CONDITIONS.map((condition) => ({
    id: condition.id,
    label: condition.label,
    hint: condition.hint,
    eur: Math.round(nearMintEur * condition.ratio * 100) / 100,
    reference: condition.id === 'nm',
  }))
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Prix des cartes déjà notées, en dollars chez la source, convertis en euros. */
export async function fetchPsaPrices(cardId: string): Promise<PsaPriceQuote | null> {
  const response = await fetch(
    `https://api.cardprice.com/api/card/${encodeURIComponent(cardpriceId(cardId))}`,
    { cache: 'no-cache' },
  )
  if (!response.ok) return null
  const data = (await response.json()) as { graded?: Record<string, unknown> }
  const graded = data.graded
  if (!graded) return null

  const fields: { key: string; label: string }[] = [
    { key: 'psa10', label: 'PSA 10' },
    { key: 'grade9', label: 'PSA 9' },
    { key: 'grade8', label: 'PSA 8' },
    { key: 'grade7', label: 'PSA 7' },
  ]
  const rows = fields.flatMap((field) => {
    const usd = positive(graded[field.key])
    if (usd == null) return []
    return [{ label: field.label, eur: Math.round(usd * USD_TO_EUR * 100) / 100 }]
  })
  if (rows.length === 0) return null
  return {
    date: typeof graded.date === 'string' ? graded.date : null,
    rows,
  }
}
