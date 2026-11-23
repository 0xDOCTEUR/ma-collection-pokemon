import { formatEuro } from '../api/pokemon'
import { loosePrices } from '../utils/advicePrice'
import { cardPageUrl, huntPrintingLabel, languageLabel, toEur } from '../utils/psaHunt'
import type { LooseConditionId } from '../utils/cardScan'
import type { ScanTarget } from '../utils/scanTargets'
import { PotentialStamp } from './PotentialStamp'
import { cardPotential } from '../utils/psaHunt'

interface Props {
  target: ScanTarget
  conditionId: LooseConditionId
  onClose: () => void
}

export function CatalogCardSheet({ target, conditionId, onClose }: Props) {
  const hunt = target.hunt
  const rawEur = hunt ? toEur(hunt.rawUsd) : null
  const psaEur = hunt ? toEur(hunt.psa10Usd) : null
  const loose = rawEur != null && rawEur > 0 ? loosePrices(rawEur) : []
  const highlighted = loose.find((row) => row.id === conditionId)
  const potential =
    hunt && psaEur != null && rawEur != null
      ? cardPotential(hunt.psa10, hunt.total, psaEur, rawEur)
      : null

  return (
    <div className="card-sheet-backdrop" onClick={onClose} role="presentation">
      <aside className="card-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="card-sheet-head">
          <div>
            <p className="card-sheet-num">
              #{target.number} · {target.setLabel}
            </p>
            <h2>{target.name}</h2>
            <p className="muted">
              {hunt
                ? `${languageLabel(hunt.set.language)} · ${huntPrintingLabel(hunt.printing)}`
                : target.rarity || 'Carte'}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="card-sheet-body">
          {target.imageSmall ? (
            <img className="card-sheet-art" src={target.imageSmall} alt={target.name} width={245} height={342} />
          ) : (
            <div className="card-sheet-art hunt-fallback" aria-hidden="true" />
          )}
          <div className="card-sheet-main">
            <div className="card-sheet-prices">
              <div>
                <span className="stat-label">Sans note</span>
                <strong>{formatEuro(rawEur)}</strong>
              </div>
              <div>
                <span className="stat-label">PSA 10</span>
                <strong>{formatEuro(psaEur)}</strong>
              </div>
            </div>

            {potential && (
              <p className="pop-note">
                <PotentialStamp potential={potential} inline /> {potential.reason}
              </p>
            )}

            {loose.length > 0 && (
              <section className="advice-block">
                <div>
                  <h3>Prix conseillé, carte sans note</h3>
                  <p className="muted">
                    Le quasi neuf suit le prix marché. Les autres états sont un conseil à partir de
                    ce prix.
                  </p>
                </div>
                <table className="pop-table">
                  <thead>
                    <tr>
                      <th>État</th>
                      <th>Prix conseillé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loose.map((row) => (
                      <tr
                        key={row.id}
                        className={row.id === conditionId || row.reference ? 'is-compared' : undefined}
                      >
                        <td>
                          {row.label}
                          {row.id === conditionId ? (
                            <small> état confirmé après le scan</small>
                          ) : (
                            <small>{row.hint}</small>
                          )}
                        </td>
                        <td>{formatEuro(row.eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {highlighted && (
                  <p className="pop-note">
                    Pour l’état choisi : <strong>{formatEuro(highlighted.eur)}</strong>
                  </p>
                )}
              </section>
            )}

            {hunt && (
              <p className="pop-note">
                Prix du catalogue ({languageLabel(hunt.set.language)}).{' '}
                <a href={cardPageUrl(hunt.slug)} target="_blank" rel="noreferrer">
                  Voir la fiche source
                </a>
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
