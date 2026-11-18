import { formatPrice } from '../api/pokemon'
import type { CardStatus, CardVariant, PokemonCard } from '../types'

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
}

function nextToggle(current: CardStatus, target: 'owned' | 'wanted'): CardStatus {
  return current === target ? 'missing' : target
}

export function PokemonCardTile({
  card,
  normalStatus,
  reverseStatus,
  onSetStatus,
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
        onClick={() => onSetStatus('normal', nextToggle(normalStatus, 'owned'))}
        title="Marquer la version normale"
      >
        <img src={card.imageSmall} alt={card.name} loading="lazy" width={245} height={342} />
        <span className="tile-badge">{STATUS_LABEL[overall]}</span>
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
