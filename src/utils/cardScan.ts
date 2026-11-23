import { createWorker, type Worker } from 'tesseract.js'
import { LOOSE_CONDITIONS } from './advicePrice'
import type { PokemonCard } from '../types'

export type LooseConditionId = (typeof LOOSE_CONDITIONS)[number]['id']

export interface ScanMatch {
  card: PokemonCard
  number: string
  score: number
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
}

let workerPromise: Promise<Worker> | null = null

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

/** Zone basse de la carte : c’est là que se trouve le numéro. */
async function cropBottom(image: HTMLImageElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  const width = Math.min(1200, image.naturalWidth || image.width)
  const height = Math.round(width * ((image.naturalHeight || image.height) / (image.naturalWidth || image.width)))
  canvas.width = width
  canvas.height = Math.max(80, Math.round(height * 0.28))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')
  const sourceH = image.naturalHeight || image.height
  const sourceW = image.naturalWidth || image.width
  const cropH = sourceH * 0.28
  context.drawImage(image, 0, sourceH - cropH, sourceW, cropH, 0, 0, canvas.width, canvas.height)
  // Renforcer le contraste pour l’OCR
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]
    const value = gray > 140 ? 255 : gray < 90 ? 0 : gray
    pixels.data[i] = value
    pixels.data[i + 1] = value
    pixels.data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function extractNumbers(text: string): string[] {
  const primary: string[] = []
  const secondary: string[] = []
  const seen = new Set<string>()
  const denominators = new Set<string>()

  for (const match of text.matchAll(/(\d{1,3})\s*[/|\\]\s*(\d{2,3})/g)) {
    const left = String(Number.parseInt(match[1], 10))
    const right = String(Number.parseInt(match[2], 10))
    denominators.add(right)
    if (!seen.has(left)) {
      seen.add(left)
      primary.push(left)
    }
  }

  for (const match of text.matchAll(/\b(\d{1,3})\b/g)) {
    const value = Number.parseInt(match[1], 10)
    if (value < 1 || value > 300) continue
    const number = String(value)
    if (seen.has(number) || denominators.has(number)) continue
    seen.add(number)
    secondary.push(number)
  }

  // Le numéro avant le « / » compte d’abord ; le total après le « / » est ignoré.
  return [...primary, ...secondary]
}

function matchCards(cards: PokemonCard[], numbers: string[]): ScanMatch[] {
  const byNumber = new Map(cards.map((card) => [card.number, card]))
  const matches: ScanMatch[] = []
  numbers.forEach((number, index) => {
    const card = byNumber.get(number)
    if (!card) return
    matches.push({ card, number, score: 100 - index * 8 })
  })
  return matches.sort((a, b) => b.score - a.score)
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
  const crop = await cropBottom(image)
  const worker = await getWorker()
  const { data } = await worker.recognize(crop, undefined, { text: true })
  const numbers = extractNumbers(data.text || '')
  const matches = matchCards(cards, numbers)
  return { numbers, matches, condition, previewUrl }
}

export function conditionLabel(id: LooseConditionId): string {
  return LOOSE_CONDITIONS.find((row) => row.id === id)?.label ?? id
}
