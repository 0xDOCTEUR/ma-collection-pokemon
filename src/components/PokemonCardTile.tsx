import { formatPrice } from '../api/pokemon'
import type { CardStatus, CardVariant, PokemonCard } from '../types'
import {
  formatCount,
  hasEnoughGrades,
  primaryPrinting,
  printingLabel,
  type PsaPrinting,
} from '../utils/population'

const STATUS_LABEL: Record<CardStatus, string> = {
  owned: 'Possédée',
  missing: 'Manquante',
  wanted: 'Recherchée',
}

interface Props {
  card: PokemonCard
  normalStatus: CardStatus
  reverseStatus: CardStatus
  onSetStatus: (variant: CardVariant, status: CardStatus) => void
  onOpenDetail: () => void
  /** null = la série n’a pas de population. Tableau vide = cette carte n’en a pas. */
  population: PsaPrinting[] | null
}

function nextToggle(current: CardStatus, target: 'owned' | 'wanted'): CardStatus {
  return current === target ? 'missing' : target
}

function PopulationLine({ printings }: { printings: PsaPrinting[] | null }) {
  if (printings == null) return null
  const primary = primaryPrinting(printings)
  if (!primary) {
    return <p className="tile-pop is-thin">PSA : pas de chiffre</p>
  }
  const thin = !hasEnoughGrades(primary)
  const version = primary.label ? printingLabel(primary.label) : null
  return (
    <p className={thin ? 'tile-pop is-thin' : 'tile-pop'}>
      PSA 10 : {formatCount(primary.psa10)}
      {version ? <span> · {version}</span> : null}
      {thin ? <span> · peu notée</span> : null}
    </p>
  )
}

export function PokemonCardTile({
  card,
  normalStatus,
  reverseStatus,
  onSetStatus,
  onOpenDetail,
  population,
}: Props) {
  const overall: CardStatus =
    normalStatus === 'owned' || (card.hasReverse && reverseStatus === 'owned')
      ? 'owned'
      : normalStatus === 'wanted' || (card.hasReverse && reverseStatus === 'wanted')
        ? 'wanted'
        : 'missing'

  return (
    <article className={`tile status-${overall}`}>
      <button
        type="button"
        className="tile-media"
        onClick={onOpenDetail}
        title="Voir la cote, la population et le graphique"
      >
        <img src={card.imageSmall} alt={card.name} loading="lazy" width={245} height={342} />
        <span className="tile-badge">{STATUS_LABEL[overall]}</span>
        <span className="tile-detail-hint">Cote</span>
      </button>

      <div className="tile-body">
        <div className="tile-top">
          <span className="tile-num">
            {card.number}/{card.printedTotal}
          </span>
          <span className="tile-price">{formatPrice(card, 'normal')}</span>
        </div>
        <h3 className="tile-name">{card.name}</h3>
        <p className="tile-meta">{card.rarity}</p>
        <PopulationLine printings={population} />

        <div className="variant-block">
          <p className="variant-title">Normale · {formatPrice(card, 'normal')}</p>
          <div className="tile-actions">
            <button
              type="button"
              className={normalStatus === 'owned' ? 'chip active-owned' : 'chip'}
              onClick={() => onSetStatus('normal', nextToggle(normalStatus, 'owned'))}
            >
              J’ai
            </button>
            <button
              type="button"
              className={normalStatus === 'wanted' ? 'chip active-wanted' : 'chip'}
              onClick={() => onSetStatus('normal', nextToggle(normalStatus, 'wanted'))}
            >
              Je cherche
            </button>
          </div>
        </div>

        {card.hasReverse && (
          <div className="variant-block reverse">
            <p className="variant-title">
              Reverse · {formatPrice(card, 'reverse')}
            </p>
            <div className="tile-actions">
              <button
                type="button"
                className={reverseStatus === 'owned' ? 'chip active-owned' : 'chip'}
                onClick={() => onSetStatus('reverse', nextToggle(reverseStatus, 'owned'))}
              >
                J’ai reverse
              </button>
              <button
                type="button"
                className={reverseStatus === 'wanted' ? 'chip active-wanted' : 'chip'}
                onClick={() => onSetStatus('reverse', nextToggle(reverseStatus, 'wanted'))}
              >
                Cherche reverse
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
