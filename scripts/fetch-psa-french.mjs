/**
 * Recensement PSA des séries françaises, publié par GemRate et repris sur BetterPop.
 * Écrit :
 * - public/data/psa-french.json (onglet PSA 10, langue « fr », sans prix)
 * - public/data/population/sv03.5-fr.json (même numéro que les cartes 151 de la collection)
 *
 * Usage : node scripts/fetch-psa-french.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = 'https://better-pop.com/pop-report/'
const SET_151 = 'french-mew-fr-151'

const MONTHS = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

const VARIANT_FR = {
  'Reverse Holo': 'Reverse',
  'Illustration Rare': 'Illustration rare',
  'Special Illustration Rare': 'Illustration spéciale',
  'Ultra Rare': 'Ultra rare',
  'Hyper Rare': 'Hyper rare',
  'Double Rare': 'Double rare',
  'Rare': 'Rare',
  'Gamestop Exclusive': 'Exclusivité magasin',
  'Pokemon Center Exclusive': 'Exclusivité boutique',
  'Pokemon Center': 'Exclusivité boutique',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function displaySetName(name, slug) {
  const cleaned = name.replace(/\s+PSA Population Report$/i, '').trim()
  if (!cleaned || cleaned === 'PSA Population Report') {
    return slug === 'french' ? 'Set de base' : slug
  }
  return cleaned
}

function parseCount(value) {
  const digits = stripTags(value).replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function pageDate(html) {
  const match = html.match(/Pop data updated ([A-Za-z]+) (\d{1,2}), (\d{4})/i)
  if (!match) return null
  const month = MONTHS[match[1].toLowerCase()]
  if (!month) return null
  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`
}

function pageTitle(html, slug) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const raw = heading ? stripTags(heading[1]) : slug
  return displaySetName(raw.replace(/^French\s+/i, ''), slug)
}

function seriesOf(name, slug) {
  if (slug === 'french') return 'Base'
  const text = `${name} ${slug}`.toLowerCase()
  if (
    /promo|prize pack|mcdonald|holiday|first battle|championship|battle academy|trainer kit|deck/.test(
      text,
    )
  ) {
    return 'Special Promos'
  }
  if (/mega|ascended heroes|chaos rising|pitch black|perfect order|30th|30c/.test(text)) {
    return 'Mega Evolution'
  }
  if (
    /151|scarlet|temporal|paldea|obsidian|paradox|twilight|shrouded|stellar|surging|prismatic|journey|destined|white flare|black bolt|phantasmal|sv black|basic energ/.test(
      text,
    )
  ) {
    return 'Scarlet & Violet'
  }
  if (/black & white|boundaries crossed|noble victories/.test(text)) return 'Black & White'
  if (/heartgold|soulsilver|triumphant/.test(text)) return 'HeartGold & SoulSilver'
  if (/platinum|supreme victors/.test(text)) return 'Platinum'
  if (/diamond|pearl|legends awakened|stormfront|mysterious treasures|secret wonders/.test(text)) {
    return 'Diamond & Pearl'
  }
  if (/\bex\b|crystal guardians|dragon frontiers|delta species|unseen forces|hidden legends|team magma|sandstorm|dragon\b/.test(text)) {
    return 'EX'
  }
  if (/expedition/.test(text)) return 'E-Card'
  if (/\bneo\b/.test(text)) return 'Neo'
  if (/rocket|fossil|jungle|\b1999\b/.test(text)) return 'Base'
  return 'Other'
}

function huntVariant(variant) {
  if (!variant) return ''
  return VARIANT_FR[variant] ?? variant
}

function collectionLabel(variant) {
  const short = huntVariant(variant)
  return short ? `Français · ${short}` : 'Français'
}

function cardNumber(raw) {
  const text = raw.trim()
  if (/^\d+$/.test(text)) return String(Number(text))
  return text
}

function parseRows(html) {
  const rows = []
  const pattern =
    /<tr>\s*<td class="pop-num-cell"[^>]*>([\s\S]*?)<\/td>\s*<td class="pop-name-cell">([\s\S]*?)<\/td>\s*<td class="num"[^>]*>([\s\S]*?)<\/td>\s*<td class="num"[^>]*>([\s\S]*?)<\/td>\s*<td class="num"[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of html.matchAll(pattern)) {
    const number = cardNumber(stripTags(match[1]))
    const nameHtml = match[2]
    const strong = nameHtml.match(/<strong>([\s\S]*?)<\/strong>/i)
    const variant = nameHtml.match(/class="pop-variant">([\s\S]*?)<\/span>/i)
    const name = strong ? stripTags(strong[1]) : stripTags(nameHtml)
    const psa10 = parseCount(match[3])
    const total = parseCount(match[5])
    if (!name || !number || psa10 == null || total == null || total <= 0) continue
    rows.push({
      number,
      name,
      variant: variant ? stripTags(variant[1]) : '',
      psa10,
      total,
    })
  }
  return rows
}

async function fetchText(url) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'pokedoc-psa-french/1.0 (collection personnelle)',
          accept: 'text/html',
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await sleep(800 * (attempt + 1))
    }
  }
  throw lastError
}

const indexHtml = await fetchText(INDEX)
const slugs = [
  ...new Set(
    [...indexHtml.matchAll(/href="\/pop-report\/(french[^"]+|mcdonald-s-collection-french)\/?"/gi)].map(
      (match) => match[1].replace(/\/$/, ''),
    ),
  ),
]
if (slugs.length < 60) {
  throw new Error(`Seulement ${slugs.length} séries françaises trouvées.`)
}

const sets = []
const cards = []
const variants = new Set()
let newest = '1970-01-01'
const population151 = {}
const setCards = JSON.parse(readFileSync(join(root, 'public/data/sets/sv03.5.json'), 'utf8'))
const idByNumber = new Map(setCards.map((card) => [String(card.number), card.id]))

for (const slug of slugs) {
  await sleep(200)
  const url = `https://better-pop.com/pop-report/${slug}/`
  const html = await fetchText(url)
  const rows = parseRows(html)
  const updatedAt = pageDate(html)
  const name = pageTitle(html, slug)
  if (updatedAt && updatedAt > newest) newest = updatedAt
  const setIndex = sets.length
  sets.push({
    id: slug,
    name,
    series: seriesOf(name, slug),
    language: 'fr',
  })
  for (const row of rows) {
    variants.add(row.variant || '(normale)')
    const printing = huntVariant(row.variant)
    cards.push([
      setIndex,
      `fr:${slug}:${row.number}:${printing || 'normale'}`,
      row.name,
      row.number,
      printing,
      row.total,
      row.psa10,
      null,
      null,
      url,
    ])
    if (slug !== SET_151) continue
    const cardId = idByNumber.get(row.number)
    if (!cardId) continue
    const label = collectionLabel(row.variant)
    const entry = population151[cardId] ?? { printings: [] }
    if (!entry.printings.some((item) => item.label === label)) {
      entry.printings.push({
        label,
        total: row.total,
        psa10: row.psa10,
        updatedAt,
      })
    }
    population151[cardId] = entry
  }
  console.log(`${slug}: ${rows.length} lignes, ${name}`)
}

const today = new Date().toISOString().slice(0, 10)
const hunt = {
  source: 'https://better-pop.com/pop-report/',
  sourceName: 'GemRate',
  fetchedAt: newest === '1970-01-01' ? today : newest,
  sets,
  cards,
}
writeFileSync(join(root, 'public/data/psa-french.json'), `${JSON.stringify(hunt)}\n`)

const population = {
  source: `https://better-pop.com/pop-report/${SET_151}/`,
  sourceName: 'GemRate',
  fetchedAt: newest === '1970-01-01' ? today : newest,
  cards: population151,
}
writeFileSync(
  join(root, 'public/data/population/sv03.5-fr.json'),
  `${JSON.stringify(population, null, 2)}\n`,
)

const matched = Object.keys(population151).length
console.log(`séries ${sets.length}, cartes ${cards.length}, 151 rattachées ${matched}`)
console.log('versions', [...variants].sort().join(' | '))
