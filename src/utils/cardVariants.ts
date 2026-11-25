import type { PokemonCard } from '../types'
import { isFrenchPrinting, type PsaPrinting } from './population'
import { huntPrintingLabel } from './psaHunt'

/** Codes Limitless TCG (images reverse) pour quelques séries courantes. */
const LIMITLESS_SET_CODE: Record<string, string> = {
  'sv03.5': 'MEW',
  sv3pt5: 'MEW',
  sv03: 'OBF',
  sv3: 'OBF',
  sv02: 'PAL',
  sv2: 'PAL',
  sv01: 'SVI',
  sv1: 'SVI',
  'sv04.5': 'PAF',
  sv4pt5: 'PAF',
  sv04: 'PAR',
  sv4: 'PAR',
  sv05: 'TEF',
  sv5: 'TEF',
  sv06: 'TWM',
  sv6: 'TWM',
  'sv06.5': 'SFA',
  sv6pt5: 'SFA',
  sv07: 'SCR',
  sv7: 'SCR',
  sv08: 'SSP',
  sv8: 'SSP',
  'sv08.5': 'PRE',
  sv8pt5: 'PRE',
  sv09: 'JTG',
  sv9: 'JTG',
  sv10: 'DRI',
}

/** Série japonaise liée (ex. Master Ball de 151). */
const JP_MASTER_ASSET: Record<string, { base: string; pad3?: boolean }> = {
  'sv03.5': { base: 'https://assets.tcgdex.net/ja/SV/SV2a', pad3: true },
  sv3pt5: { base: 'https://assets.tcgdex.net/ja/SV/SV2a', pad3: true },
}

export type VisualVariantKind = 'normal' | 'reverse' | 'masterball' | 'pokeball' | 'other'

export interface VisualVariant {
  id: string
  kind: VisualVariantKind
  label: string
  imageUrl: string
  fallbackUrl?: string
  /** Pour brancher « J’ai » normale / reverse. */
  ownership?: 'normal' | 'reverse'
  psa: PsaPrinting | null
  note?: string
}

function padNum(num: string, pad3 = true): string {
  const cleaned = num.trim()
  if (!/^\d+$/.test(cleaned)) return cleaned.toUpperCase()
  return pad3 ? cleaned.padStart(3, '0') : cleaned
}

function limitlessReverseUrl(setId: string, number: string): string | null {
  const code = LIMITLESS_SET_CODE[setId]
  if (!code) return null
  const n = padNum(number, true)
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${code}/${code}_${n}_R_EN.png`
}

function jpMasterUrl(setId: string, number: string): string | null {
  const meta = JP_MASTER_ASSET[setId]
  if (!meta) return null
  const n = padNum(number, meta.pad3 !== false)
  return `${meta.base}/${n}/high.webp`
}

function kindFromLabel(label: string): VisualVariantKind {
  const lower = label.toLowerCase()
  if (!label || lower === 'normal') return 'normal'
  if (lower.includes('master')) return 'masterball'
  if (lower.includes('poke ball') || lower.includes('poké ball')) return 'pokeball'
  if (lower.includes('reverse')) return 'reverse'
  return 'other'
}

function findPsa(
  printings: PsaPrinting[] | null,
  matcher: (label: string) => boolean,
): PsaPrinting | null {
  if (!printings) return null
  return printings.find((row) => !isFrenchPrinting(row.label) && matcher(row.label)) ?? null
}

/**
 * Variantes à montrer dans la fiche : normale, reverse, Master Ball, etc.
 * Les images reverse viennent de Limitless quand le set est connu.
 */
export function buildVisualVariants(
  card: PokemonCard,
  printings: PsaPrinting[] | null,
): VisualVariant[] {
  const baseImage = card.imageLarge || card.imageSmall
  const fallback = card.imageFallback || card.imageSmall
  const reverseImage = limitlessReverseUrl(card.setId, card.number) || baseImage
  const masterImage = jpMasterUrl(card.setId, card.number) || reverseImage

  const normalPsa = findPsa(printings, (label) => !label || label === 'Normal')
  const reversePsa = findPsa(
    printings,
    (label) => /reverse/i.test(label) && !/master|poke/i.test(label),
  )
  const masterPsa = findPsa(printings, (label) => /master/i.test(label))
  const pokePsa = findPsa(printings, (label) => /poke ball|poké ball/i.test(label))

  const variants: VisualVariant[] = [
    {
      id: 'normal',
      kind: 'normal',
      label: 'Normale',
      imageUrl: baseImage,
      fallbackUrl: fallback,
      ownership: 'normal',
      psa: normalPsa,
    },
  ]

  if (card.hasReverse || reversePsa) {
    variants.push({
      id: 'reverse',
      kind: 'reverse',
      label: 'Reverse',
      imageUrl: reverseImage,
      fallbackUrl: baseImage,
      ownership: 'reverse',
      psa: reversePsa,
      note:
        reverseImage === baseImage
          ? 'Image reverse indisponible : aperçu de la version normale.'
          : undefined,
    })
  }

  if (masterPsa) {
    variants.push({
      id: 'masterball',
      kind: 'masterball',
      label: 'Master Ball',
      imageUrl: masterImage,
      fallbackUrl: reverseImage,
      psa: masterPsa,
      note: 'Motif Master Ball (aperçu japonais quand disponible).',
    })
  }

  if (pokePsa) {
    variants.push({
      id: 'pokeball',
      kind: 'pokeball',
      label: 'Poké Ball',
      imageUrl: reverseImage,
      fallbackUrl: baseImage,
      psa: pokePsa,
      note: 'Motif Poké Ball : aperçu reverse si l’image dédiée manque.',
    })
  }

  if (printings) {
    for (const row of printings) {
      if (isFrenchPrinting(row.label)) continue
      const kind = kindFromLabel(row.label)
      if (kind === 'normal' || kind === 'reverse' || kind === 'masterball' || kind === 'pokeball') {
        continue
      }
      if (!row.label) continue
      const id = `other:${row.label}`
      if (variants.some((v) => v.id === id)) continue
      variants.push({
        id,
        kind: 'other',
        label: huntPrintingLabel(row.label),
        imageUrl: baseImage,
        fallbackUrl: fallback,
        psa: row,
        note: 'Pas d’image dédiée pour cette version.',
      })
    }
  }

  return variants
}
