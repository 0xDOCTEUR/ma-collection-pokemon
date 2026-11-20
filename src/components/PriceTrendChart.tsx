import { formatEuro } from '../api/pokemon'
import type { PriceHistoryPoint, PriceRangeDays } from '../types'

interface Props {
  points: PriceHistoryPoint[]
  range: PriceRangeDays
  onRangeChange: (range: PriceRangeDays) => void
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  )
}

export function PriceTrendChart({ points, range, onRangeChange }: Props) {
  const width = 420
  const height = 180
  const pad = { top: 16, right: 16, bottom: 28, left: 48 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const values = points.map((p) => p.value)
  const minV = values.length ? Math.min(...values) : 0
  const maxV = values.length ? Math.max(...values) : 1
  const span = Math.max(maxV - minV, maxV * 0.04, 1)
  const yMin = Math.max(0, minV - span * 0.12)
  const yMax = maxV + span * 0.12

  const xAt = (i: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const yAt = (v: number) => pad.top + ((yMax - v) / (yMax - yMin)) * innerH

  const line =
    points.length > 1
      ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.value)}`).join(' ')
      : ''

  const area =
    points.length > 1
      ? `${line} L ${xAt(points.length - 1)} ${pad.top + innerH} L ${xAt(0)} ${pad.top + innerH} Z`
      : ''

  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  const hasApprox = points.some((p) => !p.recorded)

  return (
    <div className="price-chart">
      <div className="price-chart-head">
        <h3>Cote Cardmarket</h3>
        <div className="price-chart-range" role="group" aria-label="Période">
          <button
            type="button"
            className={range === 30 ? 'chip active-owned' : 'chip'}
            onClick={() => onRangeChange(30)}
          >
            30 jours
          </button>
          <button
            type="button"
            className={range === 90 ? 'chip active-owned' : 'chip'}
            onClick={() => onRangeChange(90)}
          >
            90 jours
          </button>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="muted price-chart-empty">Pas encore de moyenne Cardmarket pour cette carte.</p>
      ) : (
        <>
          <svg
            className="price-chart-svg"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Courbe de cote sur ${range} jours`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  className="price-chart-grid"
                />
                <text x={pad.left - 8} y={yAt(t) + 4} textAnchor="end" className="price-chart-label">
                  {Math.round(t)}
                </text>
              </g>
            ))}

            {area && <path d={area} className="price-chart-area" />}
            {line && (
              <path
                d={line}
                className={hasApprox ? 'price-chart-line approx' : 'price-chart-line'}
                fill="none"
              />
            )}

            {points.map((p, i) => (
              <g key={`${p.date}-${i}`}>
                <circle
                  cx={xAt(i)}
                  cy={yAt(p.value)}
                  r={4}
                  className={p.recorded ? 'price-chart-dot' : 'price-chart-dot approx'}
                />
                {(i === 0 || i === points.length - 1) && (
                  <text
                    x={xAt(i)}
                    y={height - 8}
                    textAnchor={i === 0 ? 'start' : 'end'}
                    className="price-chart-label"
                  >
                    {formatShortDate(p.date)}
                  </text>
                )}
              </g>
            ))}
          </svg>

          <div className="price-chart-legend">
            <span>
              Dernier point : <strong>{formatEuro(points[points.length - 1]?.value)}</strong>
            </span>
            {hasApprox && (
              <span className="muted">
                Courbe basée sur les moyennes 1 / 7 / 30 jours (pas chaque vente jour par jour).
              </span>
            )}
            {range === 90 && points.length < 4 && (
              <span className="muted">
                Sur 90 jours, la courbe s’enrichit au fur et à mesure que tu rouvres les fiches.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
