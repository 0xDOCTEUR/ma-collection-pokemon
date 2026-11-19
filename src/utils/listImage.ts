export interface ListImageRow {
  number: string
  name: string
  variantLabel: string
  rarity: string
  tcgPrice: string
  cardmarketPrice: string
  imageUrl: string
}

export interface ListImageOptions {
  title: string
  setName: string
  rows: ListImageRow[]
  tcgTotal: string
  cardmarketTotal: string
  filename: string
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h, 6)
  ctx.fillStyle = '#070a0f'
  ctx.fill()
}

function drawRightLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  xRight: number,
  y: number,
  labelColor: string,
  valueColor: string,
) {
  ctx.textAlign = 'right'
  ctx.fillStyle = valueColor
  ctx.font = '700 16px Syne, system-ui, sans-serif'
  ctx.fillText(value, xRight, y)
  const valueWidth = ctx.measureText(value).width
  ctx.fillStyle = labelColor
  ctx.font = '600 11px "DM Sans", system-ui, sans-serif'
  ctx.fillText(label, xRight - valueWidth - 8, y)
  ctx.textAlign = 'left'
}

export async function downloadListImage(options: ListImageOptions): Promise<void> {
  const { title, setName, rows, tcgTotal, cardmarketTotal, filename } = options
  if (rows.length === 0) return

  await document.fonts.ready

  const width = 820
  const pad = 28
  const thumbW = 52
  const thumbH = 72
  const rowH = 92
  const headerH = 118
  const footerH = 96
  const height = headerH + rows.length * rowH + footerH

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.scale(scale, scale)

  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#101820')
  bg.addColorStop(1, '#0a0e14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(230, 57, 70, 0.18)'
  ctx.beginPath()
  ctx.arc(width - 40, -20, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(240, 194, 75, 0.08)'
  ctx.beginPath()
  ctx.arc(40, height + 20, 140, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#9aa6b5'
  ctx.font = '500 13px "DM Sans", system-ui, sans-serif'
  ctx.fillText('Liste de cartes · comparaison des cotes', pad, 36)

  ctx.fillStyle = '#f4f1ec'
  ctx.font = '800 28px Syne, system-ui, sans-serif'
  ctx.fillText(title, pad, 70)

  ctx.fillStyle = '#9aa6b5'
  ctx.font = '400 14px "DM Sans", system-ui, sans-serif'
  ctx.fillText(
    `${setName} · ${rows.length} carte${rows.length > 1 ? 's' : ''}`,
    pad,
    96,
  )

  const images = await Promise.all(rows.map((row) => loadImage(row.imageUrl)))
  const priceCol = width - pad

  rows.forEach((row, index) => {
    const y = headerH + index * rowH
    const contentY = y + 8

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(width - pad, y)
    ctx.stroke()

    const img = images[index]
    const imgX = pad
    const imgY = contentY
    if (img) {
      ctx.save()
      roundRect(ctx, imgX, imgY, thumbW, thumbH, 6)
      ctx.clip()
      ctx.drawImage(img, imgX, imgY, thumbW, thumbH)
      ctx.restore()
    } else {
      drawPlaceholder(ctx, imgX, imgY, thumbW, thumbH)
    }

    const textX = pad + thumbW + 14
    ctx.fillStyle = '#f4f1ec'
    ctx.font = '700 16px "DM Sans", system-ui, sans-serif'
    ctx.fillText(`${row.number} — ${row.name}`, textX, contentY + 28)

    ctx.fillStyle = '#9aa6b5'
    ctx.font = '400 13px "DM Sans", system-ui, sans-serif'
    ctx.fillText(`${row.variantLabel} · ${row.rarity}`, textX, contentY + 52)

    drawRightLabel(ctx, 'TCG', row.tcgPrice, priceCol, contentY + 30, '#9aa6b5', '#f0c24b')
    drawRightLabel(ctx, 'CM', row.cardmarketPrice, priceCol, contentY + 54, '#9aa6b5', '#4ea8de')
  })

  const footerY = headerH + rows.length * rowH
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.moveTo(pad, footerY)
  ctx.lineTo(width - pad, footerY)
  ctx.stroke()

  ctx.fillStyle = '#f4f1ec'
  ctx.font = '700 20px Syne, system-ui, sans-serif'
  ctx.fillText('Totaux', pad, footerY + 42)

  drawRightLabel(ctx, 'TCG', tcgTotal, priceCol, footerY + 34, '#9aa6b5', '#f0c24b')
  drawRightLabel(ctx, 'CM', cardmarketTotal, priceCol, footerY + 64, '#9aa6b5', '#4ea8de')

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), 'image/png'),
  )
  if (!blob) throw new Error('Impossible de créer l’image')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`
  a.click()
  URL.revokeObjectURL(url)
}
