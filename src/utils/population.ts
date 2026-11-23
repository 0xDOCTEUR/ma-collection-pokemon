/** En dessous de ce nombre de cartes notées, le chiffre ne permet pas de comparer. */
export const MIN_POPULATION_SAMPLE = 100

export interface PsaPrinting {
  /** Vide = version normale. Sinon le nom anglais renvoyé par la source (ex. Master Ball). */
  label: string
  total: number
  psa10: number
  updatedAt: string | null
}

export interface CardPopulation {
  printings: PsaPrinting[]
}

export interface PopulationFile {
  source: string
  sourceName: string
  fetchedAt: string
  /** Recensement des cartes françaises, quand il existe pour cette série. */
  frenchSource?: string
  frenchSourceName?: string
  frenchFetchedAt?: string
  cards: Record<string, CardPopulation>
}

export function printingLabel(label: string): string {
  if (!label) return 'Normale'
  if (label === 'Reverse Holofoil') return 'Reverse'
  if (label === 'Master Ball') return 'Master Ball'
  return label
}

/** Ligne venue du recensement des cartes françaises, pas de la version anglaise. */
export function isFrenchPrinting(label: string): boolean {
  return label.startsWith('Français')
}

/** Version la plus envoyée chez PSA : c’est celle qu’on compare entre les cartes. */
export function primaryPrinting(printings: PsaPrinting[] | undefined): PsaPrinting | null {
  if (!printings || printings.length === 0) return null
  const english = printings.filter((row) => !isFrenchPrinting(row.label))
  const pool = english.length > 0 ? english : printings
  return pool.reduce((best, row) => (row.total > best.total ? row : best))
}

/** Version française la plus envoyée chez PSA, pour l’afficher à côté de l’anglaise. */
export function frenchPrinting(printings: PsaPrinting[] | undefined): PsaPrinting | null {
  if (!printings || printings.length === 0) return null
  const french = printings.filter((row) => isFrenchPrinting(row.label))
  if (french.length === 0) return null
  return french.reduce((best, row) => (row.total > best.total ? row : best))
}

export function hasEnoughGrades(printing: PsaPrinting | null): boolean {
  return printing != null && printing.total >= MIN_POPULATION_SAMPLE
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value)
}

export function formatGemRate(printing: PsaPrinting): string {
  if (printing.total <= 0) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(printing.psa10 / printing.total)
}

export function formatCensusDate(iso: string | null): string | null {
  if (!iso) return null
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    new Date(year, month - 1, day),
  )
}

/** Date de recensement la plus récente présente dans le fichier. */
export function latestCensusDate(file: PopulationFile | null | undefined): string | null {
  if (!file) return null
  let latest: string | null = null
  for (const card of Object.values(file.cards)) {
    for (const printing of card.printings) {
      if (isFrenchPrinting(printing.label)) continue
      if (printing.updatedAt && (latest == null || printing.updatedAt > latest)) {
        latest = printing.updatedAt
      }
    }
  }
  return latest
}

export interface PopulationRank {
  rankById: Map<string, number>
  comparable: number
}

/** 1 = le plus petit nombre de notes 10, parmi les cartes assez notées. */
export function rankByPsa10(
  cards: { id: string; printings: PsaPrinting[] | undefined }[],
): PopulationRank {
  const ranked = cards
    .map((card) => ({ id: card.id, primary: primaryPrinting(card.printings) }))
    .filter((row): row is { id: string; primary: PsaPrinting } => row.primary != null && hasEnoughGrades(row.primary))
    .sort(
      (a, b) =>
        a.primary.psa10 - b.primary.psa10 || a.primary.total - b.primary.total || a.id.localeCompare(b.id),
    )

  const rankById = new Map<string, number>()
  let lastScore = Number.NaN
  let lastRank = 0
  ranked.forEach((row, index) => {
    if (row.primary.psa10 !== lastScore) {
      lastRank = index + 1
      lastScore = row.primary.psa10
    }
    rankById.set(row.id, lastRank)
  })
  return { rankById, comparable: ranked.length }
}

/** Groupe 0 = comparable, 1 = trop peu notée, 2 = aucun chiffre. */
export function populationSortGroup(printings: PsaPrinting[] | undefined): {
  group: number
  psa10: number
} {
  const primary = primaryPrinting(printings)
  if (!primary) return { group: 2, psa10: Number.POSITIVE_INFINITY }
  if (primary.total < MIN_POPULATION_SAMPLE) return { group: 1, psa10: primary.psa10 }
  return { group: 0, psa10: primary.psa10 }
}
