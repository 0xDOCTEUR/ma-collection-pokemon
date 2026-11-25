import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  upsideScore,
  cardPageUrl,
  cardPotential,
  catalogSetName,
  catalogSetSearch,
  huntImageUrl,
  huntPrintingLabel,
  INDICATOR_FILTERS,
  languageLabel,
  loadPsaHunt,
  SERIES_ORDER,
  seriesLabel,
  toEur,
  type IndicatorFilterId,
  type PsaHuntCard,
  type PsaHuntData,
} from '../utils/psaHunt'
import { matchesSearchText } from '../utils/frenchNames'
import {
  cardHasGeneration,
  cardHasSpecies,
  frenchCardName,
  GENERATION_OPTIONS,
  mainSpecies,
  pokemonOptions,
  speciesLabel,
} from '../utils/generations'
import { formatCount, formatGemRate, type PsaPrinting } from '../utils/population'
import { sortRarities } from '../utils/rarity'

type LanguageFilter = 'en' | 'ja' | 'fr' | 'all'
type SortMode = 'upside' | 'price' | 'pop' | 'number'
type CardView = 'small' | 'large' | 'list'

const PAGE = 48
const VIEW_KEY = 'pokedoc-hunt-view'

const VIEW_OPTIONS: { id: CardView; label: string }[] = [
  { id: 'small', label: 'Petites' },
  { id: 'large', label: 'Grandes' },
  { id: 'list', label: 'Liste' },
]

function readCardView(): CardView {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'small' || saved === 'large' || saved === 'list') return saved
  } catch {
    /* le navigateur peut bloquer la mémoire locale */
  }
  return 'small'
}

const DEFAULTS = {
  /** Anglais = côtes CardPrice. Le français n’a que le nombre de notes. */
  language: 'en' as LanguageFilter,
  generation: 'all',
  series: 'all',
  setId: 'all',
  query: '',
  pokemon: '',
  rarity: '',
  maxPrice: '',
  minRaw: '',
  maxPsa10: '',
  minPsa10: '',
  minGraded: '',
  pricedOnly: true,
  sort: 'number' as SortMode,
  indicator: 'all' as IndicatorFilterId,
}

function money(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

function readNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Numéro simple d’abord (1, 2, 3…), puis les numéros avec lettres (TG, SV…). */
function compareCardNumber(a: PsaHuntCard, b: PsaHuntCard): number {
  const rank = (value: string) => {
    const text = value.trim()
    const prefixed = text.match(/^([A-Za-z]+)(\d+)/)
    if (prefixed) {
      return { group: 1, prefix: prefixed[1].toUpperCase(), n: Number.parseInt(prefixed[2], 10) }
    }
    const plain = text.match(/\d+/)
    if (plain) return { group: 0, prefix: '', n: Number.parseInt(plain[0], 10) }
    return { group: 2, prefix: text.toUpperCase(), n: Number.POSITIVE_INFINITY }
  }
  const left = rank(a.number)
  const right = rank(b.number)
  return (
    left.group - right.group ||
    left.prefix.localeCompare(right.prefix, 'en') ||
    left.n - right.n ||
    a.number.localeCompare(b.number, 'en', { numeric: true }) ||
    a.printing.localeCompare(b.printing, 'en') ||
    a.name.localeCompare(b.name, 'fr')
  )
}

function formatTypedNumber(value: string): string | null {
  const parsed = readNumber(value)
  if (parsed == null) return null
  return parsed.toLocaleString('fr-FR')
}

function countLabel(count: number): string {
  if (count === 0) return 'Aucune carte'
  if (count === 1) return '1 carte'
  return `${count.toLocaleString('fr-FR')} cartes`
}

function asPrinting(card: PsaHuntCard): PsaPrinting {
  return { label: card.printing, total: card.total, psa10: card.psa10, updatedAt: null }
}

function seriesOrder(series: string): number {
  const index = SERIES_ORDER.indexOf(series)
  return index === -1 ? 999 : index
}

export function PsaHunt({ onOpenCard }: { onOpenCard: (card: PsaHuntCard) => void }) {
  const [data, setData] = useState<PsaHuntData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageFilter>(DEFAULTS.language)
  const [generation, setGeneration] = useState(DEFAULTS.generation)
  const [series, setSeries] = useState(DEFAULTS.series)
  const [setId, setSetId] = useState(DEFAULTS.setId)
  const [query, setQuery] = useState(DEFAULTS.query)
  const [pokemon, setPokemon] = useState(DEFAULTS.pokemon)
  const [rarity, setRarity] = useState(DEFAULTS.rarity)
  const [maxPrice, setMaxPrice] = useState(DEFAULTS.maxPrice)
  const [minRaw, setMinRaw] = useState(DEFAULTS.minRaw)
  const [maxPsa10, setMaxPsa10] = useState(DEFAULTS.maxPsa10)
  const [minPsa10, setMinPsa10] = useState(DEFAULTS.minPsa10)
  const [minGraded, setMinGraded] = useState(DEFAULTS.minGraded)
  const [pricedOnly, setPricedOnly] = useState(DEFAULTS.pricedOnly)
  const [sort, setSort] = useState<SortMode>(DEFAULTS.sort)
  const [indicator, setIndicator] = useState<IndicatorFilterId>(DEFAULTS.indicator)
  const [keepLimits, setKeepLimits] = useState(false)
  const [moreFilters, setMoreFilters] = useState(false)
  const [view, setView] = useState<CardView>(readCardView)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* le choix reste valable pour cette visite */
    }
  }, [view])

  useEffect(() => {
    let cancelled = false
    loadPsaHunt()
      .then((file) => {
        if (!cancelled) setData(file)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Impossible de charger les notes PSA.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setShown(PAGE)
  }, [
    language,
    generation,
    series,
    setId,
    query,
    pokemon,
    rarity,
    maxPrice,
    minRaw,
    maxPsa10,
    minPsa10,
    minGraded,
    pricedOnly,
    sort,
    indicator,
    keepLimits,
  ])

  const seriesOptions = useMemo(() => {
    if (!data) return []
    const present = new Set<string>()
    for (const set of data.sets) {
      if (language !== 'all' && set.language !== language) continue
      present.add(set.series)
    }
    const known = SERIES_ORDER.filter((id) => present.has(id))
    const extra = [...present].filter((id) => !SERIES_ORDER.includes(id)).sort((a, b) => a.localeCompare(b, 'fr'))
    return [...known, ...extra]
  }, [data, language])

  const setOptions = useMemo(() => {
    if (!data) return []
    return data.sets
      .filter((set) => language === 'all' || set.language === language)
      .filter((set) => series === 'all' || set.series === series)
      .slice()
      .sort((a, b) => catalogSetName(a).localeCompare(catalogSetName(b), 'fr'))
  }, [data, language, series])

  useEffect(() => {
    if (series !== 'all' && !seriesOptions.includes(series)) setSeries('all')
  }, [series, seriesOptions])

  useEffect(() => {
    if (setId !== 'all' && !setOptions.some((set) => set.id === setId)) setSetId('all')
  }, [setId, setOptions])

  const choices = useMemo(
    () => pokemonOptions(generation === 'all' ? null : Number(generation)),
    [generation],
  )

  useEffect(() => {
    if (pokemon && !choices.some((option) => option.phrase === pokemon)) setPokemon('')
  }, [pokemon, choices])

  function showAllSeries(name: string) {
    const species = mainSpecies(name)
    if (!species) return
    setPokemon(species)
    setGeneration('all')
    setSeries('all')
    setSetId('all')
    setQuery('')
  }

  function resetFilters() {
    setLanguage(DEFAULTS.language)
    setGeneration(DEFAULTS.generation)
    setSeries(DEFAULTS.series)
    setSetId(DEFAULTS.setId)
    setQuery(DEFAULTS.query)
    setPokemon(DEFAULTS.pokemon)
    setRarity(DEFAULTS.rarity)
    setMaxPrice(DEFAULTS.maxPrice)
    setMinRaw(DEFAULTS.minRaw)
    setMaxPsa10(DEFAULTS.maxPsa10)
    setMinPsa10(DEFAULTS.minPsa10)
    setMinGraded(DEFAULTS.minGraded)
    setPricedOnly(DEFAULTS.pricedOnly)
    setSort(DEFAULTS.sort)
    setIndicator(DEFAULTS.indicator)
    setKeepLimits(false)
  }

  function clearLimits() {
    setMaxPrice('')
    setMinRaw('')
    setMaxPsa10('')
    setMinPsa10('')
    setMinGraded('')
    setPricedOnly(false)
    setKeepLimits(true)
  }

  const precise = pokemon !== '' || query.trim() !== ''
  const relaxed = precise && !keepLimits
  const browsingSet = setId !== 'all'
  const activeSort: SortMode = sort

  const matches = useMemo(() => {
    if (!data) return []
    const searching = query.trim().length > 0
    const priceCap = readNumber(maxPrice)
    const rawFloor = readNumber(minRaw)
    const popCap = readNumber(maxPsa10)
    const popFloor = readNumber(minPsa10)
    const gradedFloor = readNumber(minGraded)
    const focused = pokemon !== ''
    // Une série choisie : on montre toute la série, sans cacher les cartes sans prix.
    const skipLimits = (browsingSet && !keepLimits) || ((focused || searching) && !keepLimits)
    const frenchView = language === 'fr'

    const list = data.cards.filter((card) => {
      if (language === 'all' && card.set.language === 'fr') return false
      if (language !== 'all' && card.set.language !== language) return false
      if (focused && !cardHasSpecies(card.name, pokemon)) return false
      if (
        !focused &&
        !browsingSet &&
        generation !== 'all' &&
        !cardHasGeneration(card.name, Number(generation))
      ) {
        return false
      }
      if (series !== 'all' && card.set.series !== series) return false
      if (setId !== 'all' && card.set.id !== setId) return false
      if (rarity && card.rarity !== rarity) return false
      if (
        searching &&
        !matchesSearchText(
          `${card.name} ${card.number} ${card.rarity} ${catalogSetSearch(card.set)}`,
          query,
        )
      ) {
        return false
      }
      if (indicator !== 'all') {
        const potential = cardPotential(
          card.psa10,
          card.total,
          toEur(card.psa10Usd),
          toEur(card.rawUsd),
        )
        if (potential.title !== indicator) return false
      }
      if (skipLimits) return true
      if (gradedFloor != null && card.total < gradedFloor) return false
      if (popFloor != null && card.psa10 < popFloor) return false
      if (!frenchView) {
        const price = toEur(card.psa10Usd)
        const raw = toEur(card.rawUsd)
        if (pricedOnly && price == null) return false
        if (priceCap != null && (price == null || price > priceCap)) return false
        if (rawFloor != null && (raw == null || raw < rawFloor)) return false
      }
      if (popCap != null && card.psa10 > popCap) return false
      return true
    })

    const bySort = (a: PsaHuntCard, b: PsaHuntCard) => {
      if (activeSort === 'number') return compareCardNumber(a, b)
      if (activeSort === 'pop') {
        return a.psa10 - b.psa10 || a.total - b.total || a.name.localeCompare(b.name, 'fr')
      }
      const priceA = toEur(a.psa10Usd)
      const priceB = toEur(b.psa10Usd)
      const rawA = toEur(a.rawUsd)
      const rawB = toEur(b.rawUsd)
      if (activeSort === 'price') {
        if (priceA == null && priceB == null) return a.psa10 - b.psa10
        if (priceA == null) return 1
        if (priceB == null) return -1
        return priceA - priceB || a.psa10 - b.psa10
      }
      const scoreA = priceA != null && rawA != null ? upsideScore(a.psa10, a.total, priceA, rawA) : -1
      const scoreB = priceB != null && rawB != null ? upsideScore(b.psa10, b.total, priceB, rawB) : -1
      return scoreB - scoreA || a.psa10 - b.psa10
    }

    list.sort((a, b) => {
      if (browsingSet) return bySort(a, b)
      if (focused) {
        const order = seriesOrder(a.set.series) - seriesOrder(b.set.series)
        if (order !== 0) return order
      }
      if (!focused && activeSort === 'number') {
        const setOrder = catalogSetName(a.set).localeCompare(catalogSetName(b.set), 'fr')
        if (setOrder !== 0) return setOrder
      }
      return bySort(a, b)
    })
    return list
  }, [
    data,
    language,
    generation,
    series,
    setId,
    query,
    pokemon,
    rarity,
    maxPrice,
    minRaw,
    maxPsa10,
    minPsa10,
    minGraded,
    pricedOnly,
    activeSort,
    keepLimits,
    browsingSet,
    indicator,
  ])

  const visible = browsingSet ? matches : matches.slice(0, shown)
  const pokemonName = pokemon ? speciesLabel(pokemon) : ''
  const selectedSet = data?.sets.find((set) => set.id === setId) ?? null

  const rarityOptions = useMemo(() => {
    if (!data) return []
    const present = new Set<string>()
    for (const card of data.cards) {
      if (language === 'all' && card.set.language === 'fr') continue
      if (language !== 'all' && card.set.language !== language) continue
      if (series !== 'all' && card.set.series !== series) continue
      if (setId !== 'all' && card.set.id !== setId) continue
      if (card.rarity) present.add(card.rarity)
    }
    return sortRarities([...present])
  }, [data, language, series, setId])

  useEffect(() => {
    if (rarity && data && !rarityOptions.includes(rarity)) setRarity('')
  }, [rarity, rarityOptions, data])

  const frenchView = language === 'fr'
  const limitBits = [
    !frenchView && formatTypedNumber(maxPrice) ? `note 10 jusqu’à ${formatTypedNumber(maxPrice)} €` : '',
    !frenchView && formatTypedNumber(minRaw) ? `sans note à partir de ${formatTypedNumber(minRaw)} €` : '',
    formatTypedNumber(minPsa10) ? `au moins ${formatTypedNumber(minPsa10)} notes 10` : '',
    formatTypedNumber(maxPsa10) ? `au plus ${formatTypedNumber(maxPsa10)} notes 10` : '',
    formatTypedNumber(minGraded) ? `au moins ${formatTypedNumber(minGraded)} cartes notées` : '',
    !frenchView && pricedOnly ? 'cartes sans prix cachées' : '',
  ].filter(Boolean)

  function emptyMessage(): string {
    if (rarity && !pokemon && !query.trim()) {
      return `Aucune carte « ${rarity} » pour cette sélection. Remets Rareté sur Toutes les raretés.`
    }
    if (pokemon) {
      if (!relaxed && limitBits.length > 0) {
        return `Aucune carte de ${pokemonName} avec ces limites. Ouvre Filtres pour les élargir, ou clique sur Voir toutes les versions.`
      }
      return `Aucune carte de ${pokemonName} pour cette version. Ouvre Filtres et change Version (impression).`
    }
    if (query.trim()) {
      if (!relaxed && limitBits.length > 0) {
        return 'Aucune carte pour ce nom avec ces limites. Ouvre Filtres pour les élargir, ou clique sur Voir toutes les versions.'
      }
      if (generation !== 'all') {
        return 'Aucune carte de cette génération pour ce nom. Remets Génération sur Toutes.'
      }
      return 'Aucune carte pour ce nom. Essaie Dracaufeu, Mewtwo, ou un numéro.'
    }
    if (generation !== 'all') {
      return 'Aucune carte de cette génération avec ces limites. Ouvre Filtres et remets Génération sur Toutes, ou clique sur Enlever les limites.'
    }
    return 'Aucune carte avec ces limites. Ouvre Filtres pour les changer, ou clique sur Enlever les limites.'
  }

  if (error) return <p className="state-msg error">{error}</p>
  if (!data) return <p className="state-msg">Chargement des notes PSA…</p>

  const advancedCount = [
    generation !== 'all',
    language !== DEFAULTS.language,
    maxPrice.trim() !== '',
    minRaw.trim() !== '',
    minPsa10.trim() !== '',
    maxPsa10.trim() !== '',
    minGraded.trim() !== '',
  ].filter(Boolean).length

  const activeChips: { id: string; label: string; clear: () => void }[] = []
  if (selectedSet) {
    activeChips.push({
      id: 'set',
      label: `Série : ${catalogSetName(selectedSet)}`,
      clear: () => setSetId('all'),
    })
  }
  if (series !== 'all') {
    activeChips.push({
      id: 'series',
      label: `Période : ${seriesLabel(series)}`,
      clear: () => {
        setSeries('all')
        setSetId('all')
      },
    })
  }
  if (indicator !== 'all') {
    activeChips.push({
      id: 'indicator',
      label: `Indicateur : ${indicator}`,
      clear: () => setIndicator('all'),
    })
  }
  if (query.trim()) {
    activeChips.push({
      id: 'query',
      label: `Recherche : « ${query.trim()} »`,
      clear: () => setQuery(''),
    })
  }
  if (pokemon) {
    activeChips.push({
      id: 'pokemon',
      label: `Pokémon : ${pokemonName}`,
      clear: () => setPokemon(''),
    })
  }
  if (rarity) {
    activeChips.push({
      id: 'rarity',
      label: `Rareté : ${rarity}`,
      clear: () => setRarity(''),
    })
  }
  if (generation !== 'all') {
    const genLabel = GENERATION_OPTIONS.find((g) => String(g.id) === generation)?.label ?? generation
    activeChips.push({
      id: 'gen',
      label: `Génération : ${genLabel}`,
      clear: () => setGeneration('all'),
    })
  }
  if (language !== DEFAULTS.language) {
    activeChips.push({
      id: 'lang',
      label: `Version : ${language === 'all' ? 'EN + JP' : languageLabel(language)}`,
      clear: () => setLanguage(DEFAULTS.language),
    })
  }

  return (
    <section className="hunt">
      <form className="panel hunt-form" onSubmit={(event) => event.preventDefault()}>
        <div className="hunt-series-bar">
          <label className="hunt-series-pick">
            <span>Série</span>
            <select
              value={setId}
              onChange={(event) => {
                const next = event.target.value
                setSetId(next)
                if (next !== 'all') {
                  setGeneration('all')
                  setSort('number')
                  setPricedOnly(false)
                  setKeepLimits(false)
                }
              }}
            >
              <option value="all">Toutes les séries ({setOptions.length})</option>
              {setOptions.map((set) => (
                <option key={set.id} value={set.id}>
                  {catalogSetName(set)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Période</span>
            <select
              value={series}
              onChange={(event) => {
                setSeries(event.target.value)
                setSetId('all')
              }}
            >
              <option value="all">Toutes les périodes</option>
              {seriesOptions.map((id) => (
                <option key={id} value={id}>
                  {seriesLabel(id)}
                </option>
              ))}
            </select>
          </label>
          {browsingSet && (
            <p className="hunt-series-hint">
              {rarity
                ? `Cartes « ${rarity} ». Tu peux changer l’ordre ou filtrer par indicateur ci-dessous.`
                : 'Série complète affichée. Clique une image pour voir les côtes ou l’ajouter à ta collection.'}
            </p>
          )}
        </div>

        <div className="hunt-indicators" role="group" aria-label="Filtrer par indicateur">
          <span className="hunt-indicators-label">Indicateur</span>
          {INDICATOR_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={[
                'hunt-indicator',
                option.level ? `is-${option.level}` : 'is-all',
                indicator === option.id ? 'is-on' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={indicator === option.id}
              onClick={() => setIndicator(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="hunt-row hunt-main">
          <label>
            <span>Recherche</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Dracaufeu, illustration rare, 199…"
            />
          </label>
          <label>
            <span>Pokémon</span>
            <select
              value={pokemon}
              onChange={(event) => setPokemon(event.target.value)}
            >
              <option value="">Tous les Pokémon</option>
              {choices.map((option) => (
                <option key={option.phrase} value={option.phrase}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rareté</span>
            <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
              <option value="">Toutes les raretés</option>
              {rarityOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ordre</span>
            <select
              value={activeSort}
              onChange={(event) => setSort(event.target.value as SortMode)}
            >
              <option value="number">Numéro dans la série</option>
              <option value="upside">Les plus intéressantes</option>
              <option value="price">Note 10 la moins chère</option>
              <option value="pop">Le moins de notes 10</option>
            </select>
          </label>
        </div>

        {activeChips.length > 0 && (
          <div className="active-filters-bar" aria-label="Filtres actifs">
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="filter-tag"
                onClick={chip.clear}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="filter-clear-link" onClick={resetFilters}>
              Tout effacer
            </button>
          </div>
        )}

        {precise && relaxed && (
          <div className="hunt-notice">
            <p>Recherche précise : les limites de prix et de notes sont mises de côté.</p>
            <button type="button" className="btn ghost" onClick={() => setKeepLimits(true)}>
              Garder les limites
            </button>
          </div>
        )}
        {precise && keepLimits && (
          <div className="hunt-notice">
            <p>Les limites restent actives pour cette recherche.</p>
            <button type="button" className="btn ghost" onClick={() => setKeepLimits(false)}>
              Voir toutes les versions
            </button>
          </div>
        )}

        {moreFilters && (
          <fieldset className="hunt-group">
            <legend>Filtres</legend>
            <p className="hunt-group-help">
              Vide une case pour enlever sa limite.
            </p>
            <div className="hunt-row hunt-pick">
              <label>
                <span>Génération</span>
                <select
                  value={generation}
                  disabled={browsingSet}
                  onChange={(event) => setGeneration(event.target.value)}
                >
                  <option value="all">Toutes</option>
                  {GENERATION_OPTIONS.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Version (impression)</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as LanguageFilter)}
                >
                  <option value="en">Anglaise — avec côtes</option>
                  <option value="ja">Japonaise — avec côtes</option>
                  <option value="all">Anglaise et japonaise</option>
                  <option value="fr">Française — notes seulement, sans côtes</option>
                </select>
              </label>
            </div>
            {language === 'fr' && (
              <p className="hunt-group-help">
                La version française donne le nombre de notes PSA, pas les prix marché. Pour voir les
                côtes, choisis la version anglaise.
              </p>
            )}
            <div className="hunt-row hunt-limits">
              <label>
                <span>Prix max, note 10 (€)</span>
                <input
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Pas de maximum"
                />
              </label>
              <label>
                <span>Prix min, sans note (€)</span>
                <input
                  inputMode="decimal"
                  value={minRaw}
                  onChange={(event) => setMinRaw(event.target.value)}
                  placeholder="Pas de minimum"
                />
              </label>
              <label>
                <span>Notes 10, minimum</span>
                <input
                  inputMode="numeric"
                  value={minPsa10}
                  onChange={(event) => setMinPsa10(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                <span>Notes 10, maximum</span>
                <input
                  inputMode="numeric"
                  value={maxPsa10}
                  onChange={(event) => setMaxPsa10(event.target.value)}
                  placeholder="Pas de maximum"
                />
              </label>
              <label>
                <span>Cartes déjà notées, minimum</span>
                <input
                  inputMode="numeric"
                  value={minGraded}
                  onChange={(event) => setMinGraded(event.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <label className="hunt-check">
              <input
                type="checkbox"
                checked={pricedOnly}
                onChange={(event) => setPricedOnly(event.target.checked)}
              />
              Cacher les cartes sans prix
            </label>
          </fieldset>
        )}

        <div className="hunt-foot">
          <p className="hunt-count">
            <small>
              {countLabel(matches.length)}
              {selectedSet
                ? ` · ${catalogSetName(selectedSet)} · dans l’ordre des numéros`
                : pokemon
                  ? ` · ${pokemonName}`
                  : query.trim()
                    ? ` · « ${query.trim()} »`
                    : ''}
              {rarity ? ` · ${rarity}` : ''}
              {indicator !== 'all' ? ` · ${indicator}` : ''}
              {relaxed
                ? ' · limites mises de côté'
                : limitBits.length > 0
                  ? ` · ${limitBits.join(' · ')}`
                  : ''}
              {' · '}
              Relevés du {formatDay(data.fetchedAt)} ({data.sourceName})
            </small>
          </p>
          <div className="hunt-actions">
            <button
              type="button"
              className={moreFilters || advancedCount > 0 ? 'btn ghost filter-btn-active' : 'btn ghost'}
              aria-expanded={moreFilters}
              onClick={() => setMoreFilters((open) => !open)}
            >
              {moreFilters
                ? 'Fermer les filtres avancés'
                : `Filtres avancés${advancedCount > 0 ? ` (${advancedCount})` : ''}`}
            </button>
            <button type="button" className="btn ghost" onClick={clearLimits}>
              Enlever les limites
            </button>
            <button type="button" className="btn ghost" onClick={resetFilters}>
              Tout réinitialiser
            </button>
          </div>
        </div>
      </form>

      {matches.length === 0 ? (
        <p className="panel state-msg">{emptyMessage()}</p>
      ) : (
        <div className="panel hunt-results">
          {browsingSet ? (
            <div className="hunt-binder">
              {matches.map((card) => {
                const image = huntImageUrl(card)
                const price = toEur(card.psa10Usd) ?? toEur(card.rawUsd)
                const label = frenchCardName(card.name)
                return (
                  <button
                    key={card.key}
                    type="button"
                    className="hunt-binder-card"
                    onClick={() => onOpenCard(card)}
                    aria-label={`Carte ${card.number || ''} ${label}`}
                  >
                    {image ? (
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <span className="binder-fallback" aria-hidden="true" />
                    )}
                    <span className="binder-num">#{card.number || '—'}</span>
                    <strong>{label}</strong>
                    {card.rarity ? <em>{card.rarity}</em> : null}
                    {card.printing ? <em>{huntPrintingLabel(card.printing)}</em> : null}
                    <small>{money(price)}</small>
                  </button>
                )
              })}
            </div>
          ) : (
            <>
          <div className="hunt-toolbar">
            <div className="hunt-view" role="group" aria-label="Affichage des cartes">
              <span>Affichage</span>
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={view === option.id ? 'is-on' : ''}
                  aria-pressed={view === option.id}
                  onClick={() => setView(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p>
              {view === 'list'
                ? 'Une carte par ligne, pour lire le nom et les prix plus vite.'
                : view === 'large'
                  ? 'Image plus grande, pour mieux reconnaître la carte.'
                  : 'Plusieurs cartes par ligne.'}
            </p>
          </div>
          <div className={`hunt-grid is-${view}`}>
            {visible.map((card, index) => {
              const image = huntImageUrl(card)
              const pageUrl = cardPageUrl(card.slug)
              const psaPrice = toEur(card.psa10Usd)
              const rawPrice = toEur(card.rawUsd)
              const potential = cardPotential(card.psa10, card.total, psaPrice, rawPrice)
              const species = mainSpecies(card.name)
              const seriesChanged =
                pokemon !== '' && (index === 0 || visible[index - 1].set.series !== card.set.series)
              const seriesTotal = seriesChanged
                ? matches.filter((item) => item.set.series === card.set.series).length
                : 0
              return (
                <Fragment key={card.key}>
                  {seriesChanged && (
                    <h3 className="hunt-series">
                      {seriesLabel(card.set.series)} · {countLabel(seriesTotal)}
                    </h3>
                  )}
                  <article className="hunt-card is-openable">
                    <button
                      type="button"
                      className="hunt-card-open"
                      onClick={() => onOpenCard(card)}
                      aria-label={`Voir les côtes de ${frenchCardName(card.name)}`}
                    >
                      {image ? (
                        <img src={image} alt="" loading="lazy" />
                      ) : (
                        <div className="hunt-fallback" aria-hidden="true" />
                      )}
                      <div className="hunt-body">
                        <p className="tile-num">
                          #{card.number || '—'} · {catalogSetName(card.set)}
                          {language === 'all' ? ` · ${languageLabel(card.set.language)}` : ''}
                        </p>
                        <h3>{frenchCardName(card.name)}</h3>
                        <p className="tile-meta">
                          {card.rarity ? `${card.rarity} · ` : ''}
                          {seriesLabel(card.set.series)} · {huntPrintingLabel(card.printing)}
                        </p>
                        {card.total > 0 ? (
                          <p className="hunt-pop">
                            {formatCount(card.psa10)} exemplaires notés 10
                            <span>
                              sur {formatCount(card.total)} cartes notées (
                              {formatGemRate(asPrinting(card))})
                            </span>
                          </p>
                        ) : (
                          <p className="hunt-pop">Recensement PSA pas encore publié</p>
                        )}
                        <p className="hunt-prices">
                          <span>
                            <small>Côte notée 10</small>
                            <strong>{money(psaPrice)}</strong>
                          </span>
                          <span>
                            <small>Côte sans note</small>
                            <strong>{money(rawPrice)}</strong>
                          </span>
                        </p>
                        <p className={`hunt-potential is-${potential.level}`}>
                          <strong>{potential.title}</strong>
                          <span>{potential.reason}</span>
                        </p>
                      </div>
                    </button>
                    <div className="hunt-links">
                      <button type="button" className="hunt-all-series" onClick={() => onOpenCard(card)}>
                        Voir les côtes
                      </button>
                      <a href={pageUrl} target="_blank" rel="noreferrer">
                        {pageUrl.includes('better-pop.com') ? 'Recensement' : 'Source'}
                      </a>
                      {species && species !== pokemon && (
                        <button
                          type="button"
                          className="hunt-all-series"
                          onClick={() => showAllSeries(card.name)}
                        >
                          Toutes les cartes de {speciesLabel(species)}
                        </button>
                      )}
                    </div>
                  </article>
                </Fragment>
              )
            })}
          </div>
            </>
          )}
        </div>
      )}

      {!browsingSet && shown < matches.length && (
        <button type="button" className="btn ghost hunt-more" onClick={() => setShown((count) => count + PAGE)}>
          Afficher {Math.min(PAGE, matches.length - shown).toLocaleString('fr-FR')} cartes de plus
        </button>
      )}
    </section>
  )
}
