import { useEffect, useId, useState } from 'react'
import { formatEuro } from '../api/pokemon'
import { fetchPsaPrices, loosePrices, type PsaPriceQuote } from '../utils/advicePrice'
import { frenchCardName } from '../utils/generations'
import { formatCount, formatGemRate, type PsaPrinting } from '../utils/population'
import {
  cardPageUrl,
  cardPotential,
  catalogSetName,
  huntImageUrl,
  huntPrintingLabel,
  languageLabel,
  toEur,
  type PsaHuntCard,
} from '../utils/psaHunt'
import { PotentialStamp } from './PotentialStamp'

interface Props {
  card: PsaHuntCard
  onClose: () => void
  /** État confirmé après un scan. */
  highlightedCondition?: string | null
}

function asPrinting(card: PsaHuntCard): PsaPrinting {
  return { label: card.printing || 'Normal', total: card.total, psa10: card.psa10, updatedAt: null }
}

export function CatalogCardSheet({ card, onClose, highlightedCondition = null }: Props) {
  const titleId = useId()
  const rawEur = toEur(card.rawUsd)
  const psaEur = toEur(card.psa10Usd)
  const loose = rawEur != null && rawEur > 0 ? loosePrices(rawEur) : []
  const potential = cardPotential(card.psa10, card.total, psaEur, rawEur)
  const image = huntImageUrl(card)
  const printing = asPrinting(card)
  const [quote, setQuote] = useState<PsaPriceQuote | null>(null)
  const [quoteState, setQuoteState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setQuoteState('loading')
    setQuote(null)
    fetchPsaPrices(card.cardId)
      .then((next) => {
        if (cancelled) return
        setQuote(next)
        setQuoteState(next ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!cancelled) setQuoteState('error')
      })
    return () => {
      cancelled = true
    }
  }, [card.cardId])

  return (
    <div className="card-sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="card-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="card-sheet-head">
          <div>
            <p className="card-sheet-num">
              #{card.number || '—'} · {catalogSetName(card.set)}
            </p>
            <h2 id={titleId}>{frenchCardName(card.name)}</h2>
            <p className="muted">
              {languageLabel(card.set.language)} · {huntPrintingLabel(card.printing)}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="card-sheet-body">
          {image ? (
            <img
              className="card-sheet-art"
              src={image}
              alt={frenchCardName(card.name)}
              width={245}
              height={342}
            />
          ) : (
            <div className="card-sheet-art hunt-fallback" aria-hidden="true" />
          )}

          <div className="card-sheet-main">
            <div className="card-sheet-prices">
              <div>
                <span className="stat-label">Côte sans note</span>
                <strong>{formatEuro(rawEur)}</strong>
              </div>
              <div>
                <span className="stat-label">Côte PSA 10</span>
                <strong>{formatEuro(psaEur)}</strong>
              </div>
            </div>

            {potential.level !== 'unknown' && (
              <p className="pop-note">
                <PotentialStamp potential={potential} inline /> {potential.reason}
              </p>
            )}

            <section className="advice-block">
              <div>
                <h3>Prix conseillé, carte sans note</h3>
                <p className="muted">
                  Le quasi neuf suit le prix marché du catalogue. Les autres états sont un conseil à
                  partir de ce prix, pas une vente relevée.
                </p>
              </div>
              {loose.length === 0 ? (
                <p className="pop-note">Pas de prix sans note pour cette carte.</p>
              ) : (
                <table className="pop-table">
                  <thead>
                    <tr>
                      <th>État</th>
                      <th>Prix conseillé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loose.map((row) => {
                      const highlighted = highlightedCondition === row.id
                      return (
                        <tr
                          key={row.id}
                          className={highlighted || row.reference ? 'is-compared' : undefined}
                        >
                          <td>
                            {row.label}
                            {highlighted ? (
                              <small> état confirmé après le scan</small>
                            ) : (
                              <small>{row.hint}</small>
                            )}
                          </td>
                          <td>{formatEuro(row.eur)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              <div>
                <h3>Prix conseillé, carte notée PSA</h3>
                <p className="muted">
                  Prix du marché anglais, converti en euros. Le numéro est le même en français, pas
                  la quantité imprimée.
                </p>
              </div>
              {quoteState === 'loading' && <p className="pop-note">Chargement des prix notés…</p>}
              {quoteState === 'error' && (
                <p className="pop-note">Les prix notés n’ont pas pu être chargés.</p>
              )}
              {quoteState === 'empty' && (
                <p className="pop-note">
                  Pas encore de détail de notes. Côte PSA 10 connue : {formatEuro(psaEur)}.
                </p>
              )}
              {quoteState === 'ready' && quote && (
                <table className="pop-table">
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th>Prix conseillé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.rows.map((row) => (
                      <tr
                        key={row.label}
                        className={row.label === 'PSA 10' ? 'is-compared' : undefined}
                      >
                        <td>{row.label}</td>
                        <td>{formatEuro(row.eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="pop-block">
              <div className="pop-block-head">
                <h3>Population PSA</h3>
                <p className="muted">
                  Nombre d’exemplaires déjà notés. Moins il y a de notes 10, plus cette version est
                  rare parmi les cartes notées.
                </p>
              </div>
              {card.total > 0 ? (
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
                    <tr className="is-compared">
                      <td>{huntPrintingLabel(card.printing)}</td>
                      <td>{formatCount(card.total)}</td>
                      <td>{formatCount(card.psa10)}</td>
                      <td>{formatGemRate(printing)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="pop-note">
                  Le recensement PSA n’est pas encore publié pour cette carte. Les côtes, elles, sont
                  là.
                </p>
              )}
              <p className="pop-note">
                Source catalogue ({languageLabel(card.set.language)}).{' '}
                <a href={cardPageUrl(card.slug)} target="_blank" rel="noreferrer">
                  Ouvrir la fiche source
                </a>
              </p>
            </section>
          </div>
        </div>
      </aside>
    </div>
  )
}
