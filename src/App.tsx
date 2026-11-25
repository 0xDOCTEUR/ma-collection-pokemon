import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { euroValue, fetchPopulation, fetchSetCards } from './api/pokemon'
import { BackupPanel } from './components/BackupPanel'
import { CardDetailSheet } from './components/CardDetailSheet'
import { CollectionMenu } from './components/CollectionMenu'
import { CustomLists } from './components/CustomLists'
import { ExportPanel } from './components/ExportPanel'
import { GlobalEstimate } from './components/GlobalEstimate'
import { PsaHunt } from './components/PsaHunt'
import { PokedocLogo } from './components/PokedocLogo'
import { CardScan } from './components/CardScan'
import { CatalogCardSheet } from './components/CatalogCardSheet'
import { PokemonCardTile } from './components/PokemonCardTile'
import { QuickAdd } from './components/QuickAdd'
import type { LooseConditionId } from './utils/cardScan'
import {
  buildAllCollectionSets,
  buildCatalogSetCards,
  buildCatalogSetPopulation,
} from './utils/collectionSets'
import { buildScanTargets } from './utils/scanTargets'
import { useCollection } from './hooks/useCollection'
import { useCustomLists } from './hooks/useCustomLists'
import { SETS, type AppTab } from './sets'
import type { CardStatus, CardVariant, FilterStatus, PokemonCard, SortKey } from './types'
import { matchesSearchText } from './utils/frenchNames'
import { fetchTcgdexFrenchSet, type TcgdexFrenchCardInfo } from './utils/frenchSets'
import { sortRarities } from './utils/rarity'
import {
  formatCensusDate,
  latestCensusDate,
  populationSortGroup,
  primaryPrinting,
  rankByPsa10,
  type PopulationFile,
} from './utils/population'
import {
  cardPotential,
  loadPsaHunt,
  toEur,
  type CardPotential,
  type PsaHuntCard,
  type PsaHuntData,
} from './utils/psaHunt'
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

const FILTER_STATUS_LABEL: Record<FilterStatus, string> = {
  all: 'Toutes',
  owned: 'Possédées',
  missing: 'Manquantes',
  wanted: 'Recherchées',
  'reverse-missing': 'Reverse manquantes',
  'reverse-owned': 'Reverse possédées',
}

const COLLECTION_HUNT_SET: Record<string, string> = {
  'sv03.5': 'sv3pt5',
}

const HUNT_TO_COLLECTION_SET: Record<string, string> = {
  sv3pt5: 'sv03.5',
}

const LAST_SET_KEY = 'pokedoc-last-set'
const COLLECTION_DENSITY_KEY = 'pokedoc-collection-density'

function readInitialTab(): AppTab {
  try {
    const saved = localStorage.getItem(LAST_SET_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return 'sv03.5'
}

function readDensity(): 'normal' | 'compact' {
  try {
    return localStorage.getItem(COLLECTION_DENSITY_KEY) === 'compact' ? 'compact' : 'normal'
  } catch {
    return 'normal'
  }
}

export default function App() {
  const [tab, setTab] = useState<AppTab>(() => readInitialTab())
  const [cardsBySet, setCardsBySet] = useState<Record<string, PokemonCard[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [rarity, setRarity] = useState('all')
  const [sort, setSort] = useState<SortKey>('number')
  const [density, setDensity] = useState<'normal' | 'compact'>(() => readDensity())
  const [openTool, setOpenTool] = useState<'quick' | 'export' | null>(null)
  const [showPopHelp, setShowPopHelp] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [detailCard, setDetailCard] = useState<PokemonCard | null>(null)
  const [catalogCard, setCatalogCard] = useState<PsaHuntCard | null>(null)
  const [scannedCondition, setScannedCondition] = useState<LooseConditionId | null>(null)
  const [populationBySet, setPopulationBySet] = useState<Record<string, PopulationFile | null>>({})
  const [hunt, setHunt] = useState<PsaHuntData | null>(null)
  const [tcgdexFrBySet, setTcgdexFrBySet] = useState<
    Record<string, Map<string, TcgdexFrenchCardInfo> | null>
  >({})
  const { collections, getStatus, setStatus, markMany, resetSet, savedAt } = useCollection()
  const customLists = useCustomLists()

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 520)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COLLECTION_DENSITY_KEY, density)
    } catch {
      /* ignore */
    }
  }, [density])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const results = await Promise.all(
          SETS.map(async (set) => {
            try {
              return [set.id, await fetchSetCards(set), null] as const
            } catch (e) {
              return [
                set.id,
                [] as PokemonCard[],
                e instanceof Error ? e.message : `Erreur ${set.name}`,
              ] as const
            }
          }),
        )
        if (cancelled) return
        setCardsBySet(Object.fromEntries(results.map(([id, cards]) => [id, cards])))
        const failures = results.filter(([, cards, err]) => err && cards.length === 0)
        if (failures.length === SETS.length) {
          setError(failures[0]?.[2] ?? 'Erreur de chargement')
        } else if (failures.length > 0) {
          setError(failures.map(([, , err]) => err).filter(Boolean).join(' · '))
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        SETS.map(async (set) => {
          try {
            return [set.id, await fetchPopulation(set)] as const
          } catch {
            return [set.id, null] as const
          }
        }),
      )
      if (!cancelled) setPopulationBySet(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadPsaHunt()
      .then((data) => {
        if (!cancelled) setHunt(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const allCollectionSets = useMemo(() => buildAllCollectionSets(hunt), [hunt])

  const isToolTab =
    tab === 'catalogue' || tab === 'scan' || tab === 'estimation' || tab === 'listes' || tab === 'lots'
  const activeSet = isToolTab ? null : (allCollectionSets.find((s) => s.id === tab) ?? null)

  useEffect(() => {
    if (!activeSet || activeSet.featured || activeSet.language === 'ja') return
    if (activeSet.id in tcgdexFrBySet) return
    let cancelled = false
    fetchTcgdexFrenchSet(activeSet.id)
      .then((map) => {
        if (!cancelled) {
          setTcgdexFrBySet((prev) => ({ ...prev, [activeSet.id]: map }))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeSet, tcgdexFrBySet])

  const ownedCountBySet = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [setId, map] of Object.entries(collections)) {
      let n = 0
      for (const status of Object.values(map)) {
        if (status === 'owned') n += 1
      }
      if (n > 0) counts[setId] = n
    }
    return counts
  }, [collections])

  const trackedSets = useMemo(() => {
    const needed = new Set<string>(SETS.map((s) => s.id))
    for (const setId of Object.keys(collections)) {
      if (Object.keys(collections[setId] ?? {}).length > 0) needed.add(setId)
    }
    for (const list of customLists.lists) needed.add(list.setId)
    if (activeSet) needed.add(activeSet.id)
    return allCollectionSets.filter((s) => needed.has(s.id))
  }, [allCollectionSets, collections, customLists.lists, activeSet])

  const allCardsBySet = useMemo(() => {
    const next: Record<string, PokemonCard[]> = { ...cardsBySet }
    if (!hunt) return next
    for (const set of trackedSets) {
      if (set.featured) continue
      // Toujours reconstruire avec les données FR TCGdex dès qu’elles arrivent
      // (sinon on garderait les noms/images anglais du 1er passage).
      next[set.id] = buildCatalogSetCards(set.id, hunt, tcgdexFrBySet[set.id])
    }
    return next
  }, [cardsBySet, hunt, trackedSets, tcgdexFrBySet])

  const cards = activeSet ? (allCardsBySet[activeSet.id] ?? []) : []

  const getActiveStatus = useCallback(
    (cardId: string, variant: CardVariant): CardStatus =>
      activeSet ? getStatus(activeSet.id, cardId, variant) : 'missing',
    [activeSet, getStatus],
  )

  const rarities = useMemo(() => {
    const set = new Set(cards.map((c) => c.rarity))
    return sortRarities([...set])
  }, [cards])

  const activeCatalogPopulation = useMemo(() => {
    if (!activeSet || activeSet.featured || !hunt) return null
    return buildCatalogSetPopulation(activeSet.id, hunt)
  }, [activeSet, hunt])

  const populationFile = activeSet
    ? (populationBySet[activeSet.id] ?? activeCatalogPopulation ?? null)
    : null
  const setHasPopulation = populationFile != null && Object.keys(populationFile.cards).length > 0
  const populationRank = useMemo(() => {
    if (!setHasPopulation || !populationFile) {
      return { rankById: new Map<string, number>(), comparable: 0 }
    }
    return rankByPsa10(
      cards.map((card) => ({
        id: card.id,
        printings: populationFile.cards[card.id]?.printings,
      })),
    )
  }, [cards, populationFile, setHasPopulation])

  const potentialByCardId = useMemo(() => {
    const map = new Map<string, CardPotential>()
    const huntSetId = activeSet
      ? (activeSet.huntSetId ?? COLLECTION_HUNT_SET[activeSet.id])
      : undefined
    if (!hunt || !huntSetId) return map
    const byNumber = new Map<string, PsaHuntData['cards']>()
    for (const row of hunt.cards) {
      if (row.set.id !== huntSetId || row.set.language === 'fr') continue
      const list = byNumber.get(row.number) ?? []
      list.push(row)
      byNumber.set(row.number, list)
    }
    for (const card of cards) {
      const rows = byNumber.get(card.number)
      if (!rows?.length) continue
      const primary = primaryPrinting(populationFile?.cards[card.id]?.printings)
      const match = (primary ? rows.find((row) => row.printing === primary.label) : null) ?? rows[0]
      const potential = cardPotential(
        match.psa10,
        match.total,
        toEur(match.psa10Usd),
        toEur(match.rawUsd),
      )
      if (potential.level !== 'unknown') map.set(card.id, potential)
    }
    return map
  }, [hunt, activeSet, cards, populationFile])

  const censusLabel = formatCensusDate(latestCensusDate(populationFile))

  const scanTargets = useMemo(() => buildScanTargets(cardsBySet, hunt), [cardsBySet, hunt])

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
    for (const set of trackedSets) {
      for (const card of allCardsBySet[set.id] ?? []) {
        if (getStatus(set.id, card.id, 'normal') === 'owned') {
          total += euroValue(card, 'normal')
        }
        if (card.hasReverse && getStatus(set.id, card.id, 'reverse') === 'owned') {
          total += euroValue(card, 'reverse')
        }
      }
    }
    return total
  }, [trackedSets, allCardsBySet, getStatus])

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
      return matchesSearchText(
        `${card.name} ${card.number} ${card.number}/${card.printedTotal} ${card.rarity}`,
        deferredQuery,
      )
    })

    const activePop = populationFile
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.card.name.localeCompare(b.card.name, 'fr')
      if (sort === 'price-asc') return euroValue(a.card) - euroValue(b.card)
      if (sort === 'price-desc') return euroValue(b.card) - euroValue(a.card)
      if (sort === 'pop-asc' || sort === 'pop-desc') {
        const left = populationSortGroup(activePop?.cards[a.card.id]?.printings)
        const right = populationSortGroup(activePop?.cards[b.card.id]?.printings)
        if (left.group !== right.group) return left.group - right.group
        return sort === 'pop-asc' ? left.psa10 - right.psa10 : right.psa10 - left.psa10
      }
      return Number.parseInt(a.card.number, 10) - Number.parseInt(b.card.number, 10)
    })
    return list
  }, [enriched, deferredQuery, filter, rarity, sort, populationFile])

  useEffect(() => {
    setQuery('')
    setFilter('all')
    setRarity('all')
    setSort('number')
    setOpenTool(null)
    if (!isToolTab) {
      try {
        localStorage.setItem(LAST_SET_KEY, tab)
      } catch {
        /* ignore */
      }
    }
  }, [tab, isToolTab])

  const setHasAnyReverse = useMemo(() => cards.some((c) => c.hasReverse), [cards])

  const statusCounts = useMemo(() => {
    let owned = 0
    let missing = 0
    let wanted = 0
    let reverseMissing = 0
    let reverseOwned = 0
    for (const { card, normalStatus, reverseStatus } of enriched) {
      if (normalStatus === 'owned' || (card.hasReverse && reverseStatus === 'owned')) owned += 1
      if (normalStatus === 'missing' || (card.hasReverse && reverseStatus === 'missing')) missing += 1
      if (normalStatus === 'wanted' || (card.hasReverse && reverseStatus === 'wanted')) wanted += 1
      if (card.hasReverse && reverseStatus === 'missing') reverseMissing += 1
      if (card.hasReverse && reverseStatus === 'owned') reverseOwned += 1
    }
    return { all: enriched.length, owned, missing, wanted, reverseMissing, reverseOwned }
  }, [enriched])

  const hasActiveCollectionFilters =
    query.trim() !== '' || filter !== 'all' || rarity !== 'all' || sort !== 'number'

  function clearCollectionFilters() {
    setQuery('')
    setFilter('all')
    setRarity('all')
    setSort('number')
  }

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

      <header className="site-top">
        <PokedocLogo />
        <nav className="tabs" aria-label="Navigation">
          <CollectionMenu
            sets={allCollectionSets}
            activeSetId={activeSet?.id ?? null}
            isCollectionActive={!isToolTab}
            ownedCountBySet={ownedCountBySet}
            onSelectSet={(setId) => setTab(setId)}
          />
          <span className="nav-sep" aria-hidden="true" />
          <button
            type="button"
            className={tab === 'catalogue' ? 'tab active' : 'tab'}
            onClick={() => setTab('catalogue')}
          >
            Catalogue
          </button>
          <span className="nav-sep" aria-hidden="true" />
          <button
            type="button"
            className={tab === 'scan' ? 'tab active tab-scan' : 'tab tab-scan'}
            onClick={() => setTab('scan')}
          >
            Scanner
          </button>
          <span className="nav-sep" aria-hidden="true" />
          <button
            type="button"
            className={tab === 'listes' ? 'tab active' : 'tab'}
            onClick={() => setTab('listes')}
          >
            Listes
          </button>
          <span className="nav-sep" aria-hidden="true" />
          <button
            type="button"
            className={tab === 'estimation' ? 'tab active' : 'tab'}
            onClick={() => setTab('estimation')}
          >
            Estimation
            <span className="tab-value">{money(globalOwnedValue)}</span>
          </button>
        </nav>
      </header>

      {tab === 'catalogue' ? (
        <PsaHunt
          onOpenCard={(card) => {
            setDetailCard(null)
            setScannedCondition(null)
            setCatalogCard(card)
          }}
        />
      ) : tab === 'scan' ? (
        loading ? (
          <p className="state-msg">Chargement des séries pour le scan…</p>
        ) : (
          <CardScan
            targets={scanTargets}
            embedded
            onConfirm={(target, conditionId) => {
              setScannedCondition(conditionId)
              if (target.collectionCard) {
                setCatalogCard(null)
                setDetailCard(target.collectionCard)
              } else if (target.hunt) {
                setDetailCard(null)
                setCatalogCard(target.hunt)
              }
            }}
          />
        )
      ) : tab === 'estimation' ? (
        loading ? (
          <p className="state-msg">Chargement des séries…</p>
        ) : error ? (
          <p className="state-msg error">{error}</p>
        ) : (
          <GlobalEstimate sets={trackedSets} cardsBySet={allCardsBySet} getStatus={getStatus} />
        )
      ) : tab === 'listes' ? (
        loading ? (
          <p className="state-msg">Chargement des séries…</p>
        ) : error ? (
          <p className="state-msg error">{error}</p>
        ) : (
          <CustomLists
            sets={trackedSets}
            cardsBySet={allCardsBySet}
            getStatus={getStatus}
            {...customLists}
          />
        )
      ) : (
        <>
          <header
            className={[
              'hero hero-compact panel',
              activeSet?.logo || activeSet?.chaseImage ? 'has-set-theme' : '',
              activeSet?.chaseImage ? 'has-chase' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {activeSet?.chaseImage && (
              <div className="set-theme" aria-hidden="true">
                <img
                  src={activeSet.chaseImage}
                  alt=""
                  className="set-theme-chase"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}

            <div className="hero-compact-main">
              {activeSet?.logo ? (
                <img
                  src={activeSet.logo}
                  alt=""
                  className="set-logo-mark"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    if (activeSet.logoFallback && img.dataset.fallbackTried !== '1') {
                      img.dataset.fallbackTried = '1'
                      img.src = activeSet.logoFallback
                    } else {
                      img.style.display = 'none'
                    }
                  }}
                />
              ) : null}
              <div className="hero-compact-copy">
                <div className="hero-title-row">
                  <h1>{activeSet?.name ?? 'Collection'}</h1>
                  <span className="save-pill">{savedLabel}</span>
                </div>
                <p className="hero-sub">
                  {stats.owned}/{stats.totalSlots} cartes ·{' '}
                  <strong>{money(stats.ownedValue)}</strong> · reste{' '}
                  <strong>{money(stats.missingValue)}</strong>
                </p>
              </div>
              <div
                className="progress-ring progress-ring-sm"
                style={{ ['--p' as string]: `${stats.progress}%` }}
              >
                <strong>{Math.round(stats.progress)}%</strong>
                <span>complétée</span>
              </div>
            </div>

            <div className="hero-tools-bar">
              <div className="hero-tool-actions">
                <button
                  type="button"
                  className={openTool === 'quick' ? 'btn ghost filter-btn-active' : 'btn ghost'}
                  aria-expanded={openTool === 'quick'}
                  onClick={() => setOpenTool((t) => (t === 'quick' ? null : 'quick'))}
                >
                  + Ajout rapide
                </button>
                <button
                  type="button"
                  className={openTool === 'export' ? 'btn ghost filter-btn-active' : 'btn ghost'}
                  aria-expanded={openTool === 'export'}
                  onClick={() => setOpenTool((t) => (t === 'export' ? null : 'export'))}
                >
                  Exporter
                </button>
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() => {
                    if (
                      activeSet &&
                      window.confirm(`Vider toutes tes cartes cochées dans « ${activeSet.name} » ?`)
                    ) {
                      resetSet(activeSet.id)
                    }
                  }}
                >
                  Vider
                </button>
              </div>
            </div>
          </header>

          {openTool === 'quick' && activeSet && (
            <QuickAdd
              cards={cards}
              onApply={(ids, status, variant) => markMany(activeSet.id, ids, status, variant)}
            />
          )}

          {openTool === 'export' && activeSet && (
            <ExportPanel setName={activeSet.name} cards={cards} getStatus={getActiveStatus} />
          )}

          <section className="controls-stack panel" id="grille">
            <div className="status-pills" role="group" aria-label="Filtrer par statut">
              {(
                [
                  ['all', 'Toutes', statusCounts.all],
                  ['owned', 'Possédées', statusCounts.owned],
                  ['missing', 'Manquantes', statusCounts.missing],
                  ['wanted', 'Recherchées', statusCounts.wanted],
                  ...(setHasAnyReverse
                    ? ([
                        ['reverse-missing', 'Reverse manquantes', statusCounts.reverseMissing],
                        ['reverse-owned', 'Reverse possédées', statusCounts.reverseOwned],
                      ] as [FilterStatus, string, number][])
                    : []),
                ] as [FilterStatus, string, number][]
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? 'status-pill active' : 'status-pill'}
                  onClick={() => setFilter(id)}
                >
                  <span>{label}</span>
                  <small>{count}</small>
                </button>
              ))}
            </div>

            <div className="controls-row">
              <label className="search">
                Recherche
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom ou numéro…"
                />
              </label>

              <label>
                Rareté
                <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                  <option value="all">Toutes les raretés</option>
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
                  <option value="pop-asc">PSA 10 : plus rares d’abord</option>
                  <option value="pop-desc">PSA 10 : plus courantes d’abord</option>
                </select>
              </label>

              <div className="density-toggle" role="group" aria-label="Taille des cartes">
                <button
                  type="button"
                  className={density === 'normal' ? 'is-on' : ''}
                  onClick={() => setDensity('normal')}
                >
                  Grandes
                </button>
                <button
                  type="button"
                  className={density === 'compact' ? 'is-on' : ''}
                  onClick={() => setDensity('compact')}
                >
                  Petites
                </button>
              </div>
            </div>

            {hasActiveCollectionFilters && (
              <div className="active-filters-bar" aria-label="Filtres actifs">
                {filter !== 'all' && (
                  <button
                    type="button"
                    className="filter-tag"
                    onClick={() => setFilter('all')}
                  >
                    <span>Statut : {FILTER_STATUS_LABEL[filter]}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                {query.trim() && (
                  <button
                    type="button"
                    className="filter-tag"
                    onClick={() => setQuery('')}
                  >
                    <span>Recherche : « {query.trim()} »</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                {rarity !== 'all' && (
                  <button
                    type="button"
                    className="filter-tag"
                    onClick={() => setRarity('all')}
                  >
                    <span>Rareté : {rarity}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                {sort !== 'number' && (
                  <button
                    type="button"
                    className="filter-tag"
                    onClick={() => setSort('number')}
                  >
                    <span>Tri modifié</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                <button
                  type="button"
                  className="filter-clear-link"
                  onClick={clearCollectionFilters}
                >
                  Effacer les filtres
                </button>
              </div>
            )}
          </section>

          {populationFile && !setHasPopulation && activeSet && (
            <p className="pop-hint">
              Pas encore de population PSA pour {activeSet.name} : les chiffres ne sont pas encore
              publiés.
            </p>
          )}
          {setHasPopulation && populationFile && (
            <div className="pop-hint-wrap">
              <button
                type="button"
                className="pop-hint-toggle"
                aria-expanded={showPopHelp}
                onClick={() => setShowPopHelp((v) => !v)}
              >
                {showPopHelp
                  ? 'Masquer l’aide PSA ▴'
                  : `Recensement PSA${censusLabel ? ` (${censusLabel})` : ''} · Comment lire ces chiffres ? ▾`}
              </button>
              {showPopHelp && (
                <p className="pop-hint">
                  PSA 10 = cartes notées 10/10. Le chiffre « anglais » sert au tri : plus il est
                  petit, plus cette version anglaise est rare. Les cartes notées moins de 100 fois
                  restent en bas du tri « plus rares ».{' '}
                  <a href={populationFile.source} target="_blank" rel="noreferrer">
                    {populationFile.sourceName}
                  </a>
                  {populationFile.frenchFetchedAt && (
                    <>
                      {' '}
                      Le chiffre « français » compte seulement les cartes françaises (relevé du{' '}
                      {formatCensusDate(populationFile.frenchFetchedAt)}
                      {populationFile.frenchSource && (
                        <>
                          {' '}
                          ·{' '}
                          <a href={populationFile.frenchSource} target="_blank" rel="noreferrer">
                            {populationFile.frenchSourceName ?? 'GemRate'}
                          </a>
                        </>
                      )}
                      ).
                    </>
                  )}{' '}
                  La pastille sous la rareté indique la marge : verte pour une marge ouverte, jaune
                  pour à suivre, rouge quand la hausse facile est moins probable.
                </p>
              )}
            </div>
          )}

          {loading && <p className="state-msg">Chargement des séries…</p>}
          {error && <p className="state-msg error">{error}</p>}

          {!loading && activeSet && cards.length > 0 && (
            <>
              <p className="result-count">
                {visible.length} carte{visible.length > 1 ? 's' : ''} affichée
                {visible.length > 1 ? 's' : ''} · valeur de ta collection dans cette série :{' '}
                {money(stats.ownedValue)}
              </p>
              <div className={density === 'compact' ? 'grid grid-compact' : 'grid'}>
                {visible.map(({ card, normalStatus, reverseStatus }) => (
                  <PokemonCardTile
                    key={card.id}
                    card={card}
                    normalStatus={normalStatus}
                    reverseStatus={reverseStatus}
                    onSetStatus={(variant, status) =>
                      setStatus(activeSet.id, card.id, status, variant)
                    }
                    onOpenDetail={() => {
                      setScannedCondition(null)
                      setDetailCard(card)
                    }}
                    population={
                      setHasPopulation
                        ? (populationFile?.cards[card.id]?.printings ?? [])
                        : null
                    }
                    potential={potentialByCardId.get(card.id) ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {catalogCard && (() => {
        const mappedSetId = HUNT_TO_COLLECTION_SET[catalogCard.set.id] ?? catalogCard.set.id
        const mappedCardId =
          HUNT_TO_COLLECTION_SET[catalogCard.set.id] && cardsBySet[mappedSetId]
            ? (cardsBySet[mappedSetId].find((c) => c.number === catalogCard.number)?.id ??
              catalogCard.cardId)
            : catalogCard.cardId
        const variant: CardVariant = /reverse/i.test(catalogCard.printing) ? 'reverse' : 'normal'
        return (
          <CatalogCardSheet
            card={catalogCard}
            highlightedCondition={scannedCondition}
            collectionStatus={getStatus(mappedSetId, mappedCardId, variant)}
            collectionVariantLabel={variant === 'reverse' ? 'Reverse' : 'Normale'}
            onSetCollectionStatus={(next) => setStatus(mappedSetId, mappedCardId, next, variant)}
            onClose={() => {
              setCatalogCard(null)
              setScannedCondition(null)
            }}
          />
        )
      })()}

      {detailCard && (() => {
        const detailPop =
          populationBySet[detailCard.setId] ??
          (detailCard.setId === activeSet?.id ? populationFile : null)
        return (
          <CardDetailSheet
            card={detailCard}
            onClose={() => {
              setDetailCard(null)
              setScannedCondition(null)
            }}
            normalStatus={getStatus(detailCard.setId, detailCard.id, 'normal')}
            reverseStatus={
              detailCard.hasReverse ? getStatus(detailCard.setId, detailCard.id, 'reverse') : 'missing'
            }
            onSetStatus={(variant, next) => setStatus(detailCard.setId, detailCard.id, next, variant)}
            population={detailPop?.cards[detailCard.id]?.printings ?? null}
            rank={
              detailCard.setId === activeSet?.id
                ? (populationRank.rankById.get(detailCard.id) ?? null)
                : null
            }
            comparableCount={
              detailCard.setId === activeSet?.id ? populationRank.comparable : 0
            }
            sourceUrl={detailPop?.source ?? null}
            sourceName={detailPop?.sourceName ?? 'CardPrice'}
            censusDate={latestCensusDate(detailPop)}
            frenchSourceUrl={detailPop?.frenchSource ?? null}
            frenchSourceName={detailPop?.frenchSourceName ?? null}
            frenchCensusDate={detailPop?.frenchFetchedAt ?? null}
            potential={potentialByCardId.get(detailCard.id) ?? null}
            scannedCondition={scannedCondition}
          />
        )
      })()}

      {showScrollTop && (
        <button
          type="button"
          className="scroll-top-btn"
          aria-label="Remonter en haut de la page"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑ Haut
        </button>
      )}

      <BackupPanel />

      <footer className="footer">
        <PokedocLogo compact />
        <p>
          POKEDOC — ta collection, le catalogue des côtes sur toutes les séries, et le scan pour
          reconnaître une carte. Côtes TCGPlayer (converties en euros) et Cardmarket. Collection
          sauvegardée dans ton navigateur. Pour le site en ligne, exporte puis restaure ta sauvegarde.
        </p>
      </footer>
    </div>
  )
}
