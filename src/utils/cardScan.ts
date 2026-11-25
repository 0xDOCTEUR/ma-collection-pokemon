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

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de lire la photo.'))
    image.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })
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

type CropKind = 'bottom' | 'top' | 'numberCorner'

function cropRegion(image: HTMLImageElement, kind: CropKind, invert = false): HTMLCanvasElement {
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
    sy = sourceH * 0.7
    sh = sourceH * 0.3
  } else if (kind === 'top') {
    sh = sourceH * 0.24
  } else {
    // Coin bas droit : numéro + total imprimés
    sx = sourceW * 0.42
    sy = sourceH * 0.76
    sw = sourceW * 0.58
    sh = sourceH * 0.24
  }

  const outW = Math.min(1200, Math.round(sw * 1.6))
  const outH = Math.max(72, Math.round((outW * sh) / sw))
  canvas.width = outW
  canvas.height = outH
  context.fillStyle = '#fff'
  context.fillRect(0, 0, outW, outH)
  context.imageSmoothingEnabled = true
  context.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)
  binarize(context, outW, outH, invert)
  return canvas
}

interface NumberHit {
  number: string
  total: string | null
  trusted: boolean
}

function cleanOcrNumber(raw: string): string {
  return raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[^\dA-Za-z]/g, '')
}

export function extractNumberHits(text: string, printedTotals: Set<string>): NumberHit[] {
  const hits: NumberHit[] = []
  const seen = new Set<string>()

  function push(numberRaw: string, totalRaw: string | null, trusted: boolean) {
    const number = cleanOcrNumber(numberRaw)
    if (!number) return
    const total = totalRaw ? cleanOcrNumber(totalRaw).replace(/\D/g, '') : null
    if (!/^\d{1,3}$|^[A-Za-z]+\d{0,3}$|^\d+[A-Za-z]+$/.test(number) && !/^\d{1,3}$/.test(number)) {
      // Garde les numéros simples et quelques codes (TG01, B…).
      if (!/^[A-Za-z]$/.test(number) && !/^[A-Za-z]{1,3}\d{1,3}$/i.test(number)) return
    }
    const normalized = /^\d+$/.test(number) ? String(Number.parseInt(number, 10)) : number.toUpperCase()
    if (seen.has(normalized)) return
    // Ignore les totaux pris pour des numéros (ex. 165 lu seul).
    if (!total && printedTotals.has(normalized)) return
    if (/^\d+$/.test(normalized)) {
      const value = Number(normalized)
      if (value < 1 || value > 500) return
    }
    seen.add(normalized)
    hits.push({
      number: normalized,
      total: total && /^\d+$/.test(total) ? String(Number.parseInt(total, 10)) : null,
      trusted,
    })
  }

  // Formats usuels : 199/165, 004 / 165, 25 | 165
  for (const match of text.matchAll(/([A-Za-z]?\d{1,3})\s*[/|Il\\]\s*(\d{2,3})/gi)) {
    const total = String(Number.parseInt(cleanOcrNumber(match[2]).replace(/\D/g, ''), 10))
    push(match[1], total, printedTotals.has(total) || Number(total) >= 60)
  }

  // « No. 150 », « N°150 »
  for (const match of text.matchAll(/(?:n[o°.]|no\.?|n°)\s*([A-Za-z]?\d{1,3})\b/gi)) {
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
  if (target.collectionCard) score += 8
  if (target.language === 'fr' && /\bfr\b|francais|français/.test(folded)) score += 4
  return score
}

export function scoreMatches(
  targets: ScanTarget[],
  numberHits: NumberHit[],
  speciesHits: NameHit[],
  ocrText: string,
): ScanMatch[] {
  const byNumber = new Map<string, ScanTarget[]>()
  for (const target of targets) {
    const list = byNumber.get(target.number) ?? []
    list.push(target)
    byNumber.set(target.number, list)
  }

  const best = new Map<string, ScanMatch>()

  function keep(match: ScanMatch) {
    const current = best.get(match.target.id)
    if (!current || match.score > current.score) best.set(match.target.id, match)
  }

  for (const hit of numberHits) {
    let candidates = byNumber.get(hit.number) ?? []
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
      const score = base + nameBoost + totalBoost + setHintBoost(ocrText, target)
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

  // Nom seul : seulement si peu de cartes portent ce Pokémon dans la collection,
  // ou une seule carte dans les séries suivies.
  if (numberHits.length === 0 && speciesHits.length > 0) {
    for (const species of speciesHits) {
      const named = targets.filter((target) => speciesMatchesTarget(species, target))
      const collectionNamed = named.filter((target) => target.collectionCard)
      const pool = collectionNamed.length > 0 && collectionNamed.length <= 6 ? collectionNamed : named
      if (pool.length === 0 || pool.length > 8) continue
      for (const target of pool) {
        keep({
          target,
          number: target.number,
          score: 72 + setHintBoost(ocrText, target) - Math.min(10, pool.length),
          why: `Nom lu : ${species.label}`,
        })
      }
    }
  }

  return [...best.values()].filter((match) => match.score >= 80)
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
  const previewUrl = typeof source === 'string' ? source : URL.createObjectURL(source)
  const image = await loadImage(previewUrl)
  const condition = guessCondition(image)
  const printedTotals = new Set(
    targets.map((target) => String(target.printedTotal)).filter((value) => value && value !== '0'),
  )
  const worker = await getWorker()

  const regions = [
    cropRegion(image, 'top'),
    cropRegion(image, 'numberCorner'),
    cropRegion(image, 'numberCorner', true),
    cropRegion(image, 'bottom'),
  ]
  const texts: string[] = []
  for (const region of regions) {
    const { data } = await worker.recognize(region, undefined, { text: true })
    if (data.text?.trim()) texts.push(data.text)
  }
  const ocrText = texts.join('\n')
  const numberHits = extractNumberHits(ocrText, printedTotals)
  const speciesHits = findSpeciesInText(ocrText)
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
