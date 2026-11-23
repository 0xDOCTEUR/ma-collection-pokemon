import { useEffect, useState } from 'react'
import { formatEuro } from '../api/pokemon'
import { cardmarketEuroValue } from '../api/pokemon'
import type { CardmarketLiveStats, PokemonCard } from '../types'
import { fetchPsaPrices, loosePrices, type PsaPriceQuote } from '../utils/advicePrice'
import { formatCensusDate } from '../utils/population'

function nearMintEuro(card: PokemonCard, stats: CardmarketLiveStats | null): number | null {
  const live = stats?.trend ?? stats?.avg7 ?? stats?.avg30 ?? null
  if (live != null && live > 0) return live
  const stored = cardmarketEuroValue(card, 'normal')
  if (stored > 0) return stored
  const reverse = cardmarketEuroValue(card, 'reverse')
  return reverse > 0 ? reverse : null
}

export function AdvicePrices({
  card,
  stats,
}: {
  card: PokemonCard
  stats: CardmarketLiveStats | null
}) {
  const [quote, setQuote] = useState<PsaPriceQuote | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const base = nearMintEuro(card, stats)
  const loose = base == null ? [] : loosePrices(base)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setQuote(null)
    fetchPsaPrices(card.id)
      .then((next) => {
        if (cancelled) return
        setQuote(next)
        setState(next ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [card.id])

  return (
    <section className="advice-block">
      <div>
        <h3>Prix conseillé, carte sans note</h3>
        <p className="muted">
          Le quasi neuf est le prix Cardmarket. Les autres états sont un conseil à partir de ce
          prix, pas une vente relevée.
        </p>
      </div>
      {loose.length === 0 ? (
        <p className="pop-note">Pas de prix quasi neuf pour cette carte.</p>
      ) : (
        <table className="pop-table">
          <thead>
            <tr>
              <th>État</th>
              <th>Prix conseillé</th>
            </tr>
          </thead>
          <tbody>
            {loose.map((row) => (
              <tr key={row.id} className={row.reference ? 'is-compared' : undefined}>
                <td>
                  {row.label}
                  <small>{row.hint}</small>
                </td>
                <td>{formatEuro(row.eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div>
        <h3>Prix conseillé, carte notée PSA</h3>
        <p className="muted">
          Prix du marché anglais, converti en euros. Le numéro est le même en français, pas la
          quantité imprimée.
          {quote?.date && formatCensusDate(quote.date)
            ? ` Relevé du ${formatCensusDate(quote.date)}.`
            : ''}
        </p>
      </div>
      {state === 'loading' && <p className="pop-note">Chargement des prix notés…</p>}
      {state === 'error' && <p className="pop-note">Les prix notés n’ont pas pu être chargés.</p>}
      {state === 'empty' && <p className="pop-note">Pas encore de prix noté pour cette carte.</p>}
      {state === 'ready' && quote && (
        <table className="pop-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Prix conseillé</th>
            </tr>
          </thead>
          <tbody>
            {quote.rows.map((row) => (
              <tr key={row.label} className={row.label === 'PSA 10' ? 'is-compared' : undefined}>
                <td>{row.label}</td>
                <td>{formatEuro(row.eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
