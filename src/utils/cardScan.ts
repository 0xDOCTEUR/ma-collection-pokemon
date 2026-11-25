import { createWorker, type Worker } from 'tesseract.js'
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

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // Anglais + français : les cartes FR ont le nom en français.
    workerPromise = createWorker(['eng', 'fra']).catch((error) => {
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

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de lire la photo.'))
    image.src = canvas.toDataURL('image/jpeg', 0.92)
  })
}

/**
 * Charge une photo en respectant l’orientation EXIF (souvent cassée à l’import
 * depuis la galerie téléphone) et en limitant la taille pour l’OCR.
 */
async function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const maxSide = 1600

  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, {
        // Corrige les photos tournées de la galerie iPhone / Android.
        imageOrientation: 'from-image',
      } as ImageBitmapOptions)
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas indisponible.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return canvasToImage(canvas)
    } catch {
      // HEIC ou navigateur sans support : repli Image classique.
    }
  }

  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Impossible de lire la photo.'))
    img.src = url
  })

  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  if (scale >= 0.99) return image
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((image.naturalWidth || image.width) * scale)
  canvas.height = Math.round((image.naturalHeight || image.height) * scale)
  const context = canvas.getContext('2d')
  if (!context) return image
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvasToImage(canvas)
}

type ImageSource = HTMLImageElement | HTMLCanvasElement

function sourceSize(image: ImageSource) {
  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height }
  }
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
}

/** Repère la carte sur un fond clair (photo loin / table blanche). */
export function detectCardBounds(image: ImageSource): {
  sx: number
  sy: number
  sw: number
  sh: number
} {
  const { width: sourceW, height: sourceH } = sourceSize(image)
  const probe = document.createElement('canvas')
  const pw = 180
  const ph = Math.max(120, Math.round((pw * sourceH) / sourceW))
  probe.width = pw
  probe.height = ph
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return { sx: 0, sy: 0, sw: sourceW, sh: sourceH }
  context.drawImage(image, 0, 0, pw, ph)
  const { data } = context.getImageData(0, 0, pw, ph)

  let minX = pw
  let minY = ph
  let maxX = 0
  let maxY = 0
  let count = 0
  for (let y = 0; y < ph; y += 1) {
    for (let x = 0; x < pw; x += 1) {
      const i = (y * pw + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const bright = (r + g + b) / 3
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      // Fond blanc / table claire → ignorer. Garde couleurs et zones sombres de la carte.
      const isBackground = bright > 228 && sat < 28
      if (isBackground) continue
      count += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  const area = count / (pw * ph)
  if (count < 80 || area < 0.04 || area > 0.92) {
    return { sx: 0, sy: 0, sw: sourceW, sh: sourceH }
  }

  const padX = Math.max(2, Math.round((maxX - minX) * 0.04))
  const padY = Math.max(2, Math.round((maxY - minY) * 0.04))
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(pw - 1, maxX + padX)
  maxY = Math.min(ph - 1, maxY + padY)

  const sx = Math.round((minX / pw) * sourceW)
  const sy = Math.round((minY / ph) * sourceH)
  const sw = Math.max(32, Math.round(((maxX - minX + 1) / pw) * sourceW))
  const sh = Math.max(32, Math.round(((maxY - minY + 1) / ph) * sourceH))
  return { sx, sy, sw: Math.min(sw, sourceW - sx), sh: Math.min(sh, sourceH - sy) }
}

function extractCardCanvas(image: ImageSource): HTMLCanvasElement {
  const bounds = detectCardBounds(image)
  const canvas = document.createElement('canvas')
  const maxW = 900
  const scale = Math.min(1.8, maxW / Math.max(bounds.sw, 1))
  canvas.width = Math.max(200, Math.round(bounds.sw * scale))
  canvas.height = Math.max(280, Math.round(bounds.sh * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
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

function binarize(context: CanvasRenderingContext2D, width: number, height: number, invert = false) {
  const pixels = context.getImageData(0, 0, width, height)
  let sum = 0
  const grays = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p += 1) {
    const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]
    grays[p] = gray
    sum += gray
  }
  const mean = sum / grays.length
  const threshold = Math.min(175, Math.max(90, mean * 0.9))
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p += 1) {
    let value = grays[p] > threshold ? 255 : 0
    if (invert) value = 255 - value
    pixels.data[i] = value
    pixels.data[i + 1] = value
    pixels.data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
}

function boostContrast(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]
    const value = Math.max(0, Math.min(255, (gray - 110) * 1.55 + 128))
    pixels.data[i] = value
    pixels.data[i + 1] = value
    pixels.data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
}

type CropKind = 'bottom' | 'top' | 'numberCorner' | 'full'

function cropRegion(
  image: ImageSource,
  kind: CropKind,
  mode: 'binarize' | 'binarize-invert' | 'contrast' = 'binarize',
): HTMLCanvasElement {
  const { width: sourceW, height: sourceH } = sourceSize(image)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible.')

  let sx = 0
  let sy = 0
  let sw = sourceW
  let sh = sourceH

  if (kind === 'bottom') {
    sy = sourceH * 0.68
    sh = sourceH * 0.32
  } else if (kind === 'top') {
    sh = sourceH * 0.26
  } else if (kind === 'numberCorner') {
    // Coin bas droit : numéro + total imprimés
    sx = sourceW * 0.4
    sy = sourceH * 0.74
    sw = sourceW * 0.6
    sh = sourceH * 0.26
  }

  const outW = Math.min(1200, Math.round(sw * (kind === 'full' ? 1.1 : 1.7)))
  const outH = Math.max(72, Math.round((outW * sh) / sw))
  canvas.width = outW
  canvas.height = outH
  context.fillStyle = '#fff'
  context.fillRect(0, 0, outW, outH)
  context.imageSmoothingEnabled = true
  context.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)
  if (mode === 'contrast') boostContrast(context, outW, outH)
  else binarize(context, outW, outH, mode === 'binarize-invert')
  return canvas
}

interface NumberHit {
  number: string
  total: string | null
  trusted: boolean
}

function cleanOcrNumber(raw: string): string {
  // Ne pas transformer S/B dans GG/SV : seulement les vrais chiffres OCR.
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
    // GG03 (catalogue) plutôt que GG3
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
    // Ignore les totaux pris pour des numéros (ex. 165 lu seul).
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

  // Formats usuels : 199/165, 004 / 165
  for (const match of text.matchAll(/\b(\d{1,3})\s*[/|Il\\]\s*(\d{2,3})\b/gi)) {
    push(match[1], match[2], true)
  }

  // « No. 150 », « N°150 »
  for (const match of text.matchAll(/(?:n[o°.]|no\.?|n°)\s*(\d{1,3})\b/gi)) {
    push(match[1], null, false)
  }

  // Codes type TG01, GG12, SV001 en bas de carte
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
    .replace(/\bv\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mot entier seulement : « mew » ne doit pas matcher dans « mewtwo ». */
function hasWord(haystack: string, phrase: string): boolean {
  const word = foldName(phrase).trim()
  if (word.length < 3) return false
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack)
}

interface NameHit {
  species: string
  label: string
}

function findSpeciesInText(text: string): NameHit[] {
  const folded = foldName(text)
  const hits: NameHit[] = []
  const seen = new Set<string>()

  const candidates = Object.entries(FRENCH_NAMES)
    .map(([french, english]) => ({
      french: foldName(french),
      english: foldName(english),
      label: french,
    }))
    .sort((a, b) => b.french.length - a.french.length || b.english.length - a.english.length)

  for (const candidate of candidates) {
    if (candidate.french.length < 3 && candidate.english.length < 3) continue
    let matched = ''
    if (candidate.french.length >= 3 && hasWord(folded, candidate.french)) matched = candidate.french
    else if (candidate.english.length >= 3 && hasWord(folded, candidate.english)) matched = candidate.english
    if (!matched) continue
    const key = candidate.english.replace(/ /g, '')
    if (seen.has(key)) continue
    // Évite Mew si Mewtwo est déjà trouvé.
    const blocked = [...seen].some((id) => id.includes(key) || key.includes(id))
    if (blocked && matched.length <= 4) continue
    seen.add(key)
    hits.push({ species: candidate.english, label: matched })
  }

  return hits
}

function speciesMatchesTarget(species: NameHit, target: ScanTarget): boolean {
  const hitEnglish = foldName(species.species).replace(/ /g, '')
  const hitFrench = foldName(species.label).replace(/ /g, '')
  const fromMain = mainSpecies(target.name)
  if (fromMain && foldName(fromMain).replace(/ /g, '') === hitEnglish) return true

  const targetKey = speciesKey(target.name).replace(/ /g, '')
  if (targetKey && (targetKey === hitEnglish || targetKey === hitFrench)) return true

  // Carte en français (Dracaufeu) ↔ espèce anglaise (charizard)
  for (const [french, english] of Object.entries(FRENCH_NAMES)) {
    const frenchKey = foldName(french).replace(/ /g, '')
    const englishKey = foldName(english).replace(/ /g, '')
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
  if (/^[A-Z]{2,}\d+$/i.test(target.number)) score += 6
  if (/gallery|illustration|special art|trainer gallery/i.test(target.rarity + target.setLabel)) {
    score += 5
  }
  if (target.language === 'fr' && /\bfr\b|francais|français/.test(folded)) score += 4
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

export function scoreMatches(
  targets: ScanTarget[],
  numberHits: NumberHit[],
  speciesHits: NameHit[],
  ocrText: string,
): ScanMatch[] {
  const byNumber = new Map<string, ScanTarget[]>()
  for (const target of targets) {
    for (const key of numberLookupKeys(target.number)) {
      const list = byNumber.get(key) ?? []
      list.push(target)
      byNumber.set(key, list)
    }
  }

  const best = new Map<string, ScanMatch>()

  function keep(match: ScanMatch) {
    const current = best.get(match.target.id)
    if (!current || match.score > current.score) best.set(match.target.id, match)
  }

  for (const hit of numberHits) {
    let candidates = targetsForNumber(byNumber, hit.number)
    if (candidates.length === 0) continue

    if (hit.total) {
      const withTotal = candidates.filter((target) => String(target.printedTotal) === hit.total)
      if (withTotal.length > 0) candidates = withTotal
    }

    const named = speciesHits.length
      ? candidates.filter((target) => speciesHits.some((species) => speciesMatchesTarget(species, target)))
      : []

    // Sans nom, un numéro seul sur tout le catalogue est trop ambigu.
    if (named.length > 0) {
      candidates = named
    } else if (/^[A-Z]{2,}\d+$/.test(hit.number) && candidates.length <= 8) {
      // Codes GG/TG assez uniques.
    } else if (hit.total && candidates.length <= 6) {
      // Numéro + total connus : assez fiable même sans nom.
    } else if (candidates.length > 3) {
      const collectionOnly = candidates.filter((target) => target.collectionCard)
      if (collectionOnly.length > 0 && collectionOnly.length <= 4) candidates = collectionOnly
      else if (!hit.trusted || !hit.total || candidates.length > 8) continue
    }

    for (const target of candidates) {
      const nameHit = speciesHits.find((species) => speciesMatchesTarget(species, target))
      const base = hit.trusted ? 78 : 55
      const nameBoost = nameHit ? 35 : 0
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

  // Nom seul : utile si le numéro GG est illisible mais le Pokémon est clair.
  // Priorité aux cartes galerie / illustration (souvent la photo importée),
  // pas aux communes de la collection locale.
  if (numberHits.length === 0 && speciesHits.length > 0) {
    for (const species of speciesHits) {
      const named = targets.filter((target) => speciesMatchesTarget(species, target))
      const galleryNamed = named.filter(
        (target) =>
          /^[A-Z]{2,}\d+$/i.test(target.number) ||
          /gallery|illustration|special|art rare/i.test(`${target.rarity} ${target.setLabel}`),
      )
      const collectionNamed = named.filter((target) => target.collectionCard)
      let pool: ScanTarget[]
      if (galleryNamed.length > 0 && galleryNamed.length <= 12) pool = galleryNamed
      else if (collectionNamed.length > 0 && collectionNamed.length <= 6) pool = collectionNamed
      else if (named.length <= 8) pool = named
      else pool = named.slice(0, 8)
      if (pool.length === 0) continue
      for (const target of pool) {
        const galleryBonus = /^[A-Z]{2,}\d+$/i.test(target.number) ? 8 : 0
        keep({
          target,
          number: target.number,
          score: 72 + galleryBonus + setHintBoost(ocrText, target) - Math.min(8, pool.length),
          why: `Nom lu : ${species.label}`,
        })
      }
    }
  }

  return [...best.values()].filter((match) => match.score >= 78)
}

function englishSpeciesKey(name: string): string {
  const fromMain = mainSpecies(name)
  if (fromMain) return foldName(fromMain).replace(/ /g, '')
  const key = speciesKey(name).replace(/ /g, '')
  for (const [french, english] of Object.entries(FRENCH_NAMES)) {
    const frenchKey = foldName(french).replace(/ /g, '')
    if (key === frenchKey || key.startsWith(frenchKey)) return foldName(english).replace(/ /g, '')
  }
  return key
}

function speciesDedupeKey(target: ScanTarget): string {
  return `${target.number}:${englishSpeciesKey(target.name) || foldName(target.name).replace(/ /g, '')}`
}

function finalizeMatches(matches: ScanMatch[]): ScanMatch[] {
  const sorted = matches.sort(
    (a, b) =>
      b.score - a.score ||
      (a.target.collectionCard ? 0 : 1) - (b.target.collectionCard ? 0 : 1) ||
      Number(a.number) - Number(b.number),
  )

  // Une seule entrée par numéro + Pokémon (collection d’abord grâce au tri).
  const unique: ScanMatch[] = []
  const seen = new Set<string>()
  for (const match of sorted) {
    const key = speciesDedupeKey(match.target)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(match)
  }

  // Si on a déjà un duo numéro + nom très sûr, on cache les numéros seuls plus faibles.
  const strongNamed = unique.filter((match) => match.score >= 110 && /Nom lu/i.test(match.why))
  if (strongNamed.length > 0) {
    return unique.filter(
      (match) => match.score >= 110 || /Nom lu/i.test(match.why) || match.score >= strongNamed[0].score - 15,
    )
  }

  return unique
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
  targets: ScanTarget[],
): Promise<ScanResult> {
  // Passer le Blob brut : createImageBitmap lit l’EXIF (import galerie).
  const image = await loadImage(source)
  const previewUrl = image.src
  const condition = guessCondition(image)
  const printedTotals = new Set(
    targets.map((target) => String(target.printedTotal)).filter((value) => value && value !== '0'),
  )
  const worker = await getWorker()
  // Recadre d’abord la carte (sinon photo loin = OCR sur le fond blanc).
  const card = extractCardCanvas(image)

  const regions = [
    cropRegion(card, 'top', 'contrast'),
    cropRegion(card, 'top', 'binarize'),
    cropRegion(card, 'numberCorner', 'contrast'),
    cropRegion(card, 'numberCorner', 'binarize'),
    cropRegion(card, 'numberCorner', 'binarize-invert'),
    cropRegion(card, 'bottom', 'contrast'),
    cropRegion(card, 'bottom', 'binarize'),
  ]
  const texts: string[] = []
  for (const region of regions) {
    const { data } = await worker.recognize(region, undefined, { text: true })
    if (data.text?.trim()) texts.push(data.text)
  }

  let ocrText = texts.join('\n')
  let numberHits = extractNumberHits(ocrText, printedTotals)
  let speciesHits = findSpeciesInText(ocrText)

  // Relance large si numéro manquant (souvent le cas à l’import galerie).
  if (numberHits.length === 0) {
    const fallbacks = [cropRegion(card, 'full', 'contrast'), cropRegion(card, 'bottom', 'binarize-invert')]
    for (const fallback of fallbacks) {
      const { data } = await worker.recognize(fallback, undefined, { text: true })
      if (data.text?.trim()) {
        ocrText = `${ocrText}\n${data.text}`
      }
    }
    numberHits = extractNumberHits(ocrText, printedTotals)
    speciesHits = findSpeciesInText(ocrText)
  }

  const matches = finalizeMatches(scoreMatches(targets, numberHits, speciesHits, ocrText))

  return {
    numbers: numberHits.map((hit) => hit.number),
    matches: matches.slice(0, 8),
    condition,
    previewUrl,
    ocrText,
  }
}

export function conditionLabel(id: LooseConditionId): string {
  return LOOSE_CONDITIONS.find((row) => row.id === id)?.label ?? id
}
