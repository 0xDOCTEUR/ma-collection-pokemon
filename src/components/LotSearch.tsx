import { useMemo, useState } from 'react'
import { euroValue, formatPrice } from '../api/pokemon'
import { SETS } from '../sets'
import type { CardStatus, CardVariant, PokemonCard } from '../types'
import { downloadText, formatList, type ListEntry } from '../utils/lists'
import { lotIdeas, searchUrl, type Marketplace } from '../utils/marketplace'

interface Props {
  cardsBySet: Record<string, PokemonCard[]>
  getStatus: (setId: string, id: string, variant: CardVariant) => CardStatus
}

const MARKETS: { id: Marketplace; label: string }[] = [
  { id: 'leboncoin', label: 'Leboncoin' },
  { id: 'cardmarket', label: 'Cardmarket' },
  { id: 'ebay', label: 'eBay' },
]

function money(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

export function LotSearch({ cardsBySet, getStatus }: Props) {
  const [setId, setSetId] = useState(SETS[0]?.id ?? 'sv03.5')
  const [market, setMarket] = useState<Marketplace>('leboncoin')
  const [copied, setCopied] = useState(false)

  const setInfo = SETS.find((s) => s.id === setId) ?? SETS[0]
  const cards = cardsBySet[setId] ?? []

  const missing = useMemo(() => {
    const entries: ListEntry[] = []
    for (const card of cards) {
      if (getStatus(setId, card.id, 'normal') !== 'owned') {
        entries.push({
          card,
          variant: 'normal',
          status: getStatus(setId, card.id, 'normal'),
        })
      }
      if (card.hasReverse && getStatus(setId, card.id, 'reverse') !== 'owned') {
        entries.push({
          card,
          variant: 'reverse',
          status: getStatus(setId, card.id, 'reverse'),
        })
      }
    }
    return entries.sort(
      (a, b) => euroValue(b.card, b.variant) - euroValue(a.card, a.variant),
    )
  }, [cards, getStatus, setId])

  const missingValue = useMemo(
    () => missing.reduce((sum, e) => sum + euroValue(e.card, e.variant), 0),
    [missing],
  )

  const topTargets = missing.slice(0, 8)
  const ideas = useMemo(
    () => lotIdeas(setInfo.name, setInfo.shortName),
    [setInfo.name, setInfo.shortName],
  )

  const numbersText = useMemo(() => formatList(missing, 'numbers'), [missing])

  async function copyNumbers() {
    await navigator.clipboard.writeText(numbersText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function downloadMissing() {
    downloadText(formatList(missing, 'numbers-names'), `manquantes-${setInfo.shortName}.txt`)
  }

  return (
    <section className="lot-search">
      <header className="estimate-hero panel">
        <div>
          <p className="eyebrow">Chercher des lots</p>
          <h2>Trouve tes manques au meilleur prix</h2>
          <p className="muted">
            L’appli prépare les recherches Leboncoin, Cardmarket et eBay selon tes cartes
            manquantes. Elle n’achète pas à ta place : tu compares les annonces, puis tu choisis.
          </p>
        </div>
        <div className="estimate-hero-value">
          <span>Coût unitaire estimé</span>
          <strong>{money(missingValue)}</strong>
          <small>
            {missing.length} version(s) manquante(s) · vise un lot moins cher que ce total
          </small>
        </div>
      </header>

      <section className="panel lot-controls">
        <div className="export-filters">
          <label>
            Collection
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              {SETS.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Site
            <select value={market} onChange={(e) => setMarket(e.target.value as Marketplace)}>
              {MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="export-actions">
          <button type="button" className="btn primary" onClick={copyNumbers} disabled={!missing.length}>
            {copied ? 'Numéros copiés !' : 'Copier les numéros manquants'}
          </button>
          <button type="button" className="btn ghost" onClick={downloadMissing} disabled={!missing.length}>
            Télécharger la liste manquante
          </button>
        </div>
      </section>

      {missing.length === 0 ? (
        <p className="state-msg">Rien à chercher : cette série est complète de ton côté.</p>
      ) : (
        <>
          <section className="panel lot-ideas">
            <h3>Recherches de lots</h3>
            <p className="muted">
              Ouvre une recherche, regarde le prix du lot, puis compare avec le coût unitaire
              estimé ({money(missingValue)}).
            </p>
            <div className="idea-grid">
              {ideas.map((idea) => (
                <article key={idea.id} className="idea-card">
                  <h4>{idea.title}</h4>
                  <p>{idea.why}</p>
                  <code>{idea.query}</code>
                  <a
                    className="btn primary"
                    href={searchUrl(market, idea.query)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir sur {MARKETS.find((m) => m.id === market)?.label}
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section className="panel lot-ideas">
            <h3>Cartes manquantes les plus chères</h3>
            <p className="muted">
              Pour les grosses pièces, cherche aussi à l’unité (souvent plus simple qu’en lot).
            </p>
            <ul className="top-list">
              {topTargets.map((entry) => {
                const label = `${entry.card.name}${entry.variant === 'reverse' ? ' reverse' : ''}`
                const query = `pokemon ${setInfo.shortName} ${entry.card.name}${
                  entry.variant === 'reverse' ? ' reverse' : ''
                }`
                return (
                  <li key={`${entry.card.id}-${entry.variant}`}>
                    <img src={entry.card.imageSmall} alt="" width={48} height={67} />
                    <div>
                      <strong>
                        #{entry.card.number} — {label}
                      </strong>
                      <span>
                        {entry.card.rarity} · côte {formatPrice(entry.card, entry.variant)}
                      </span>
                    </div>
                    <div className="market-links">
                      {MARKETS.map((m) => (
                        <a
                          key={m.id}
                          href={searchUrl(m.id, query)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.label}
                        </a>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="panel lot-tips">
            <h3>Comment comparer vite</h3>
            <ol>
              <li>Copie ta liste de numéros manquants.</li>
              <li>Ouvre un lot sur Leboncoin / eBay / Cardmarket.</li>
              <li>Compte combien de tes manques sont dedans.</li>
              <li>
                Si le lot coûte clairement moins que {money(missingValue)} pour une bonne partie
                de tes manques, c’est intéressant.
              </li>
            </ol>
          </section>
        </>
      )}
    </section>
  )
}
