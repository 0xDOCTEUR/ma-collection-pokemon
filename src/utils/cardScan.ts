import { createWorker, PSM, type Worker } from 'tesseract.js'
import { LOOSE_CONDITIONS } from './advicePrice'
import { FRENCH_NAMES, foldName } from './frenchNames'
import { mainSpecies } from './generations'
import type { ScanTarget } from './scanTargets'

export type LooseConditionId = (typeof LOOSE_CONDITIONS)[number]['id']

export interface ScanMatch {
  target: ScanTarget
  number: string
  score: number
  why: string
  /** Score de ressemblance visuelle (0..100) si comparé aux vignettes. */
  visualPct?: number
}

export interface ConditionGuess {
  id: LooseConditionId
  label: string
  reason: string
  confidence: 'faible' | 'moyenne'
}

export interface ScanResult {
  numbers: string[]
  /** Noms d’espèces lus (pour préremplir la recherche manuelle). */
  names: string[]
  matches: ScanMatch[]
  condition: ConditionGuess
  previewUrl: string
  ocrText: string
  /** Empreinte visuelle de la carte recadrée, pour trier la recherche manuelle. */
  visualSignature: VisualSignature | null
}

export interface VisualSignature {
  full: Float32Array
  art: Float32Array
}

let workerPromise: Promise<Worker> | null = null
const imageSignatureCache = new Map<string, VisualSignature | null>()

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // Un seul modèle léger (eng) : 2× plus rapide, lit aussi les noms français sans accent.
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

type ImageSource = HTMLImageElement | HTMLCanvasElement

function sourceSize(image: ImageSource) {
  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height }
  }
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
}

/**
 * Charge une photo en canvas : orientation EXIF corrigée, taille limitée.
 * Pas de recompression JPEG intermédiaire pour préserver les petits caractères.
 */
async function loadScanCanvas(source: Blob | string): Promise<HTMLCanvasElement> {
  const maxSide = 1800
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')

  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions)
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return canvas
    } catch {
      // Navigateur sans support ou format atypique : repli Image.
    }
  }

  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Impossible de lire la photo.'))
    img.src = url
  })
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height),
  )
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if (typeof source !== 'string') URL.revokeObjectURL(url)
  return canvas
}

/**
 * Repère le rectangle de la carte sur n’importe quel fond (table blanche/grise,
 * tapis sombre, papier quadrillé) grâce au plan bilinéaire des 4 coins.
 */
export function detectCardBounds(image: ImageSource): {
  sx: number
  sy: number
  sw: number
  sh: number
} {
  const { width: sourceW, height: sourceH } = sourceSize(image)
  const pw = 180
  const ph = Math.max(120, Math.round((pw * sourceH) / sourceW))
  const probe = document.createElement('canvas')
  probe.width = pw
  probe.height = ph
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return { sx: 0, sy: 0, sw: sourceW, sh: sourceH }
  context.drawImage(image, 0, 0, pw, ph)
  const { data } = context.getImageData(0, 0, pw, ph)

  function cornerMedian(cx: number, cy: number): [number, number, number] {
    const rs: number[] = []
    const gs: number[] = []
    const bs: number[] = []
    for (let dy = 0; dy < 6; dy += 1) {
      for (let dx = 0; dx < 6; dx += 1) {
        const i = ((cy + dy) * pw + (cx + dx)) * 4
        rs.push(data[i])
        gs.push(data[i + 1])
        bs.push(data[i + 2])
      }
    }
    const med = (arr: number[]) => {
      arr.sort((a, b) => a - b)
      return arr[Math.floor(arr.length / 2)]
    }
    return [med(rs), med(gs), med(bs)]
  }

  const tl = cornerMedian(2, 2)
  const tr = cornerMedian(pw - 8, 2)
  const bl = cornerMedian(2, ph - 8)
  const br = cornerMedian(pw - 8, ph - 8)

  const rowCounts = new Int32Array(ph)
  const colCounts = new Int32Array(pw)
  let fgPixels = 0

  for (let y = 0; y < ph; y += 1) {
    const ty = y / Math.max(1, ph - 1)
    for (let x = 0; x < pw; x += 1) {
      const tx = x / Math.max(1, pw - 1)
      const bgR = (1 - ty) * ((1 - tx) * tl[0] + tx * tr[0]) + ty * ((1 - tx) * bl[0] + tx * br[0])
      const bgG = (1 - ty) * ((1 - tx) * tl[1] + tx * tr[1]) + ty * ((1 - tx) * bl[1] + tx * br[1])
      const bgB = (1 - ty) * ((1 - tx) * tl[2] + tx * tr[2]) + ty * ((1 - tx) * bl[2] + tx * br[2])
      const i = (y * pw + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      if (dist > 68 || sat > 36) {
        rowCounts[y] += 1
        colCounts[x] += 1
        fgPixels += 1
      }
    }
  }

  const fgRatio = fgPixels / (pw * ph)
  if (fgRatio < 0.08 || fgRatio > 0.9) {
    return { sx: 0, sy: 0, sw: sourceW, sh: sourceH }
  }

  const rowThresh = pw * 0.28
  const colThresh = ph * 0.3
  let y0 = 0
  let y1 = ph - 1
  let x0 = 0
  let x1 = pw - 1
  while (y0 < ph && rowCounts[y0] < rowThresh) y0 += 1
  while (y1 > y0 && rowCounts[y1] < rowThresh) y1 -= 1
  while (x0 < pw && colCounts[x0] < colThresh) x0 += 1
  while (x1 > x0 && colCounts[x1] < colThresh) x1 -= 1

  // Petite marge (2 %) pour garder les bords de la carte sans reprendre la table.
  const padX = Math.max(1, Math.round((x1 - x0) * 0.02))
  const padY = Math.max(1, Math.round((y1 - y0) * 0.02))
  x0 = Math.max(0, x0 - padX)
  y0 = Math.max(0, y0 - padY)
  x1 = Math.min(pw - 1, x1 + padX)
  y1 = Math.min(ph - 1, y1 + padY)

  const bw = (x1 - x0 + 1) / pw
  const bh = (y1 - y0 + 1) / ph
  if (bw < 0.22 || bh < 0.22 || (bw > 0.94 && bh > 0.94)) {
    return { sx: 0, sy: 0, sw: sourceW, sh: sourceH }
  }

  const sx = Math.round((x0 / pw) * sourceW)
  const sy = Math.round((y0 / ph) * sourceH)
  const sw = Math.max(32, Math.min(sourceW - sx, Math.round(bw * sourceW)))
  const sh = Math.max(32, Math.min(sourceH - sy, Math.round(bh * sourceH)))
  return { sx, sy, sw, sh }
}

function extractCardCanvas(image: ImageSource): HTMLCanvasElement {
  const bounds = detectCardBounds(image)
  const canvas = document.createElement('canvas')
  const targetW = Math.min(1000, Math.max(600, bounds.sw))
  const scale = targetW / Math.max(1, bounds.sw)
  canvas.width = Math.max(240, Math.round(bounds.sw * scale))
  canvas.height = Math.max(320, Math.round(bounds.sh * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')
  context.imageSmoothingEnabled = true
  context.drawImage(
    image,
    bounds.sx,
    bounds.sy,
    bounds.sw,
    bounds.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas
}

function makeCrop(
  image: ImageSource,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  mode: 'raw' | 'inv' | 'contrast' | 'invcontrast' = 'raw',
  scaleFactor = 2.5,
): HTMLCanvasElement {
  const { width: sourceW, height: sourceH } = sourceSize(image)
  const sx = Math.round(sourceW * rx)
  const sy = Math.round(sourceH * ry)
  const sw = Math.max(16, Math.round(sourceW * rw))
  const sh = Math.max(16, Math.round(sourceH * rh))

  const outW = Math.max(360, Math.min(1200, Math.round(sw * scaleFactor)))
  const outH = Math.max(64, Math.round((outW * sh) / sw))
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')
  context.imageSmoothingEnabled = true
  context.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)

  if (mode === 'raw') return canvas

  const pixels = context.getImageData(0, 0, outW, outH)
  const data = pixels.data
  let mn = 255
  let mx = 0
  const gray = new Uint8Array(outW * outH)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    gray[p] = g
    if (g < mn) mn = g
    if (g > mx) mx = g
  }
  const span = Math.max(1, mx - mn)

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let v = gray[p]
    if (mode === 'inv') {
      v = 255 - v
    } else if (mode === 'contrast') {
      v = Math.round(((v - mn) / span) * 255)
    } else if (mode === 'invcontrast') {
      v = 255 - Math.round(((v - mn) / span) * 255)
    }
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

/** Empreinte RGB centrée et normalisée d’une zone (insensible à l’éclairage global). */
function regionDescriptor(
  source: ImageSource,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  w: number,
  h: number,
): Float32Array {
  const { width: iw, height: ih } = sourceSize(source)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const vec = new Float32Array(w * h * 3)
  if (!context) return vec
  context.drawImage(source, iw * rx, ih * ry, iw * rw, ih * rh, 0, 0, w, h)
  const { data } = context.getImageData(0, 0, w, h)
  const n = w * h
  let meanR = 0
  let meanG = 0
  let meanB = 0
  for (let i = 0; i < data.length; i += 4) {
    meanR += data[i]
    meanG += data[i + 1]
    meanB += data[i + 2]
  }
  meanR /= n
  meanG /= n
  meanB /= n
  let norm = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const r = data[i] - meanR
    const g = data[i + 1] - meanG
    const b = data[i + 2] - meanB
    vec[j] = r
    vec[j + 1] = g
    vec[j + 2] = b
    norm += r * r + g * g + b * b
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i += 1) vec[i] /= norm
  return vec
}

export function computeVisualSignature(source: ImageSource): VisualSignature {
  return {
    full: regionDescriptor(source, 0.04, 0.04, 0.92, 0.92, 16, 22),
    art: regionDescriptor(source, 0.1, 0.12, 0.8, 0.36, 16, 16),
  }
}

function dotSim(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

function compareSignatures(a: VisualSignature, b: VisualSignature): number {
  const full = dotSim(a.full, b.full)
  const art = dotSim(a.art, b.art)
  // Full Art / Illustration Rare : `full` domine ; Reverse Holo classique : `art` sauve la mise.
  return Math.max(full, 0.52 * full + 0.48 * art, art * 0.92)
}

async function fetchImageSignature(url: string): Promise<VisualSignature | null> {
  if (!url) return null
  if (imageSignatureCache.has(url)) return imageSignatureCache.get(url) ?? null

  const signature = await new Promise<VisualSignature | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => resolve(null), 3500)
    img.onload = () => {
      window.clearTimeout(timer)
      try {
        resolve(computeVisualSignature(img))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })

  imageSignatureCache.set(url, signature)
  return signature
}

interface NumberHit {
  number: string
  total: string | null
  trusted: boolean
}

function cleanOcrNumber(raw: string): string {
  if (/[A-Za-z]/.test(raw)) {
    return raw.replace(/[^\dA-Za-z]/g, '')
  }
  return raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[^\d]/g, '')
}

function normalizeCardNumber(raw: string): string {
  const cleaned = cleanOcrNumber(raw).toUpperCase()
  if (!cleaned) return ''
  if (/^\d+$/.test(cleaned)) return String(Number.parseInt(cleaned, 10))
  const gallery = cleaned.match(/^([A-Z]{1,4})0*(\d{1,3})$/)
  if (gallery) {
    const digits = gallery[2]
    return `${gallery[1]}${digits.padStart(Math.max(2, digits.length), '0')}`
  }
  return cleaned
}

export function numberLookupKeys(number: string): string[] {
  const base = normalizeCardNumber(number)
  if (!base) return []
  const keys = new Set<string>([base])
  const gallery = base.match(/^([A-Z]+)(\d+)$/)
  if (gallery) {
    const n = String(Number.parseInt(gallery[2], 10))
    keys.add(`${gallery[1]}${n}`)
    keys.add(`${gallery[1]}${n.padStart(2, '0')}`)
    keys.add(`${gallery[1]}${n.padStart(3, '0')}`)
  }
  return [...keys]
}

export function extractNumberHits(text: string, printedTotals: Set<string>): NumberHit[] {
  const hits: NumberHit[] = []
  const seen = new Set<string>()

  function push(numberRaw: string, totalRaw: string | null, trusted: boolean) {
    const normalized = normalizeCardNumber(numberRaw)
    if (!normalized) return
    if (
      !/^\d{1,3}$/.test(normalized) &&
      !/^[A-Z]{1,4}\d{1,3}$/.test(normalized) &&
      !/^[A-Z]$/.test(normalized)
    ) {
      return
    }
    const totalNorm = totalRaw ? normalizeCardNumber(totalRaw) : null
    const totalDigits = totalNorm && /^\d+$/.test(totalNorm) ? totalNorm : null
    if (seen.has(normalized)) return
    if (!totalNorm && printedTotals.has(normalized)) return
    if (/^\d+$/.test(normalized)) {
      const value = Number(normalized)
      if (value < 1 || value > 500) return
    }
    seen.add(normalized)
    hits.push({
      number: normalized,
      total: totalDigits,
      trusted:
        trusted ||
        /^[A-Z]{2,}\d+$/.test(normalized) ||
        Boolean(totalDigits && (printedTotals.has(totalDigits) || Number(totalDigits) >= 60)),
    })
  }

  // Galerie : GG03/GG70, TG11/TG30
  for (const match of text.matchAll(
    /\b((?:TG|GG|SV|SM|XY|BW)[-\s]?\d{1,3})\s*[/|Il\\]\s*((?:TG|GG|SV|SM|XY|BW)[-\s]?\d{1,3}|\d{2,3})\b/gi,
  )) {
    push(match[1].replace(/[-\s]/g, ''), match[2].replace(/[-\s]/g, ''), true)
  }

  // Formats usuels : 199/165, 107/094, 29/110
  for (const match of text.matchAll(/\b(\d{1,3})\s*[/|Il\\]\s*(\d{2,3})\b/gi)) {
    push(match[1], match[2], true)
  }

  // « No. 150 », « N°150 »
  for (const match of text.matchAll(/(?:n[o°.]|no\.?|n°)\s*(\d{1,3})\b/gi)) {
    push(match[1], null, false)
  }

  // Codes type TG01, GG12, SV001, SWSH162
  for (const match of text.matchAll(/\b((?:TG|GG|SV|SM|XY|BW|SWSH)[-\s]?\d{1,3})\b/gi)) {
    push(match[1].replace(/[-\s]/g, ''), null, true)
  }

  // Si on a 199/165, ignore 9/165 ou 99/165 (suffixes OCR trompeurs).
  const strong = hits.filter((hit) => hit.trusted && hit.total && /^\d+$/.test(hit.number))
  if (strong.length > 0) {
    return hits.filter((hit) => {
      if (!hit.total || !/^\d+$/.test(hit.number)) return true
      return !strong.some(
        (other) =>
          other.number !== hit.number &&
          other.total === hit.total &&
          other.number.endsWith(hit.number) &&
          other.number.length > hit.number.length,
      )
    })
  }

  return hits
}

function speciesKey(name: string): string {
  return foldName(name)
    .replace(/\bex\b/g, '')
    .replace(/\bgx\b/g, '')
    .replace(/\bvmax\b/g, '')
    .replace(/\bvstar\b/g, '')
    .replace(/\bv-?union\b/g, '')
    .replace(/\bv\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasWord(haystack: string, phrase: string): boolean {
  const word = foldName(phrase).trim()
  if (word.length < 3) return false
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 2) return 3
  const prev = new Int32Array(n + 1)
  const curr = new Int32Array(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > 2) return 3
    prev.set(curr)
  }
  return prev[n]
}

interface NameHit {
  species: string
  label: string
  /** 1 = trouvé en haut (nom principal), 0 = ailleurs (ex. texte d’évolution). */
  priority: number
}

const SPECIES_CATALOG = Object.entries(FRENCH_NAMES)
  .map(([french, english]) => ({
    french: foldName(french),
    frenchCompact: foldName(french).replace(/[^a-z0-9]+/g, ''),
    english: foldName(english),
    englishCompact: foldName(english).replace(/[^a-z0-9]+/g, ''),
    label: french,
  }))
  .sort((a, b) => b.frenchCompact.length - a.frenchCompact.length)

/**
 * Cherche les noms de Pokémon (FR et EN) avec tolérance aux erreurs OCR :
 * - lettre parasite collée (`JMaganon`, `Dracaufeu@y`)
 * - espace parasite (`M aganon`, `Dracauf eu`)
 * - 1 à 2 fautes de lecture (`Maganor`, `Dracaulcu`, `ewtwo`)
 */
export function findSpeciesInText(topText: string, extraText = ''): NameHit[] {
  const hits: NameHit[] = []
  const seen = new Set<string>()

  // Retire « Évolution de : X » du texte principal pour ne pas confondre Magmar et Maganon.
  const cleanedTop = foldName(topText).replace(/(?:evolution|evolves)\s*(?:de|from)\s*[:.]?\s*[a-z0-9 -]{2,18}/gi, ' ')
  const passList: { text: string; priority: number }[] = [
    { text: cleanedTop, priority: 2 },
    { text: foldName(extraText), priority: 1 },
  ]

  for (const pass of passList) {
    if (!pass.text.trim()) continue
    const compactText = pass.text.replace(/[^a-z0-9]+/g, '')
    const tokens = pass.text
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4)

    // 1. Correspondance exacte (mot entier ou collé/espacé pour les noms >= 5 lettres)
    for (const candidate of SPECIES_CATALOG) {
      const key = candidate.englishCompact
      if (seen.has(key)) continue

      let matched = ''
      if (candidate.french.length >= 3 && hasWord(pass.text, candidate.french)) {
        matched = candidate.label
      } else if (candidate.english.length >= 3 && hasWord(pass.text, candidate.english)) {
        matched = candidate.label
      } else if (candidate.frenchCompact.length >= 5 && compactText.includes(candidate.frenchCompact)) {
        matched = candidate.label
      } else if (candidate.englishCompact.length >= 5 && compactText.includes(candidate.englishCompact)) {
        matched = candidate.label
      }

      if (!matched) continue
      const blocked = [...seen].some((id) => id.includes(key) || key.includes(id))
      if (blocked && key.length <= 4) continue
      seen.add(key)
      hits.push({ species: candidate.english, label: matched, priority: pass.priority })
    }

    // 2. Correspondance floue (Levenshtein) uniquement sur le haut de la carte si rien trouvé en exact
    if (pass.priority === 2 && hits.length === 0) {
      // Aussi paires de tokens adjacents (ex. « M » + « aganon » → « maganon »)
      const rawTokens = pass.text.split(/[^a-z0-9]+/).filter(Boolean)
      const fuzzyTokens = new Set<string>(tokens)
      for (let i = 0; i < rawTokens.length - 1; i += 1) {
        const joined = rawTokens[i] + rawTokens[i + 1]
        if (joined.length >= 5 && joined.length <= 16) fuzzyTokens.add(joined)
      }

      let bestFuzzy: { candidate: (typeof SPECIES_CATALOG)[number]; dist: number } | null = null
      for (const token of fuzzyTokens) {
        if (token.length < 5) continue
        // Ignore les mots génériques de carte
        if (/^(pokemon|niveau|basic|stage|evolution|evolves|faiblesse|resistance|retraite|talent|ability|trainer|dresseur|energie|energy|illus)$/.test(token)) {
          continue
        }
        for (const candidate of SPECIES_CATALOG) {
          for (const targetWord of [candidate.frenchCompact, candidate.englishCompact]) {
            if (targetWord.length < 5) continue
            const maxDist = targetWord.length >= 7 ? 2 : 1
            const dist = levenshtein(token, targetWord)
            if (dist <= maxDist) {
              if (!bestFuzzy || dist < bestFuzzy.dist || (dist === bestFuzzy.dist && targetWord.length > bestFuzzy.candidate.frenchCompact.length)) {
                bestFuzzy = { candidate, dist }
              }
            }
          }
        }
      }
      if (bestFuzzy && !seen.has(bestFuzzy.candidate.englishCompact)) {
        seen.add(bestFuzzy.candidate.englishCompact)
        hits.push({
          species: bestFuzzy.candidate.english,
          label: bestFuzzy.candidate.label,
          priority: 1,
        })
      }
    }
  }

  return hits.sort((a, b) => b.priority - a.priority)
}

function englishSpeciesKey(name: string): string {
  const fromMain = mainSpecies(name)
  if (fromMain) return foldName(fromMain).replace(/[^a-z0-9]+/g, '')
  const key = speciesKey(name).replace(/[^a-z0-9]+/g, '')
  for (const [french, english] of Object.entries(FRENCH_NAMES)) {
    const frenchKey = foldName(french).replace(/[^a-z0-9]+/g, '')
    if (key === frenchKey || (frenchKey.length >= 4 && key.startsWith(frenchKey))) {
      return foldName(english).replace(/[^a-z0-9]+/g, '')
    }
  }
  return key
}

function speciesMatchesTarget(species: NameHit, target: ScanTarget): boolean {
  const hitEnglish = foldName(species.species).replace(/[^a-z0-9]+/g, '')
  const hitFrench = foldName(species.label).replace(/[^a-z0-9]+/g, '')
  if (englishSpeciesKey(target.name) === hitEnglish) return true

  const targetKey = speciesKey(target.name).replace(/[^a-z0-9]+/g, '')
  if (targetKey && (targetKey === hitEnglish || targetKey === hitFrench)) return true

  for (const [french, english] of Object.entries(FRENCH_NAMES)) {
    const frenchKey = foldName(french).replace(/[^a-z0-9]+/g, '')
    const englishKey = foldName(english).replace(/[^a-z0-9]+/g, '')
    if (englishKey !== hitEnglish && frenchKey !== hitFrench) continue
    if (targetKey === frenchKey || targetKey === englishKey) return true
    if (targetKey.includes(frenchKey) || frenchKey.includes(targetKey)) {
      if (Math.min(targetKey.length, frenchKey.length) >= 4) return true
    }
  }
  return false
}

function setHintBoost(ocrText: string, target: ScanTarget): number {
  const folded = foldName(ocrText)
  const label = foldName(target.setLabel)
  let score = 0
  if (label && hasWord(folded, label.split('·')[0]?.trim() ?? '')) score += 12
  if (target.setId.includes('sv03.5') || target.setId.includes('sv3pt5')) {
    if (/\b151\b/.test(folded) || /pokemon 151|pok.?mon 151/.test(folded)) score += 14
  }
  if (target.setId.includes('me55') || /30e|30th|anniversaire|celebration/.test(folded)) {
    if (/30e|30th|anniversaire|celebration/.test(foldName(target.setLabel))) score += 10
  }
  if (target.collectionCard) score += 4
  if (/^[A-Z]{2,}\d+$/i.test(target.number)) score += 4
  return score
}

function targetsForNumber(byNumber: Map<string, ScanTarget[]>, number: string): ScanTarget[] {
  const found: ScanTarget[] = []
  const seen = new Set<string>()
  for (const key of numberLookupKeys(number)) {
    for (const target of byNumber.get(key) ?? []) {
      if (seen.has(target.id)) continue
      seen.add(target.id)
      found.push(target)
    }
  }
  return found
}

function speciesDedupeKey(target: ScanTarget): string {
  return `${target.setId}:${target.number}:${englishSpeciesKey(target.name) || foldName(target.name).replace(/[^a-z0-9]+/g, '')}`
}

/**
 * Classe une liste de cartes candidates par ressemblance visuelle avec la photo scannée.
 * Utilisé automatiquement après l’OCR ET lors d’une recherche manuelle !
 */
export async function rankTargetsVisually(
  candidates: ScanTarget[],
  signature: VisualSignature | null,
  baseMatches?: Map<string, ScanMatch>,
  maxInspect = 110,
): Promise<ScanMatch[]> {
  if (!signature || candidates.length === 0) {
    return candidates.slice(0, 12).map((target) => {
      const existing = baseMatches?.get(target.id)
      return (
        existing ?? {
          target,
          number: target.number,
          score: 75,
          why: 'Correspondance texte',
        }
      )
    })
  }

  // Priorité : cartes de la collection, puis les plus cotées / avec image.
  const ordered = [...candidates]
    .filter((target) => Boolean(target.imageSmall))
    .sort((a, b) => {
      const aBase = baseMatches?.get(a.id)?.score ?? 0
      const bBase = baseMatches?.get(b.id)?.score ?? 0
      if (bBase !== aBase) return bBase - aBase
      if (Boolean(a.collectionCard) !== Boolean(b.collectionCard)) return a.collectionCard ? -1 : 1
      const aVal = a.hunt?.psa10Usd ?? a.hunt?.rawUsd ?? 0
      const bVal = b.hunt?.psa10Usd ?? b.hunt?.rawUsd ?? 0
      return bVal - aVal
    })
    .slice(0, maxInspect)

  const scored: ScanMatch[] = []
  const batchSize = 20
  for (let i = 0; i < ordered.length; i += batchSize) {
    const batch = ordered.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (target) => {
        const existing = baseMatches?.get(target.id)
        const targetSig = await fetchImageSignature(target.imageSmall)
        const sim = targetSig ? compareSignatures(signature, targetSig) : -0.5
        const visualPct = Math.max(0, Math.min(99, Math.round(sim * 100)))
        const visualBoost = sim > 0 ? sim * 110 : 0
        const baseScore = existing?.score ?? 68
        const whyParts = [
          existing?.why ?? '',
          sim >= 0.12 ? `Visuel ${visualPct} %` : '',
        ].filter(Boolean)
        scored.push({
          target,
          number: target.number,
          score: baseScore + visualBoost,
          why: whyParts.join(' · ') || 'Comparaison visuelle',
          visualPct,
        })
      }),
    )
  }

  return scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.visualPct ?? 0) - (a.visualPct ?? 0) ||
      (a.target.collectionCard ? 0 : 1) - (b.target.collectionCard ? 0 : 1),
  )
}

export function scoreMatches(
  targets: ScanTarget[],
  numberHits: NumberHit[],
  speciesHits: NameHit[],
  ocrText: string,
  minScore = 70,
): { matches: ScanMatch[]; visualPool: ScanTarget[] } {
  const byNumber = new Map<string, ScanTarget[]>()
  for (const target of targets) {
    for (const key of numberLookupKeys(target.number)) {
      const list = byNumber.get(key) ?? []
      list.push(target)
      byNumber.set(key, list)
    }
  }

  const best = new Map<string, ScanMatch>()
  const poolMap = new Map<string, ScanTarget>()

  function keep(match: ScanMatch) {
    const current = best.get(match.target.id)
    if (!current || match.score > current.score) best.set(match.target.id, match)
    poolMap.set(match.target.id, match.target)
  }

  for (const hit of numberHits) {
    let candidates = targetsForNumber(byNumber, hit.number)
    if (candidates.length === 0) continue

    if (hit.total) {
      const withTotal = candidates.filter((target) => String(target.printedTotal) === hit.total)
      if (withTotal.length > 0) candidates = withTotal
    }

    const named = speciesHits.length
      ? candidates.filter((target) =>
          speciesHits.some((species) => speciesMatchesTarget(species, target)),
        )
      : []

    if (named.length > 0) {
      candidates = named
    } else if (/^[A-Z]{2,}\d+$/.test(hit.number) && candidates.length <= 10) {
      // Codes GG/TG assez uniques.
    } else if (hit.total && candidates.length <= 12) {
      // Numéro + total connus : le visuel départagera.
    } else if (hit.total && candidates.length > 12) {
      candidates = [...candidates]
        .sort(
          (a, b) =>
            (b.hunt?.psa10Usd ?? b.hunt?.rawUsd ?? 0) - (a.hunt?.psa10Usd ?? a.hunt?.rawUsd ?? 0),
        )
        .slice(0, 10)
    } else if (candidates.length > 6) {
      const collectionOnly = candidates.filter((target) => target.collectionCard)
      if (collectionOnly.length > 0 && collectionOnly.length <= 6) candidates = collectionOnly
      else continue
    }

    for (const target of candidates) {
      const nameHit = speciesHits.find((species) => speciesMatchesTarget(species, target))
      const base = hit.trusted ? 82 : 60
      const nameBoost = nameHit ? 40 : 0
      const totalBoost = hit.total && String(target.printedTotal) === hit.total ? 18 : 0
      const galleryBoost = /^[A-Z]{2,}\d+$/.test(hit.number) ? 10 : 0
      const score = base + nameBoost + totalBoost + galleryBoost + setHintBoost(ocrText, target)
      keep({
        target,
        number: hit.number,
        score,
        why: [
          hit.total ? `Numéro lu : ${hit.number}/${hit.total}` : `Numéro lu : ${hit.number}`,
          nameHit ? `Nom lu : ${nameHit.label}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }
  }

  // Nom lu : on garde TOUTES les cartes de cette espèce (ex. les 17 Maganon ou 103 Mewtwo)
  // pour que la comparaison visuelle retrouve la bonne carte exacte !
  if (speciesHits.length > 0) {
    for (const species of speciesHits.slice(0, 2)) {
      const named = targets.filter((target) => speciesMatchesTarget(species, target))
      for (const target of named) {
        poolMap.set(target.id, target)
        if (!best.has(target.id)) {
          keep({
            target,
            number: target.number,
            score: 70 + species.priority * 4 + setHintBoost(ocrText, target),
            why: `Nom lu : ${species.label}`,
          })
        }
      }
    }
  }

  return {
    matches: [...best.values()].filter((match) => match.score >= minScore),
    visualPool: [...poolMap.values()],
  }
}

function finalizeMatches(matches: ScanMatch[]): ScanMatch[] {
  const sorted = [...matches].sort(
    (a, b) =>
      b.score - a.score ||
      (b.visualPct ?? 0) - (a.visualPct ?? 0) ||
      (a.target.collectionCard ? 0 : 1) - (b.target.collectionCard ? 0 : 1) ||
      Number(a.number) - Number(b.number),
  )

  const unique: ScanMatch[] = []
  const seen = new Set<string>()
  const seenCollectionCard = new Set<string>()
  for (const match of sorted) {
    const key = speciesDedupeKey(match.target)
    if (seen.has(key)) continue
    const cardKey = `${match.target.number}:${englishSpeciesKey(match.target.name)}`
    if (match.target.collectionCard) {
      seenCollectionCard.add(cardKey)
    } else if (seenCollectionCard.has(cardKey)) {
      continue
    }
    seen.add(key)
    unique.push(match)
  }

  return unique
}

/**
 * Estimation grossière de l’état : blancs sur les bords, contraste au centre.
 * À confirmer toujours par l’utilisateur.
 */
export function guessCondition(image: ImageSource): ConditionGuess {
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
  targets: ScanTarget[],
  onProgress?: (status: string) => void,
): Promise<ScanResult> {
  onProgress?.('Recadrage de la carte…')
  const image = await loadScanCanvas(source)
  const previewUrl = image.toDataURL('image/jpeg', 0.88)
  const card = extractCardCanvas(image)
  const condition = guessCondition(card)
  const visualSignature = computeVisualSignature(card)
  const printedTotals = new Set(
    targets.map((target) => String(target.printedTotal)).filter((value) => value && value !== '0'),
  )

  onProgress?.('Lecture du nom et du numéro…')
  const worker = await getWorker()

  async function ocr(canvas: HTMLCanvasElement, psm: PSM): Promise<string> {
    await worker.setParameters({ tessedit_pageseg_mode: psm })
    const { data } = await worker.recognize(canvas, undefined, { text: true })
    return data.text?.trim() ?? ''
  }

  // 1. Bande du nom en haut (sans binarisation : lit aussi les Full Art et textes blancs)
  const topRegions: { canvas: HTMLCanvasElement; psm: PSM }[] = [
    { canvas: makeCrop(card, 0.14, 0.025, 0.62, 0.09, 'raw', 2.5), psm: PSM.SINGLE_BLOCK },
    { canvas: makeCrop(card, 0.04, 0.015, 0.92, 0.15, 'raw', 2.0), psm: PSM.SPARSE_TEXT },
    { canvas: makeCrop(card, 0.04, 0.015, 0.92, 0.15, 'inv', 2.0), psm: PSM.SPARSE_TEXT },
  ]
  const topTexts: string[] = []
  for (const r of topRegions) {
    const t = await ocr(r.canvas, r.psm)
    if (t) topTexts.push(t)
  }

  // 2. Numéro en bas à GAUCHE (cartes récentes) ET en bas à DROITE (anciennes cartes)
  const bottomRegions: { canvas: HTMLCanvasElement; psm: PSM }[] = [
    { canvas: makeCrop(card, 0.02, 0.86, 0.44, 0.13, 'raw', 3.0), psm: PSM.SPARSE_TEXT },
    { canvas: makeCrop(card, 0.02, 0.86, 0.44, 0.13, 'invcontrast', 3.0), psm: PSM.SPARSE_TEXT },
    { canvas: makeCrop(card, 0.56, 0.86, 0.42, 0.13, 'raw', 3.0), psm: PSM.SPARSE_TEXT },
    { canvas: makeCrop(card, 0.56, 0.86, 0.42, 0.13, 'invcontrast', 3.0), psm: PSM.SPARSE_TEXT },
  ]
  const bottomTexts: string[] = []
  for (const r of bottomRegions) {
    const t = await ocr(r.canvas, r.psm)
    if (t) bottomTexts.push(t)
  }

  let topText = topTexts.join('\n')
  let extraText = bottomTexts.join('\n')
  let ocrText = `${topText}\n${extraText}`
  let numberHits = extractNumberHits(ocrText, printedTotals)
  let speciesHits = findSpeciesInText(topText, extraText)

  // 3. Relance large si rien de lu (photo mal cadrée ou très brillante)
  if (speciesHits.length === 0 && numberHits.length === 0) {
    onProgress?.('Nouvel essai sur toute la photo…')
    const fullFallbacks = [
      makeCrop(card, 0, 0, 1, 0.25, 'invcontrast', 2.2),
      makeCrop(image, 0, 0, 1, 1, 'raw', 1.4),
      makeCrop(image, 0, 0, 1, 1, 'inv', 1.4),
    ]
    for (const canvas of fullFallbacks) {
      const t = await ocr(canvas, PSM.SPARSE_TEXT)
      if (t) {
        topText = `${topText}\n${t}`
        ocrText = `${ocrText}\n${t}`
      }
    }
    numberHits = extractNumberHits(ocrText, printedTotals)
    speciesHits = findSpeciesInText(topText, extraText)
  }

  const { matches: rawMatches, visualPool } = scoreMatches(
    targets,
    numberHits,
    speciesHits,
    ocrText,
  )

  let finalMatches: ScanMatch[]
  // 4. Comparaison visuelle dès qu’on a plusieurs candidats (retrouve LA bonne carte même sans numéro !)
  if (visualPool.length > 1) {
    onProgress?.(`Comparaison visuelle (${Math.min(visualPool.length, 110)} cartes)…`)
    const baseMap = new Map(rawMatches.map((m) => [m.target.id, m]))
    const ranked = await rankTargetsVisually(visualPool, visualSignature, baseMap)
    finalMatches = finalizeMatches(ranked)
  } else {
    finalMatches = finalizeMatches(rawMatches)
  }

  return {
    numbers: numberHits.map((hit) => hit.number),
    names: speciesHits.map((hit) => hit.label),
    matches: finalMatches.slice(0, 8),
    condition,
    previewUrl,
    ocrText,
    visualSignature,
  }
}

export function conditionLabel(id: LooseConditionId): string {
  return LOOSE_CONDITIONS.find((row) => row.id === id)?.label ?? id
}
