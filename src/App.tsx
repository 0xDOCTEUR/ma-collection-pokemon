import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { euroValue, fetchSetCards } from './api/pokemon'
import { BackupPanel } from './components/BackupPanel'
import { CustomLists } from './components/CustomLists'
import { ExportPanel } from './components/ExportPanel'
import { GlobalEstimate } from './components/GlobalEstimate'
import { LotSearch } from './components/LotSearch'
import { PokemonCardTile } from './components/PokemonCardTile'
import { QuickAdd } from './components/QuickAdd'
import { useCollection } from './hooks/useCollection'
import { useCustomLists } from './hooks/useCustomLists'
import { SETS, type AppTab } from './sets'
import type { CardStatus, CardVariant, FilterStatus, PokemonCard, SortKey } from './types'
import { sortRarities } from './utils/rarity'
import './App.css'

function money(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

function trackSlot(
  status: CardStatus,
  value: number,
  acc: {
    owned: number
    wanted: number
    missing: number
    ownedValue: number
    missingValue: number
  },
) {
  if (status === 'owned') {
    acc.owned += 1
    acc.ownedValue += value
  } else if (status === 'wanted') {
    acc.wanted += 1
    acc.missing += 1
    acc.missingValue += value
  } else {
    acc.missing += 1
    acc.missingValue += value
  }
}

export default function App() {
  const [tab, setTab] = useState<AppTab>('sv03.5')
  const [cardsBySet, setCardsBySet] = useState<Record<string, PokemonCard[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [rarity, setRarity] = useState('all')
  const [sort, setSort] = useState<SortKey>('number')
  const { getStatus, setStatus, markMany, resetSet, savedAt } = useCollection()
  const customLists = useCustomLists()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const entries = await Promise.all(
          SETS.map(async (set) => [set.id, await fetchSetCards(set)] as const),
        )
        if (!cancelled) {
          setCardsBySet(Object.fromEntries(entries))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur de chargement')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const activeSet = SETS.find((s) => s.id === tab) ?? null
  const cards = activeSet ? (cardsBySet[activeSet.id] ?? []) : []

  const getActiveStatus = useCallback(
    (cardId: string, variant: CardVariant): CardStatus =>
      activeSet ? getStatus(activeSet.id, cardId, variant) : 'missing',
    [activeSet, getStatus],
  )

  const rarities = useMemo(() => {
    const set = new Set(cards.map((c) => c.rarity))
    return sortRarities([...set])
  }, [cards])

  const enriched = useMemo(() => {
    if (!activeSet) return []
    return cards.map((card) => ({
      card,
      normalStatus: getStatus(activeSet.id, card.id, 'normal'),
      reverseStatus: card.hasReverse
        ? getStatus(activeSet.id, card.id, 'reverse')
        : ('missing' as CardStatus),
    }))
  }, [cards, getStatus, activeSet])

  const stats = useMemo(() => {
    const acc = {
      owned: 0,
      wanted: 0,
      missing: 0,
      ownedValue: 0,
      missingValue: 0,
      totalSlots: 0,
    }
    for (const { card, normalStatus, reverseStatus } of enriched) {
      acc.totalSlots += 1
      trackSlot(normalStatus, euroValue(card, 'normal'), acc)
      if (card.hasReverse) {
        acc.totalSlots += 1
        trackSlot(reverseStatus, euroValue(card, 'reverse'), acc)
      }
    }
    return {
      ...acc,
      progress: acc.totalSlots ? (acc.owned / acc.totalSlots) * 100 : 0,
    }
  }, [enriched])

  const globalOwnedValue = useMemo(() => {
    let total = 0
    for (const set of SETS) {
      for (const card of cardsBySet[set.id] ?? []) {
        if (getStatus(set.id, card.id, 'normal') === 'owned') {
          total += euroValue(card, 'normal')
        }
        if (card.hasReverse && getStatus(set.id, card.id, 'reverse') === 'owned') {
          total += euroValue(card, 'reverse')
        }
      }
    }
    return total
  }, [cardsBySet, getStatus])

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    let list = enriched.filter(({ card, normalStatus, reverseStatus }) => {
      if (filter === 'owned') {
        if (!(normalStatus === 'owned' || reverseStatus === 'owned')) return false
      } else if (filter === 'wanted') {
        if (!(normalStatus === 'wanted' || reverseStatus === 'wanted')) return false
      } else if (filter === 'missing') {
        if (!(normalStatus === 'missing' || (card.hasReverse && reverseStatus === 'missing'))) {
          return false
        }
      } else if (filter === 'reverse-missing') {
        if (!(card.hasReverse && reverseStatus === 'missing')) return false
      } else if (filter === 'reverse-owned') {
        if (!(card.hasReverse && reverseStatus === 'owned')) return false
      }

      if (rarity !== 'all' && card.rarity !== rarity) return false
      if (!q) return true
      return (
        card.name.toLowerCase().includes(q) ||
        card.number.includes(q) ||
        `${card.number}/${card.printedTotal}`.includes(q)
      )
    })

    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.card.name.localeCompare(b.card.name, 'fr')
      if (sort === 'price-asc') return euroValue(a.card) - euroValue(b.card)
      if (sort === 'price-desc') return euroValue(b.card) - euroValue(a.card)
      return Number.parseInt(a.card.number, 10) - Number.parseInt(b.card.number, 10)
    })
    return list
  }, [enriched, deferredQuery, filter, rarity, sort])

  useEffect(() => {
    setQuery('')
    setFilter('all')
    setRarity('all')
    setSort('number')
  }, [tab])

  const savedLabel = savedAt
    ? `Sauvegardé à ${new Date(savedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    : 'Sauvegarde automatique'

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />

      <nav className="tabs" aria-label="Séries">
        {SETS.map((set) => (
          <button
            key={set.id}
            type="button"
            className={tab === set.id ? 'tab active' : 'tab'}
            onClick={() => setTab(set.id)}
          >
            {set.shortName}
          </button>
        ))}
        <button
          type="button"
          className={tab === 'listes' ? 'tab active' : 'tab'}
          onClick={() => setTab('listes')}
        >
          Mes listes
        </button>
        <button
          type="button"
          className={tab === 'lots' ? 'tab active' : 'tab'}
          onClick={() => setTab('lots')}
        >
          Chercher des lots
        </button>
        <button
          type="button"
          className={tab === 'estimation' ? 'tab active' : 'tab'}
          onClick={() => setTab('estimation')}
        >
          Estimation
          <span className="tab-value">{money(globalOwnedValue)}</span>
        </button>
      </nav>

      {tab === 'estimation' ? (
        loading ? (
          <p className="state-msg">Chargement des séries…</p>
        ) : error ? (
          <p className="state-msg error">{error}</p>
        ) : (
          <GlobalEstimate cardsBySet={cardsBySet} getStatus={getStatus} />
        )
      ) : tab === 'listes' ? (
        loading ? (
          <p className="state-msg">Chargement des séries…</p>
        ) : error ? (
          <p className="state-msg error">{error}</p>
        ) : (
          <CustomLists cardsBySet={cardsBySet} {...customLists} />
        )
      ) : tab === 'lots' ? (
        loading ? (
          <p className="state-msg">Chargement des séries…</p>
        ) : error ? (
          <p className="state-msg error">{error}</p>
        ) : (
          <LotSearch cardsBySet={cardsBySet} getStatus={getStatus} />
        )
      ) : (
        <>
          <header className="hero">
            <div className="hero-copy">
              <p className="brand">{activeSet?.name}</p>
              <h1>Ta collection, claire et à jour</h1>
              <p className="lede">
                Noms en français, versions normales et reverse, côtes en euros. Tout est enregistré
                automatiquement dans ce navigateur.
              </p>
              <p className="save-pill">{savedLabel}</p>
              <div className="hero-cta">
                <a className="btn primary" href="#grille">
                  Voir les cartes
                </a>
                <button type="button" className="btn ghost" onClick={() => setTab('estimation')}>
                  Voir l’estimation globale
                </button>
              </div>
            </div>
            <div className="hero-visual">
              {activeSet && (
                <img
                  src={activeSet.logo}
                  alt={`Logo ${activeSet.name}`}
                  className="set-logo"
                  onError={(e) => {
                    if (activeSet.logoFallback) {
                      ;(e.currentTarget as HTMLImageElement).src = activeSet.logoFallback
                    }
                  }}
                />
              )}
              <div className="progress-ring" style={{ ['--p' as string]: `${stats.progress}%` }}>
                <strong>{Math.round(stats.progress)}%</strong>
                <span>complétée</span>
              </div>
            </div>
          </header>

          <section className="stats panel">
            <div>
              <span className="stat-label">Possédées</span>
              <strong>
                {stats.owned}
                <small>/{stats.totalSlots}</small>
              </strong>
            </div>
            <div>
              <span className="stat-label">Manquantes</span>
              <strong>{stats.missing}</strong>
            </div>
            <div>
              <span className="stat-label">Recherchées</span>
              <strong>{stats.wanted}</strong>
            </div>
            <div>
              <span className="stat-label">Valeur de ta sélection</span>
              <strong>{money(stats.ownedValue)}</strong>
            </div>
            <div>
              <span className="stat-label">Coût restant estimé</span>
              <strong>{money(stats.missingValue)}</strong>
            </div>
          </section>

          {activeSet && (
            <QuickAdd
              cards={cards}
              onApply={(ids, status, variant) => markMany(activeSet.id, ids, status, variant)}
            />
          )}

          {activeSet && (
            <ExportPanel setName={activeSet.name} cards={cards} getStatus={getActiveStatus} />
          )}

          <section className="controls panel" id="grille">
            <label className="search">
              Recherche
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom ou numéro"
              />
            </label>

            <label>
              Statut
              <select value={filter} onChange={(e) => setFilter(e.target.value as FilterStatus)}>
                <option value="all">Toutes</option>
                <option value="owned">Possédées</option>
                <option value="missing">Manquantes</option>
                <option value="wanted">Recherchées</option>
                <option value="reverse-missing">Reverse manquantes</option>
                <option value="reverse-owned">Reverse possédées</option>
              </select>
            </label>

            <label>
              Rareté
              <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="all">Toutes</option>
                {rarities.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tri
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="number">Numéro</option>
                <option value="name">Nom</option>
                <option value="price-desc">Côte décroissante</option>
                <option value="price-asc">Côte croissante</option>
              </select>
            </label>

            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                if (
                  activeSet &&
                  window.confirm(`Effacer ta collection « ${activeSet.name} » enregistrée ?`)
                ) {
                  resetSet(activeSet.id)
                }
              }}
            >
              Réinitialiser
            </button>
          </section>

          {loading && <p className="state-msg">Chargement des séries…</p>}
          {error && <p className="state-msg error">{error}</p>}

          {!loading && !error && activeSet && (
            <>
              <p className="result-count">
                {visible.length} carte{visible.length > 1 ? 's' : ''} affichée
                {visible.length > 1 ? 's' : ''} · sélection estimée à {money(stats.ownedValue)}
              </p>
              <div className="grid">
                {visible.map(({ card, normalStatus, reverseStatus }) => (
                  <PokemonCardTile
                    key={card.id}
                    card={card}
                    normalStatus={normalStatus}
                    reverseStatus={reverseStatus}
                    onSetStatus={(variant, status) =>
                      setStatus(activeSet.id, card.id, status, variant)
                    }
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <BackupPanel />

      <footer className="footer">
        <p>
          Séries : Pokémon 151 et Règne Delta. Côtes TCGPlayer (converties en euros) et Cardmarket.
          Collection sauvegardée dans ton navigateur. Pour le site en ligne, exporte puis restaure ta
          sauvegarde.
        </p>
      </footer>
    </div>
  )
}
