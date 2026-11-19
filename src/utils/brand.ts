/** Dessine le logo POKEDOC (pokéball + nom) sur un canvas. */
export function drawPokedocLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ballSize = 36,
) {
  const cx = x + ballSize / 2
  const cy = y + ballSize / 2
  const r = ballSize / 2
  const fontSize = Math.round(ballSize * 0.72)

  ctx.save()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#f4f1ec'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 0)
  ctx.fillStyle = '#e63946'
  ctx.fill()

  ctx.fillStyle = '#0c1118'
  ctx.fillRect(cx - r, cy - r * 0.09, r * 2, r * 0.18)

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#0c1118'
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2)
  ctx.fillStyle = '#0c1118'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = '#f4f1ec'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2)
  ctx.fillStyle = '#0c1118'
  ctx.fill()

  const textX = x + ballSize + ballSize * 0.28
  const textY = cy + ballSize * 0.18
  ctx.fillStyle = '#f4f1ec'
  ctx.font = `800 ${fontSize}px Syne, system-ui, sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('POKEDOC', textX, textY)
  const textWidth = ctx.measureText('POKEDOC').width

  ctx.restore()

  return {
    width: ballSize + ballSize * 0.28 + textWidth,
    height: ballSize,
  }
}
