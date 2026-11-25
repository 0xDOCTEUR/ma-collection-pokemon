import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  fetchCardmarketLive,
  formatCardmarketPrice,
  formatEuro,
  formatPrice,
} from '../api/pokemon'
import type {
  CardmarketLiveStats,
  CardStatus,
  CardVariant,
  PokemonCard,
  PriceRangeDays,
} from '../types'
import { buildTrendPoints, recordPriceSnapshot } from '../utils/priceHistory'
import { PriceTrendChart } from './PriceTrendChart'
import { AdvicePrices } from './AdvicePrices'
import { PotentialStamp } from './PotentialStamp'
import type { CardPotential } from '../utils/psaHunt'
import {
  MIN_POPULATION_SAMPLE,
  formatCensusDate,
  formatCount,
  formatGemRate,
  isFrenchPrinting,
  primaryPrinting,
  printingLabel,
  type PsaPrinting,
} from '../utils/population'

interface Props {
  card: PokemonCard
  onClose: () => void
  population: PsaPrinting[] | null
  rank: number | null
  comparableCount: number
  sourceUrl: string | null
  sourceName: string
  censusDate: string | null
  frenchSourceUrl?: string | null
  frenchSourceName?: string | null
  frenchCensusDate?: string | null
  potential?: CardPotential | null
  /** État confirmé après un scan, pour le prix conseillé sans note. */
  scannedCondition?: string | null
  normalStatus?: CardStatus
  reverseStatus?: CardStatus
  onSetStatus?: (variant: CardVariant, status: CardStatus) => void
  listActions?: ReactNode
}

export function CardDetailSheet({
  card,
  onClose,
  population,
  rank,
  comparableCount,
  sourceUrl,
  sourceName,
  censusDate,
  frenchSourceUrl = null,
  frenchSourceName = null,
  frenchCensusDate = null,
  potential = null,
  scannedCondition = null,
  normalStatus = 'missing',
  reverseStatus = 'missing',
  onSetStatus,
  listActions = null,
}: Props) {
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
            onError={(e) => {
              const img = e.currentTarget
              if (card.imageFallback && img.dataset.fallbackTried !== '1') {
                img.dataset.fallbackTried = '1'
                img.src = card.imageFallback
              }
            }}
          />

          <div className="card-sheet-main">
            {onSetStatus && (
              <div className="sheet-collection-bar">
                <div>
                  <span className="stat-label">Ma collection</span>
                  <strong className="sheet-collection-state">
                    {normalStatus === 'owned' || (card.hasReverse && reverseStatus === 'owned')
                      ? 'Dans ta collection'
                      : 'Manquante'}
                  </strong>
                </div>
                <div className="sheet-collection-actions">
                  <button
                    type="button"
                    className={normalStatus === 'owned' ? 'chip active-owned' : 'chip'}
                    onClick={() =>
                      onSetStatus('normal', normalStatus === 'owned' ? 'missing' : 'owned')
                    }
                  >
                    {normalStatus === 'owned' ? '✓ J’ai' : '+ J’ai'}
                  </button>
                  {card.hasReverse && (
                    <button
                      type="button"
                      className={reverseStatus === 'owned' ? 'chip active-owned' : 'chip'}
                      onClick={() =>
                        onSetStatus('reverse', reverseStatus === 'owned' ? 'missing' : 'owned')
                      }
                    >
                      {reverseStatus === 'owned' ? '✓ J’ai reverse' : '+ Reverse'}
                    </button>
                  )}
                  {listActions}
                </div>
              </div>
            )}

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

            <AdvicePrices card={card} stats={stats} highlightedCondition={scannedCondition} />

            <PopulationBlock
              printings={population}
              rank={rank}
              comparableCount={comparableCount}
              sourceUrl={sourceUrl}
              sourceName={sourceName}
              censusDate={censusDate}
              frenchSourceUrl={frenchSourceUrl}
              frenchSourceName={frenchSourceName}
              frenchCensusDate={frenchCensusDate}
              potential={potential}
            />

            <PriceTrendChart points={points} range={range} onRangeChange={setRange} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function PopulationBlock({
  printings,
  rank,
  comparableCount,
  sourceUrl,
  sourceName,
  censusDate,
  frenchSourceUrl,
  frenchSourceName,
  frenchCensusDate,
  potential,
}: {
  printings: PsaPrinting[] | null
  rank: number | null
  comparableCount: number
  sourceUrl: string | null
  sourceName: string
  censusDate: string | null
  frenchSourceUrl: string | null
  frenchSourceName: string | null
  frenchCensusDate: string | null
  potential: CardPotential | null
}) {
  if (printings == null) return null

  const primary = primaryPrinting(printings)
  const rows = [...printings].sort((a, b) => a.psa10 - b.psa10 || a.total - b.total)
  const hasFrench = rows.some((row) => isFrenchPrinting(row.label))
  const censusLabel = formatCensusDate(censusDate)
  const frenchCensusLabel = formatCensusDate(frenchCensusDate)

  return (
    <section className="pop-block">
      <div className="pop-block-head">
        <h3>Population PSA</h3>
        <p className="muted">
          Nombre d’exemplaires déjà notés par PSA. La note 10 est la note parfaite. Moins il y en a,
          plus cette version est rare parmi les cartes notées.
        </p>
        {potential && (
          <p className="pop-note">
            <PotentialStamp potential={potential} inline /> {potential.reason}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="pop-note">Pas encore de chiffre PSA pour cette carte.</p>
      ) : (
        <table className="pop-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Cartes notées</th>
              <th>Notes 10</th>
              <th>Part de 10</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const compared = primary != null && row.label === primary.label && row.total === primary.total
              return (
                <tr key={`${row.label}-${row.total}`} className={compared ? 'is-compared' : undefined}>
                  <td>
                    {printingLabel(row.label)}
                    {compared && rows.length > 1 ? <small> comparée</small> : null}
                  </td>
                  <td>{formatCount(row.total)}</td>
                  <td>{formatCount(row.psa10)}</td>
                  <td>{formatGemRate(row)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {primary && primary.total >= MIN_POPULATION_SAMPLE && rank != null && (
        <p className="pop-note">
          Classement dans la série : <strong>{rank === 1 ? '1re' : `${rank}e`}</strong> plus rare
          sur {comparableCount} cartes, pour la version {printingLabel(primary.label).toLowerCase()}{' '}
          ({formatCount(primary.psa10)} notes 10). La 1re est celle qui a le moins de notes 10.
        </p>
      )}
      {primary && primary.total < MIN_POPULATION_SAMPLE && (
        <p className="pop-note">
          Moins de {MIN_POPULATION_SAMPLE} cartes notées pour la version{' '}
          {printingLabel(primary.label).toLowerCase()}. On ne la classe pas : un petit chiffre veut
          surtout dire que presque personne ne l’envoie chez PSA.
        </p>
      )}

      <p className="pop-note">
        {hasFrench
          ? 'Les lignes « Français » comptent les cartes françaises. Les autres lignes comptent les cartes anglaises. Ce n’est pas la même quantité imprimée. '
          : 'Ces chiffres comptent les cartes anglaises. Le numéro est le même en français, pas la quantité imprimée. '}
        Source anglaise : {sourceName}
        {censusLabel ? `, recensement du ${censusLabel}` : ''}
        {sourceUrl && (
          <>
            .{' '}
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              Voir la source anglaise
            </a>
          </>
        )}
        {hasFrench && frenchSourceName && (
          <>
            . Source française : {frenchSourceName}
            {frenchCensusLabel ? `, recensement du ${frenchCensusLabel}` : ''}
            {frenchSourceUrl && (
              <>
                .{' '}
                <a href={frenchSourceUrl} target="_blank" rel="noreferrer">
                  Voir la source française
                </a>
              </>
            )}
          </>
        )}
        .
      </p>
    </section>
  )
}
