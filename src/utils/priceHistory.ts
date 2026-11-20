import type { CardmarketLiveStats, PriceHistoryPoint, PriceRangeDays } from '../types'

const STORAGE_KEY = 'pokedoc-cm-history-v1'

type DaySnapshot = {
  date: string
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
}

type HistoryStore = Record<string, DaySnapshot[]>

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgoKey(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as HistoryStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: HistoryStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota plein : on ignore, le graphique reste utilisable sans historique
  }
}

function pickValue(snap: DaySnapshot): number | null {
  return snap.trend ?? snap.avg1 ?? snap.avg7 ?? snap.avg30
}

/** Enregistre le relevé du jour pour cette carte (une entrée par jour). */
export function recordPriceSnapshot(cardKey: string, stats: CardmarketLiveStats): void {
  const date = todayKey()
  const store = readStore()
  const list = store[cardKey] ?? []
  const next: DaySnapshot = {
    date,
    trend: stats.trend,
    avg1: stats.avg1,
    avg7: stats.avg7,
    avg30: stats.avg30,
  }
  const withoutToday = list.filter((s) => s.date !== date)
  withoutToday.push(next)
  withoutToday.sort((a, b) => a.date.localeCompare(b.date))
  // garder ~1 an max
  store[cardKey] = withoutToday.slice(-370)
  writeStore(store)
}

/**
 * Points pour le graphique 30/90 jours.
 * Priorité aux relevés locaux ; si peu de données, complète avec les moyennes
 * glissantes Cardmarket (points non « enregistrés »).
 */
export function buildTrendPoints(
  cardKey: string,
  stats: CardmarketLiveStats | null,
  range: PriceRangeDays,
): PriceHistoryPoint[] {
  const store = readStore()
  const cutoff = daysAgoKey(range)
  const recorded: PriceHistoryPoint[] = []
  for (const s of store[cardKey] ?? []) {
    if (s.date < cutoff) continue
    const value = pickValue(s)
    if (value == null) continue
    recorded.push({ date: s.date, value, recorded: true })
  }

  if (recorded.length >= 2) {
    return recorded
  }

  if (!stats) return recorded

  const approx: PriceHistoryPoint[] = []
  if (stats.avg30 != null && range >= 30) {
    approx.push({ date: daysAgoKey(Math.min(30, range)), value: stats.avg30, recorded: false })
  }
  if (stats.avg7 != null) {
    approx.push({ date: daysAgoKey(7), value: stats.avg7, recorded: false })
  }
  if (stats.avg1 != null) {
    approx.push({ date: daysAgoKey(1), value: stats.avg1, recorded: false })
  }
  const today = pickValue({
    date: todayKey(),
    trend: stats.trend,
    avg1: stats.avg1,
    avg7: stats.avg7,
    avg30: stats.avg30,
  })
  if (today != null) {
    approx.push({ date: todayKey(), value: today, recorded: false })
  }

  // fusionner : relevés locaux écrasent les approximations le même jour
  const byDate = new Map<string, PriceHistoryPoint>()
  for (const p of approx) byDate.set(p.date, p)
  for (const p of recorded) byDate.set(p.date, p)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
