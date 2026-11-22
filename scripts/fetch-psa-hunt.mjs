/**
 * Construit un fichier compact pour la section « PSA 10 ».
 * Une page par série suffit : elle contient le nombre de notes 10 et le prix PSA 10.
 *
 * Usage : node scripts/fetch-psa-hunt.mjs
 * Source : https://cardprice.com — à afficher avec un lien vers la source.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CONCURRENCY = 5
const SOURCE = 'https://cardprice.com'

function decode(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCount(text) {
  const digits = decode(text).replace(/[^\d]/g, '')
  if (!digits) return null
  const value = Number(digits)
  return Number.isFinite(value) ? value : null
}

function parseUsd(text) {
  const cleaned = decode(text).replace(/[$,]/g, '').trim()
  if (!cleaned || cleaned === '—' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function parsePopHtml(html) {
  const rows = []
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/)
  const body = bodyMatch ? bodyMatch[1] : html
  for (const part of body.split('<tr>')) {
    if (!part.includes('pop-card-cell')) continue
    const href = part.match(/href="\/card\/([^"]+)"/)
    const image = part.match(/\/images\/cards\/([^"?]+)/)
    const name = part.match(/<b>([\s\S]*?)<\/b>/)
    const small = part.match(/<small>([\s\S]*?)<\/small>/)
    const cells = [...part.matchAll(/<td class="r[^"]*">([\s\S]*?)<\/td>/g)].map((match) => match[1])
    if (!href || !name || cells.length < 4) continue

    const smallText = decode(small?.[1] ?? '')
    const numberMatch = smallText.match(/#\s*([A-Za-z0-9]+)/)
    const printing = smallText.includes('·') ? smallText.split('·').slice(1).join('·').trim() : ''
    const total = parseCount(cells[0])
    const psa10 = parseCount(cells[1])
    if (total == null || psa10 == null || total <= 0) continue

    const cardId = image ? image[1].replace(/\.(png|webp|jpe?g)$/i, '') : ''
    rows.push({
      cardId,
      name: decode(name[1]),
      number: numberMatch?.[1] ?? '',
      printing,
      total,
      psa10,
      psa10Usd: parseUsd(cells[3]),
      rawUsd: cells[4] != null ? parseUsd(cells[4]) : null,
      slug: href[1],
    })
  }
  return rows
}

async function fetchText(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(25000),
  })
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
    return fetchText(url, attempt + 1)
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }
  return response.text()
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

const setsResponse = await fetch('https://api.cardprice.com/api/sets', {
  headers: { accept: 'application/json' },
})
if (!setsResponse.ok) {
  throw new Error(`Liste des séries indisponible (${setsResponse.status})`)
}
const { sets } = await setsResponse.json()

const bySlug = new Map()
for (const set of sets) {
  if (!set.slug || set.game && set.game !== 'pokemon') continue
  const previous = bySlug.get(set.slug)
  if (!previous || (set.total || 0) > (previous.total || 0)) bySlug.set(set.slug, set)
}
const unique = [...bySlug.values()]

const canary = unique.find((set) => set.slug === '151')
if (!canary) throw new Error('Série 151 introuvable')
const canaryRows = parsePopHtml(await fetchText(`${SOURCE}/pop/psa/${canary.slug}`))
const sampleVariant = canaryRows.find((row) => row.printing)
console.log(
  `Contrôle 151 : ${canaryRows.length} lignes, exemple ${canaryRows[0]?.name} PSA 10 = ${canaryRows[0]?.psa10Usd}`,
)
console.log('Variante :', sampleVariant?.name, sampleVariant?.printing, sampleVariant?.psa10)
if (canaryRows.length < 100) {
  throw new Error('Le tableau des notes n’a pas pu être lu. Fichier non écrit.')
}

let done = 0
let failed = 0
const collected = await mapPool(unique, CONCURRENCY, async (set) => {
  try {
    const html = await fetchText(`${SOURCE}/pop/psa/${encodeURIComponent(set.slug)}`)
    const rows = parsePopHtml(html)
    done += 1
    if (done % 25 === 0 || rows.length === 0) {
      console.log(`${done}/${unique.length} ${set.slug} : ${rows.length}`)
    }
    return { set, rows }
  } catch (error) {
    failed += 1
    done += 1
    console.error(`Échec ${set.slug} :`, error instanceof Error ? error.message : error)
    return { set, rows: [] }
  }
})

const kept = collected.filter((entry) => entry.rows.length > 0)
const payloadSets = []
const payloadCards = []
for (const entry of kept) {
  const setIndex = payloadSets.length
  payloadSets.push({
    id: entry.set.id,
    name: entry.set.name,
    series: entry.set.series || 'Other',
    language: entry.set.language || 'en',
  })
  for (const row of entry.rows) {
    payloadCards.push([
      setIndex,
      row.cardId,
      row.name,
      row.number,
      row.printing,
      row.total,
      row.psa10,
      row.psa10Usd,
      row.rawUsd,
      row.slug,
    ])
  }
}

const payload = {
  source: SOURCE,
  sourceName: 'CardPrice',
  fetchedAt: new Date().toISOString().slice(0, 10),
  sets: payloadSets,
  cards: payloadCards,
}

const outDir = path.join(ROOT, 'public', 'data')
await mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'psa-hunt.json')
const body = JSON.stringify(payload)
await writeFile(outPath, body, 'utf8')
console.log(
  `${payloadSets.length} séries, ${payloadCards.length} lignes, ${(body.length / 1_000_000).toFixed(1)} Mo, ${failed} échecs`,
)
