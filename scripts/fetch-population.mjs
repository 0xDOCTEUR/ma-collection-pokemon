/**
 * Télécharge la population PSA (nombre d'exemplaires notés) depuis CardPrice
 * et écrit un fichier compact par série.
 *
 * Usage : node scripts/fetch-population.mjs
 * Source : https://api.cardprice.com — affichage avec mention de la source.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CONCURRENCY = 6

const SETS = [
  {
    file: 'sv03.5',
    source: 'https://cardprice.com/pop/psa/151',
    toCardPriceId: (id) => id,
  },
  {
    file: 'me06',
    source: 'https://cardprice.com/pop/psa/delta-reign',
    toCardPriceId: (id) => id.replace(/^me06-/, 'me6-'),
  },
]

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
    return fetchJson(url, attempt + 1)
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }
  return response.json()
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

async function fetchSet(set) {
  const cards = JSON.parse(
    await readFile(path.join(ROOT, 'public', 'data', 'sets', `${set.file}.json`), 'utf8'),
  )
  const labels = new Set()
  let withPop = 0
  let failed = 0

  const rows = await mapPool(cards, CONCURRENCY, async (card) => {
    const cpId = set.toCardPriceId(card.id)
    try {
      const data = await fetchJson(`https://api.cardprice.com/api/card/${encodeURIComponent(cpId)}`)
      const printings = (data.population ?? [])
        .filter((row) => row.company === 'psa' && Number.isFinite(row.total) && Number.isFinite(row.gem))
        .map((row) => {
          const label = typeof row.printing === 'string' ? row.printing : ''
          labels.add(label || '(normale)')
          return {
            label,
            total: row.total,
            psa10: row.gem,
            updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
          }
        })
      if (printings.length > 0) withPop += 1
      return [card.id, printings.length > 0 ? { printings } : null]
    } catch (error) {
      failed += 1
      console.error(`Échec ${card.id} (${cpId}) :`, error instanceof Error ? error.message : error)
      return [card.id, null]
    }
  })

  const population = {}
  for (const [id, entry] of rows) {
    if (entry) population[id] = entry
  }

  const outDir = path.join(ROOT, 'public', 'data', 'population')
  await mkdir(outDir, { recursive: true })
  const payload = {
    source: set.source,
    sourceName: 'CardPrice',
    fetchedAt: new Date().toISOString().slice(0, 10),
    cards: population,
  }
  const outPath = path.join(outDir, `${set.file}.json`)
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(
    `${set.file} : ${withPop}/${cards.length} cartes avec population, ${failed} échecs, versions : ${[...labels].join(' | ') || 'aucune'}`,
  )
}

for (const set of SETS) {
  await fetchSet(set)
}
