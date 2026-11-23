import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  upsideScore,
  cardPageUrl,
  cardPotential,
  huntImageUrl,
  huntPrintingLabel,
  languageLabel,
  loadPsaHunt,
  SERIES_ORDER,
  seriesLabel,
  toEur,
  type PsaHuntCard,
  type PsaHuntData,
} from '../utils/psaHunt'
import { foldName, searchNeedles } from '../utils/frenchNames'
import {
  cardHasGeneration,
  cardHasSpecies,
  GENERATION_OPTIONS,
  mainSpecies,
  pokemonOptions,
  speciesLabel,
} from '../utils/generations'
import { formatCount, formatGemRate, type PsaPrinting } from '../utils/population'

type LanguageFilter = 'en' | 'ja' | 'fr' | 'all'
type SortMode = 'upside' | 'price' | 'pop'
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
  language: 'en' as LanguageFilter,
  generation: 'all',
  series: 'all',
  setId: 'all',
  query: '',
  pokemon: '',
  maxPrice: '150',
  minRaw: '8',
  maxPsa10: '2500',
  minPsa10: '40',
  minGraded: '150',
  pricedOnly: true,
  sort: 'upside' as SortMode,
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

export function PsaHunt() {
  const [data, setData] = useState<PsaHuntData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageFilter>(DEFAULTS.language)
  const [generation, setGeneration] = useState(DEFAULTS.generation)
  const [series, setSeries] = useState(DEFAULTS.series)
  const [setId, setSetId] = useState(DEFAULTS.setId)
  const [query, setQuery] = useState(DEFAULTS.query)
  const [pokemon, setPokemon] = useState(DEFAULTS.pokemon)
  const [maxPrice, setMaxPrice] = useState(DEFAULTS.maxPrice)
  const [minRaw, setMinRaw] = useState(DEFAULTS.minRaw)
  const [maxPsa10, setMaxPsa10] = useState(DEFAULTS.maxPsa10)
  const [minPsa10, setMinPsa10] = useState(DEFAULTS.minPsa10)
  const [minGraded, setMinGraded] = useState(DEFAULTS.minGraded)
  const [pricedOnly, setPricedOnly] = useState(DEFAULTS.pricedOnly)
  const [sort, setSort] = useState<SortMode>(DEFAULTS.sort)
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
    maxPrice,
    minRaw,
    maxPsa10,
    minPsa10,
    minGraded,
    pricedOnly,
    sort,
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
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
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
    setMaxPrice(DEFAULTS.maxPrice)
    setMinRaw(DEFAULTS.minRaw)
    setMaxPsa10(DEFAULTS.maxPsa10)
    setMinPsa10(DEFAULTS.minPsa10)
    setMinGraded(DEFAULTS.minGraded)
    setPricedOnly(DEFAULTS.pricedOnly)
    setSort(DEFAULTS.sort)
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

  const matches = useMemo(() => {
    if (!data) return []
    const needles = searchNeedles(query)
    const searching = needles.length > 0
    const priceCap = readNumber(maxPrice)
    const rawFloor = readNumber(minRaw)
    const popCap = readNumber(maxPsa10)
    const popFloor = readNumber(minPsa10)
    const gradedFloor = readNumber(minGraded)
    const focused = pokemon !== ''
    const skipLimits = (focused || searching) && !keepLimits
    const frenchView = language === 'fr'

    const list = data.cards.filter((card) => {
      if (language === 'all' && card.set.language === 'fr') return false
      if (language !== 'all' && card.set.language !== language) return false
      if (focused && !cardHasSpecies(card.name, pokemon)) return false
      if (!focused && generation !== 'all' && !cardHasGeneration(card.name, Number(generation))) return false
      if (series !== 'all' && card.set.series !== series) return false
      if (setId !== 'all' && card.set.id !== setId) return false
      if (searching) {
        const haystack = foldName(`${card.name} ${card.number} ${card.set.name}`)
        if (!needles.some((needle) => haystack.includes(needle))) return false
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
      if (sort === 'pop') return a.psa10 - b.psa10 || a.total - b.total || a.name.localeCompare(b.name, 'fr')
      const priceA = toEur(a.psa10Usd)
      const priceB = toEur(b.psa10Usd)
      const rawA = toEur(a.rawUsd)
      const rawB = toEur(b.rawUsd)
      if (sort === 'price') {
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
      if (focused) {
        const order = seriesOrder(a.set.series) - seriesOrder(b.set.series)
        if (order !== 0) return order
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
    maxPrice,
    minRaw,
    maxPsa10,
    minPsa10,
    minGraded,
    pricedOnly,
    sort,
    keepLimits,
  ])

  const visible = matches.slice(0, shown)
  const pokemonName = pokemon ? speciesLabel(pokemon) : ''

  const frenchView = language === 'fr'
  const limitBits = [
    !frenchView && formatTypedNumber(maxPrice) ? `note 10 jusqu’à ${formatTypedNumber(maxPrice)} €` : '',
    !frenchView && formatTypedNumber(minRaw) ? `sans note à partir de ${formatTypedNumber(minRaw)} €` : '',
    formatTypedNumber(minPsa10) ? `au moins ${formatTypedNumber(minPsa10)} notes 10` : '',
    formatTypedNumber(maxPsa10) ? `au plus ${formatTypedNumber(maxPsa10)} notes 10` : '',
    formatTypedNumber(minGraded) ? `au moins ${formatTypedNumber(minGraded)} cartes notées` : '',
    !frenchView && pricedOnly ? 'cartes sans prix cachées' : '',
  ].filter(Boolean)

  const scope =
    pokemon && series === 'all' && setId === 'all'
      ? ' Toutes les périodes sont affichées.'
      : ''

  function emptyMessage(): string {
    if (pokemon) {
      if (!relaxed && limitBits.length > 0) {
        return `Aucune carte de ${pokemonName} avec ces limites. Ouvre Filtres pour les élargir, ou clique sur Voir toutes les versions.`
      }
      return `Aucune carte de ${pokemonName} dans cette langue. Choisis Anglais et japonais dans Langue.`
    }
    if (query.trim()) {
      if (!relaxed && limitBits.length > 0) {
        return 'Aucune carte pour ce nom avec ces limites. Ouvre Filtres pour les élargir, ou clique sur Voir toutes les versions.'
      }
      if (generation !== 'all') {
        return 'Aucune carte de cette génération pour ce nom. Remets Génération sur Toutes.'
      }
      return 'Aucune carte pour ce nom. Essaie le nom anglais, par exemple Charizard.'
    }
    if (generation !== 'all') {
      return 'Aucune carte de cette génération avec ces limites. Ouvre Filtres et remets Génération sur Toutes, ou clique sur Enlever les limites.'
    }
    return 'Aucune carte avec ces limites. Ouvre Filtres pour les changer, ou clique sur Enlever les limites.'
  }

  if (error) return <p className="state-msg error">{error}</p>
  if (!data) return <p className="state-msg">Chargement des notes PSA…</p>

  return (
    <section className="hunt">
      <div className="panel hunt-intro">
        <h2>Cartes notées 10 qui peuvent encore monter</h2>
        <p>
          Une PSA 10, c’est une carte notée 10 sur 10 : la note parfaite. La liste met en premier
          les cartes que les gens achètent déjà, dont il reste peu d’exemplaires notés 10, et dont
          cette note n’est pas déjà beaucoup plus chère que la même carte sans note. Personne ne
          peut promettre que le prix va monter.
        </p>
        <ul className="hunt-legend">
          <li>
            <strong>Marge ouverte</strong> — les trois signes en même temps : des gens achètent déjà
            la carte sans note, les notes 10 restent peu nombreuses, et cette note n’est pas encore
            hors de prix. Ce n’est pas une promesse que le prix va monter.
          </li>
          <li>
            <strong>À suivre</strong> — un de ces signes manque.
          </li>
          <li>
            <strong>Déjà chère, déjà courante ou peu demandée</strong> — la hausse facile est moins
            probable.
          </li>
          <li>
            <strong>Note 10</strong> — prix d’un exemplaire déjà noté 10.
          </li>
          <li>
            <strong>Sans note</strong> — prix de la même carte, pas encore envoyée pour être notée.
          </li>
          <li>
            <strong>Anglais</strong> — notes et prix des cartes anglaises.
          </li>
          <li>
            <strong>Français</strong> — nombre de notes PSA des cartes françaises. Pas de prix dans
            cette source. La quantité imprimée n’est pas la même qu’en anglais.
          </li>
        </ul>
        <p className="hunt-source">
          Prix d’abord en dollars, puis convertis en euros. Relevés du {formatDay(data.fetchedAt)}.{' '}
          <a href={data.source} target="_blank" rel="noreferrer">
            {data.sourceName}
          </a>
          {data.frenchFetchedAt && data.frenchSource && (
            <>
              {' '}
              Notes françaises du {formatDay(data.frenchFetchedAt)}.{' '}
              <a href={data.frenchSource} target="_blank" rel="noreferrer">
                {data.frenchSourceName ?? 'GemRate'}
              </a>
            </>
          )}
        </p>
      </div>

      <form className="panel hunt-form" onSubmit={(event) => event.preventDefault()}>
        <div className="hunt-row hunt-main">
          <label>
            <span>Recherche</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Dracaufeu, Mewtwo, 199…"
            />
          </label>
          <label>
            <span>Pokémon</span>
            <select
              value={pokemon}
              onChange={(event) => {
                const next = event.target.value
                setPokemon(next)
                if (next) {
                  setSeries('all')
                  setSetId('all')
                  setQuery('')
                }
              }}
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
            <span>Langue</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageFilter)}>
              <option value="en">Anglais</option>
              <option value="ja">Japonais</option>
              <option value="fr">Français</option>
              <option value="all">Anglais et japonais</option>
            </select>
          </label>
          <label>
            <span>Ordre</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="upside">Les plus intéressantes</option>
              <option value="price">Note 10 la moins chère</option>
              <option value="pop">Le moins de notes 10</option>
            </select>
          </label>
        </div>

        {language === 'fr' && (
          <div className="hunt-notice">
            <p>
              Langue française : on a le nombre de notes PSA, pas les prix. Les limites de prix sont
              mises de côté. Les limites de nombre de notes restent. Sans prix, l’ordre « les plus
              intéressantes » classe par le plus petit nombre de notes 10.
            </p>
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
                <select value={generation} onChange={(event) => setGeneration(event.target.value)}>
                  <option value="all">Toutes</option>
                  {GENERATION_OPTIONS.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Période</span>
                <select value={series} onChange={(event) => setSeries(event.target.value)}>
                  <option value="all">Toutes les périodes</option>
                  {seriesOptions.map((id) => (
                    <option key={id} value={id}>
                      {seriesLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Série</span>
                <select value={setId} onChange={(event) => setSetId(event.target.value)}>
                  <option value="all">Toutes les séries ({setOptions.length})</option>
                  {setOptions.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
            {pokemon
              ? `${countLabel(matches.length)} de ${pokemonName}.`
              : query.trim()
                ? `${countLabel(matches.length)} pour « ${query.trim()} ».`
                : `${countLabel(matches.length)}.`}
            {scope}
            {matches.length > visible.length
              ? ` ${countLabel(visible.length)} à l’écran, le bouton en bas charge la suite.`
              : ''}
            <small>
              {relaxed
                ? 'Limites de prix et de notes mises de côté.'
                : limitBits.length > 0
                  ? `Limites : ${limitBits.join(' · ')}.`
                  : 'Aucune limite de prix ni de notes.'}
            </small>
          </p>
          <div className="hunt-actions">
            <button
              type="button"
              className="btn ghost"
              aria-expanded={moreFilters}
              onClick={() => setMoreFilters((open) => !open)}
            >
              {moreFilters ? 'Fermer les filtres' : 'Filtres'}
            </button>
            <button type="button" className="btn ghost" onClick={clearLimits}>
              Enlever les limites
            </button>
            <button type="button" className="btn ghost" onClick={resetFilters}>
              Filtres d’origine
            </button>
          </div>
        </div>
      </form>

      {matches.length === 0 ? (
        <p className="panel state-msg">{emptyMessage()}</p>
      ) : (
        <div className="panel hunt-results">
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
                  <article className="hunt-card">
                    {image ? (
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <div className="hunt-fallback" aria-hidden="true" />
                    )}
                    <div className="hunt-body">
                      <p className="tile-num">
                        #{card.number || '—'} · {card.set.name}
                        {language === 'all' ? ` · ${languageLabel(card.set.language)}` : ''}
                      </p>
                      <h3>{card.name}</h3>
                      <p className="tile-meta">
                        {seriesLabel(card.set.series)} · {huntPrintingLabel(card.printing)}
                      </p>
                      <p className="hunt-pop">
                        {formatCount(card.psa10)} exemplaires notés 10
                        <span>
                          sur {formatCount(card.total)} cartes notées ({formatGemRate(asPrinting(card))})
                        </span>
                      </p>
                      <p className="hunt-prices">
                        <span>
                          <small>Exemplaire noté 10</small>
                          <strong>{money(psaPrice)}</strong>
                        </span>
                        <span>
                          <small>Carte sans note</small>
                          {money(rawPrice)}
                        </span>
                      </p>
                      <p className={`hunt-potential is-${potential.level}`}>
                        <strong>{potential.title}</strong>
                        <span>{potential.reason}</span>
                      </p>
                      <div className="hunt-links">
                        <a href={pageUrl} target="_blank" rel="noreferrer">
                          {pageUrl.includes('better-pop.com') ? 'Voir le recensement' : 'Ouvrir la fiche'}
                        </a>
                        {species && species !== pokemon && (
                          <button type="button" className="hunt-all-series" onClick={() => showAllSeries(card.name)}>
                            Toutes les cartes de {speciesLabel(species)}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {shown < matches.length && (
        <button type="button" className="btn ghost hunt-more" onClick={() => setShown((count) => count + PAGE)}>
          Afficher {Math.min(PAGE, matches.length - shown).toLocaleString('fr-FR')} cartes de plus
        </button>
      )}
    </section>
  )
}
