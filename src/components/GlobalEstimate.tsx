import { euroValue, formatPrice } from '../api/pokemon'
import { SETS } from '../sets'
import type { CardStatus, PokemonCard } from '../types'

export interface OwnedSlot {
  card: PokemonCard
  variant: 'normal' | 'reverse'
  setName: string
}

interface SetBreakdown {
  setId: string
  setName: string
  ownedCount: number
  ownedValue: number
  wantedCount: number
  wantedValue: number
  missingCount: number
  missingValue: number
  totalSlots: number
}

interface Props {
  cardsBySet: Record<string, PokemonCard[]>
  getStatus: (setId: string, id: string, variant: 'normal' | 'reverse') => CardStatus
}

function money(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

export function GlobalEstimate({ cardsBySet, getStatus }: Props) {
  const breakdowns: SetBreakdown[] = []
  const ownedSlots: OwnedSlot[] = []
  let ownedTotal = 0
  let wantedTotal = 0
  let missingTotal = 0
  let ownedValue = 0
  let wantedValue = 0
  let missingValue = 0

  for (const set of SETS) {
    const cards = cardsBySet[set.id] ?? []
    const row: SetBreakdown = {
      setId: set.id,
      setName: set.name,
      ownedCount: 0,
      ownedValue: 0,
      wantedCount: 0,
      wantedValue: 0,
      missingCount: 0,
      missingValue: 0,
      totalSlots: 0,
    }

    for (const card of cards) {
      const variants: Array<'normal' | 'reverse'> = ['normal']
      if (card.hasReverse) variants.push('reverse')

      for (const variant of variants) {
        row.totalSlots += 1
        const status = getStatus(set.id, card.id, variant)
        const value = euroValue(card, variant)
        if (status === 'owned') {
          row.ownedCount += 1
          row.ownedValue += value
          ownedTotal += 1
          ownedValue += value
          ownedSlots.push({ card, variant, setName: set.name })
        } else if (status === 'wanted') {
          row.wantedCount += 1
          row.wantedValue += value
          wantedTotal += 1
          wantedValue += value
          row.missingCount += 1
          row.missingValue += value
          missingTotal += 1
          missingValue += value
        } else {
          row.missingCount += 1
          row.missingValue += value
          missingTotal += 1
          missingValue += value
        }
      }
    }
    breakdowns.push(row)
  }

  const topOwned = [...ownedSlots]
    .sort((a, b) => euroValue(b.card, b.variant) - euroValue(a.card, a.variant))
    .slice(0, 12)

  return (
    <section className="estimate-page">
      <header className="estimate-hero panel">
        <div>
          <p className="eyebrow">Estimation globale</p>
          <h2>Valeur de ta sélection</h2>
          <p className="muted">
            Calculée uniquement sur les cartes que tu as marquées « J’ai » (normales + reverse), sur
            toutes les séries.
          </p>
        </div>
        <div className="estimate-hero-value">
          <span>Collection sélectionnée</span>
          <strong>{money(ownedValue)}</strong>
          <small>
            {ownedTotal} version{ownedTotal > 1 ? 's' : ''} possédée{ownedTotal > 1 ? 's' : ''}
          </small>
        </div>
      </header>

      <div className="estimate-grid">
        <article className="panel estimate-card">
          <span className="stat-label">Valeur possédée</span>
          <strong>{money(ownedValue)}</strong>
        </article>
        <article className="panel estimate-card">
          <span className="stat-label">Coût des recherchées</span>
          <strong>{money(wantedValue)}</strong>
          <small>{wantedTotal} version(s)</small>
        </article>
        <article className="panel estimate-card">
          <span className="stat-label">Coût pour tout compléter</span>
          <strong>{money(missingValue)}</strong>
          <small>{missingTotal} version(s) restantes</small>
        </article>
      </div>

      <section className="panel estimate-table-wrap">
        <h3>Par série</h3>
        <table className="estimate-table">
          <thead>
            <tr>
              <th>Série</th>
              <th>Possédées</th>
              <th>Valeur sélection</th>
              <th>Recherchées</th>
              <th>Reste à compléter</th>
            </tr>
          </thead>
          <tbody>
            {breakdowns.map((row) => (
              <tr key={row.setId}>
                <td>{row.setName}</td>
                <td>
                  {row.ownedCount}/{row.totalSlots}
                </td>
                <td>{money(row.ownedValue)}</td>
                <td>
                  {row.wantedCount} · {money(row.wantedValue)}
                </td>
                <td>{money(row.missingValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel estimate-top">
        <h3>Tes cartes sélectionnées les plus chères</h3>
        {topOwned.length === 0 ? (
          <p className="muted">Marque des cartes avec « J’ai » pour voir l’estimation.</p>
        ) : (
          <ul className="top-list">
            {topOwned.map((slot) => (
              <li key={`${slot.card.id}-${slot.variant}`}>
                <img src={slot.card.imageSmall} alt="" width={48} height={67} />
                <div>
                  <strong>
                    {slot.card.name}
                    {slot.variant === 'reverse' ? ' (reverse)' : ''}
                  </strong>
                  <span>
                    {slot.setName} · #{slot.card.number}
                  </span>
                </div>
                <em>{formatPrice(slot.card, slot.variant)}</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
