import { useEffect, useId, useState } from 'react'
import {
  fetchCardmarketLive,
  formatCardmarketPrice,
  formatEuro,
  formatPrice,
} from '../api/pokemon'
import type { CardmarketLiveStats, PokemonCard, PriceRangeDays } from '../types'
import { buildTrendPoints, recordPriceSnapshot } from '../utils/priceHistory'
import { PriceTrendChart } from './PriceTrendChart'

interface Props {
  card: PokemonCard
  onClose: () => void
}

export function CardDetailSheet({ card, onClose }: Props) {
  const titleId = useId()
  const [range, setRange] = useState<PriceRangeDays>(30)
  const [stats, setStats] = useState<CardmarketLiveStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const historyKey = card.tcgdexId || card.id

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!card.tcgdexId) {
        setLoading(false)
        setError('Identifiant Cardmarket manquant pour cette carte.')
        return
      }
      try {
        setLoading(true)
        setError(null)
        const live = await fetchCardmarketLive(card.tcgdexId)
        if (cancelled) return
        if (!live) {
          setError('Impossible de charger les moyennes Cardmarket.')
          setStats(null)
          return
        }
        recordPriceSnapshot(historyKey, live)
        setStats(live)
      } catch {
        if (!cancelled) setError('Erreur réseau en chargeant Cardmarket.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [card.tcgdexId, historyKey])

  const points = buildTrendPoints(historyKey, stats, range)

  return (
    <div className="card-sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="card-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="card-sheet-head">
          <div>
            <p className="card-sheet-num">
              {card.number}/{card.printedTotal}
            </p>
            <h2 id={titleId}>{card.name}</h2>
            <p className="muted">{card.rarity}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="card-sheet-body">
          <img
            className="card-sheet-art"
            src={card.imageLarge || card.imageSmall}
            alt={card.name}
            width={245}
            height={342}
          />

          <div className="card-sheet-main">
            <div className="card-sheet-prices">
              <div>
                <span className="stat-label">TCGPlayer</span>
                <strong>{formatPrice(card, 'normal')}</strong>
                {card.hasReverse && (
                  <small>Reverse {formatPrice(card, 'reverse')}</small>
                )}
              </div>
              <div>
                <span className="stat-label">Cardmarket</span>
                <strong>
                  {stats
                    ? formatEuro(stats.trend ?? stats.avg1 ?? stats.avg7)
                    : formatCardmarketPrice(card, 'normal')}
                </strong>
                {card.hasReverse && (
                  <small>Reverse {formatCardmarketPrice(card, 'reverse')}</small>
                )}
              </div>
            </div>

            {loading && <p className="state-msg">Chargement des moyennes…</p>}
            {error && <p className="state-msg error">{error}</p>}

            {!loading && stats && (
              <>
                <div className="card-sheet-avgs">
                  <div>
                    <span className="stat-label">Tendance</span>
                    <strong>{formatEuro(stats.trend)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Moy. 1 j</span>
                    <strong>{formatEuro(stats.avg1)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Moy. 7 j</span>
                    <strong>{formatEuro(stats.avg7)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Moy. 30 j</span>
                    <strong>{formatEuro(stats.avg30)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Plus bas</span>
                    <strong>{formatEuro(stats.low)}</strong>
                  </div>
                </div>
                {stats.updated && (
                  <p className="muted card-sheet-updated">
                    Mis à jour{' '}
                    {new Intl.DateTimeFormat('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(stats.updated))}
                  </p>
                )}
              </>
            )}

            <PriceTrendChart points={points} range={range} onRangeChange={setRange} />
          </div>
        </div>
      </aside>
    </div>
  )
}
