import { createWorker, type Worker } from 'tesseract.js'
import { LOOSE_CONDITIONS } from './advicePrice'
import { FRENCH_NAMES, foldName } from './frenchNames'
import type { PokemonCard } from '../types'

export type LooseConditionId = (typeof LOOSE_CONDITIONS)[number]['id']

export interface ScanMatch {
  card: PokemonCard
  number: string
  score: number
  why: string
}

export interface ConditionGuess {
  id: LooseConditionId
  label: string
  reason: string
  confidence: 'faible' | 'moyenne'
}

export interface ScanResult {
  numbers: string[]
  matches: ScanMatch[]
  condition: ConditionGuess
  previewUrl: string
  ocrText: string
}

let workerPromise: Promise<Worker> | null = null

/** Anglais lu sur la carte → nom français de la série. */
const ENGLISH_TO_FRENCH = new Map<string, string>()
for (const [french, english] of Object.entries(FRENCH_NAMES)) {
  const key = foldName(english)
  if (!ENGLISH_TO_FRENCH.has(key)) ENGLISH_TO_FRENCH.set(key, french)
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng').catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export async function terminateScanWorker(): Promise<void> {
  if (!workerPromise) return
  const worker = await workerPromise
  await worker.terminate()
  workerPromise = null
}

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de lire la photo.'))
    image.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })
}

function binarize(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height)
  let sum = 0
  const grays = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p += 1) {
    const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]
    grays[p] = gray
    sum += gray
  }
  const mean = sum / grays.length
  // Seuil un peu bas : le brillant holo crée des blancs trompeurs.
  const threshold = Math.min(170, Math.max(95, mean * 0.92))
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p += 1) {
    const value = grays[p] > threshold ? 255 : 0
    pixels.data[i] = value
    pixels.data[i + 1] = value
    pixels.data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
}

type CropKind = 'bottom' | 'top' | 'numberCorner'

function cropRegion(image: HTMLImageElement, kind: CropKind): HTMLCanvasElement {
  const sourceW = image.naturalWidth || image.width
  const sourceH = image.naturalHeight || image.height
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')

  let sx = 0
  let sy = 0
  let sw = sourceW
  let sh = sourceH

  if (kind === 'bottom') {
    sy = sourceH * 0.72
    sh = sourceH * 0.28
  } else if (kind === 'top') {
    sh = sourceH * 0.22
  } else {
    // Coin bas droit : numéro + total imprimés
    sx = sourceW * 0.35
    sy = sourceH * 0.78
    sw = sourceW * 0.65
    sh = sourceH * 0.22
  }

  const outW = Math.min(1100, Math.round(sw))
  const outH = Math.max(64, Math.round((outW * sh) / sw))
  canvas.width = outW
  canvas.height = outH
  context.fillStyle = '#fff'
  context.fillRect(0, 0, outW, outH)
  context.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)
  binarize(context, outW, outH)
  return canvas
}

interface NumberHit {
  number: string
  total: string | null
  trusted: boolean
}

function extractNumberHits(text: string, printedTotals: Set<string>): NumberHit[] {
  const hits: NumberHit[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(/(\d{1,3})\s*[/|Il]\s*(\d{2,3})/gi)) {
    const number = String(Number.parseInt(match[1], 10))
    const total = String(Number.parseInt(match[2], 10))
    if (seen.has(number)) continue
    seen.add(number)
    hits.push({
      number,
      total,
      trusted: printedTotals.has(total) || Number(total) >= 100,
    })
  }

  // Sans fraction fiable, on n’accepte plus les petits chiffres isolés :
  // le brillant holo invente trop de 2, 5, 9…
  return hits
}

function speciesKey(name: string): string {
  return foldName(name)
    .replace(/-ex\b/g, '')
    .replace(/-gx\b/g, '')
    .replace(/-v\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function englishForFrenchSpecies(french: string): string | null {
  const direct = FRENCH_NAMES[french]
  if (direct) return foldName(direct)
  const first = french.split(' ')[0]
  return first ? FRENCH_NAMES[first] ?? null : null
}

/** Mot entier seulement : « mew » ne doit pas matcher dans « mewtwo ». */
function hasWord(haystack: string, phrase: string): boolean {
  const word = foldName(phrase).trim()
  if (word.length < 3) return false
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack)
}

function findNameMatches(text: string, cards: PokemonCard[]): ScanMatch[] {
  const folded = foldName(text)
  const matches: ScanMatch[] = []
  const seen = new Set<string>()

  // Les noms les plus longs d’abord : Mewtwo avant Mew.
  const ordered = [...cards].sort(
    (a, b) => speciesKey(b.name).length - speciesKey(a.name).length || a.name.localeCompare(b.name, 'fr'),
  )

  for (const card of ordered) {
    const french = speciesKey(card.name)
    if (!french || french.length < 3) continue

    let why = ''
    if (hasWord(folded, french)) {
      why = `Nom lu : ${card.name}`
    } else {
      const english = englishForFrenchSpecies(french)
      if (english && hasWord(folded, english)) {
        why = `Nom lu : ${english}`
      } else {
        for (const token of folded.split(/[^a-z0-9]+/)) {
          if (token.length < 4) continue
          const mapped = ENGLISH_TO_FRENCH.get(token)
          if (mapped && (french === mapped || french.replace(/ /g, '') === mapped.replace(/ /g, ''))) {
            why = `Nom lu : ${token}`
            break
          }
          if (french === token) {
            why = `Nom lu : ${card.name}`
            break
          }
        }
      }
    }

    if (!why || seen.has(card.id)) continue
    // Si un nom plus long a déjà matché la même espèce (mewtwo), ignorer « mew »
    const blocked = [...seen].some((id) => {
      const other = cards.find((item) => item.id === id)
      if (!other) return false
      const otherKey = speciesKey(other.name)
      return otherKey !== french && (otherKey.includes(french) || french.includes(otherKey))
    })
    if (blocked && french.length <= 4) continue

    seen.add(card.id)
    const secret = Number(card.number) > card.printedTotal
    matches.push({
      card,
      number: card.number,
      score: 82 + Math.min(12, french.length) - (secret ? 3 : 0),
      why,
    })
  }

  return matches
}

function scoreMatches(
  cards: PokemonCard[],
  numberHits: NumberHit[],
  nameMatches: ScanMatch[],
): ScanMatch[] {
  const byNumber = new Map(cards.map((card) => [card.number, card]))
  const best = new Map<string, ScanMatch>()

  function keep(match: ScanMatch) {
    const current = best.get(match.card.id)
    if (!current || match.score > current.score) best.set(match.card.id, match)
  }

  for (const hit of numberHits) {
    const card = byNumber.get(hit.number)
    if (!card) continue
    keep({
      card,
      number: hit.number,
      score: hit.trusted ? 95 : 35,
      why: hit.total ? `Numéro lu : ${hit.number}/${hit.total}` : `Numéro lu : ${hit.number}`,
    })
  }

  for (const match of nameMatches) {
    const existing = best.get(match.card.id)
    if (existing) {
      keep({
        ...existing,
        score: existing.score + 40,
        why: `${match.why} · ${existing.why}`,
      })
    } else {
      keep(match)
    }
  }

  // Si un nom fort et un numéro faible divergent, le nom gagne.
  return [...best.values()]
    .filter((match) => match.score >= 70)
    .sort((a, b) => b.score - a.score || Number(a.number) - Number(b.number))
}

/**
 * Estimation grossière de l’état : blancs sur les bords, contraste au centre.
 * À confirmer toujours par l’utilisateur.
 */
export function guessCondition(image: HTMLImageElement): ConditionGuess {
  const canvas = document.createElement('canvas')
  const size = 220
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return {
      id: 'nm',
      label: 'Quasi neuf',
      reason: 'Impossible d’analyser la photo. Choisis l’état à la main.',
      confidence: 'faible',
    }
  }
  context.drawImage(image, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)

  let edgeWhite = 0
  let edgeCount = 0
  let centerBright = 0
  let centerCount = 0
  let contrast = 0

  const border = Math.round(size * 0.08)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const i = (y * size + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const bright = (r + g + b) / 3
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      const onEdge = x < border || y < border || x >= size - border || y >= size - border
      if (onEdge) {
        edgeCount += 1
        if (bright > 185 && sat < 35) edgeWhite += 1
      } else if (x > size * 0.25 && x < size * 0.75 && y > size * 0.25 && y < size * 0.75) {
        centerCount += 1
        centerBright += bright
        contrast += sat
      }
    }
  }

  const whiteRate = edgeCount ? edgeWhite / edgeCount : 0
  const avgBright = centerCount ? centerBright / centerCount : 128
  const avgSat = centerCount ? contrast / centerCount : 40

  let id: LooseConditionId = 'nm'
  let reason = 'La photo semble propre. Confirme l’état : le scan peut se tromper.'

  if (whiteRate > 0.28 || avgSat < 18) {
    id = 'po'
    reason = 'Beaucoup de blancs sur les bords ou peu de contraste. La carte semble abîmée. Confirme.'
  } else if (whiteRate > 0.18 || avgBright < 70) {
    id = 'pl'
    reason = 'Bords usés ou photo sombre. La carte semble jouée. Confirme.'
  } else if (whiteRate > 0.12) {
    id = 'lp'
    reason = 'Un peu de blanc sur les bords. La carte semble en léger jeu. Confirme.'
  } else if (whiteRate > 0.07) {
    id = 'gd'
    reason = 'Quelques traces sur les bords. La carte semble en bon état. Confirme.'
  } else if (whiteRate > 0.035) {
    id = 'ex'
    reason = 'Petites traces possibles. La carte semble excellente. Confirme.'
  } else if (avgSat > 55 && whiteRate < 0.02) {
    id = 'mint'
    reason = 'Bords propres et couleurs vives. La carte semble neuve. Confirme.'
  }

  const label = LOOSE_CONDITIONS.find((row) => row.id === id)?.label ?? 'Quasi neuf'
  return {
    id,
    label,
    reason,
    confidence: whiteRate > 0.12 || whiteRate < 0.02 ? 'moyenne' : 'faible',
  }
}

export async function scanCardPhoto(
  source: Blob | string,
  cards: PokemonCard[],
): Promise<ScanResult> {
  const previewUrl = typeof source === 'string' ? source : URL.createObjectURL(source)
  const image = await loadImage(previewUrl)
  const condition = guessCondition(image)
  const printedTotals = new Set(cards.map((card) => String(card.printedTotal)))
  const worker = await getWorker()

  const regions = [cropRegion(image, 'top'), cropRegion(image, 'numberCorner'), cropRegion(image, 'bottom')]
  const texts: string[] = []
  for (const region of regions) {
    const { data } = await worker.recognize(region, undefined, { text: true })
    if (data.text) texts.push(data.text)
  }
  const ocrText = texts.join('\n')
  const numberHits = extractNumberHits(ocrText, printedTotals)
  const nameMatches = findNameMatches(ocrText, cards)
  const matches = scoreMatches(cards, numberHits, nameMatches)

  return {
    numbers: numberHits.map((hit) => hit.number),
    matches,
    condition,
    previewUrl,
    ocrText,
  }
}

export function conditionLabel(id: LooseConditionId): string {
  return LOOSE_CONDITIONS.find((row) => row.id === id)?.label ?? id
}
