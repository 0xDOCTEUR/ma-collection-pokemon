import { matchesSearchText } from './frenchNames'
import { frenchCardName } from './generations'
import { catalogSetName, huntImageUrl, type PsaHuntData } from './psaHunt'
import type { SearchSuggestItem } from '../components/SearchSuggest'

/** Suggestions de cartes à partir du catalogue PSA / hunt. */
export function buildPokemonSuggestions(
  hunt: PsaHuntData | null | undefined,
  query: string,
  limit = 8,
): SearchSuggestItem[] {
  const q = query.trim()
  if (q.length < 2 || !hunt) return []
  const seen = new Set<string>()
  const rows: SearchSuggestItem[] = []
  for (const row of hunt.cards) {
    if (row.set.language === 'fr') continue
    const name = frenchCardName(row.name)
    const setName = catalogSetName(row.set)
    const hay = `${name} ${row.name} ${row.number} ${setName}`
    if (!matchesSearchText(hay, q)) continue
    const key = `${row.set.id}:${row.number}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      key,
      name,
      number: row.number,
      setName,
      image: huntImageUrl(row, 'low') ?? undefined,
    })
    if (rows.length >= limit) break
  }
  return rows
}
