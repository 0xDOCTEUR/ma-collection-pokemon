import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  upsideScore,
  cardImageUrl,
  cardPageUrl,
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

type LanguageFilter = 'en' | 'ja' | 'all'
type SortMode = 'upside' | 'price' | 'pop'

const PAGE = 48

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

function asPrinting(card: PsaHuntCard): PsaPrinting {
  return { label: card.printing, total: card.total, psa10: card.psa10, updatedAt: null }
}

export function PsaHunt() {
  const [data, setData] = useState<PsaHuntData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageFilter>('en')
  const [generation, setGeneration] = useState('all')
  const [series, setSeries] = useState('all')
  const [setId, setSetId] = useState('all')
  const [query, setQuery] = useState('')
  const [pokemon, setPokemon] = useState('')
  const [maxPrice, setMaxPrice] = useState('150')
  const [minRaw, setMinRaw] = useState('8')
  const [maxPsa10, setMaxPsa10] = useState('2500')
  const [minPsa10, setMinPsa10] = useState('40')
  const [pricedOnly, setPricedOnly] = useState(true)
  const [sort, setSort] = useState<SortMode>('upside')
  const [shown, setShown] = useState(PAGE)

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
  }, [language, generation, series, setId, query, pokemon, maxPrice, minRaw, maxPsa10, minPsa10, pricedOnly, sort])

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

  const matches = useMemo(() => {
    if (!data) return []
    const needles = searchNeedles(query)
    const searching = needles.length > 0
    const priceCap = readNumber(maxPrice)
    const rawFloor = readNumber(minRaw)
    const popCap = readNumber(maxPsa10)
    const popFloor = readNumber(minPsa10)
    const gradeFloor = 150

    const focused = pokemon !== ''
    const list = data.cards.filter((card) => {
      if (language !== 'all' && card.set.language !== language) return false
      if (focused) return cardHasSpecies(card.name, pokemon)
      if (generation !== 'all' && !cardHasGeneration(card.name, Number(generation))) return false
      if (series !== 'all' && card.set.series !== series) return false
      if (setId !== 'all' && card.set.id !== setId) return false
      if (searching) {
        const haystack = foldName(`${card.name} ${card.number} ${card.set.name}`)
        return needles.some((needle) => haystack.includes(needle))
      }
      if (card.total < gradeFloor) return false
      if (popFloor != null && card.psa10 < popFloor) return false
      const price = toEur(card.psa10Usd)
      const raw = toEur(card.rawUsd)
      if (pricedOnly && price == null) return false
      if (priceCap != null && (price == null || price > priceCap)) return false
      if (rawFloor != null && (raw == null || raw < rawFloor)) return false
      if (popCap != null && card.psa10 > popCap) return false
      return true
    })

    list.sort((a, b) => {
      if (focused) {
        const seriesA = SERIES_ORDER.indexOf(a.set.series)
        const seriesB = SERIES_ORDER.indexOf(b.set.series)
        const orderA = seriesA === -1 ? 999 : seriesA
        const orderB = seriesB === -1 ? 999 : seriesB
        if (orderA !== orderB) return orderA - orderB
        const setOrder = a.set.name.localeCompare(b.set.name, 'fr')
        if (setOrder !== 0) return setOrder
        return a.number.localeCompare(b.number, 'fr', { numeric: true })
      }
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
    })
    return list
  }, [data, language, generation, series, setId, query, pokemon, maxPrice, minRaw, maxPsa10, minPsa10, pricedOnly, sort])

  const visible = matches.slice(0, shown)

  if (error) return <p className="state-msg error">{error}</p>
  if (!data) return <p className="state-msg">Chargement des notes PSA…</p>

  return (
    <section className="hunt">
      <div className="panel hunt-intro">
        <h2>Cartes qui peuvent encore monter</h2>
        <p>
          Personne ne peut promettre une hausse. En tête : une carte déjà demandée, avec peu de PSA
          10, et une note 10 difficile à obtenir. Pas de liste à part pour le français : le numéro
          est le même qu’en anglais. Choisis un Pokémon pour voir toutes ses cartes, série par
          série. Prix en dollars,
          convertis en euros. Relevés du {formatDay(data.fetchedAt)}.{' '}
          <a href={data.source} target="_blank" rel="noreferrer">
            {data.sourceName}
          </a>
        </p>
      </div>

      <form className="panel hunt-form" onSubmit={(event) => event.preventDefault()}>
        <label className="hunt-search">
          Recherche
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mewtwo, Dracaufeu, 199…"
          />
        </label>
        <label className="hunt-search">
          Pokémon
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
            <option value="">Toutes les cartes</option>
            {choices.map((option) => (
              <option key={option.phrase} value={option.phrase}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="hunt-row">
          <label>
            Langue
            <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageFilter)}>
              <option value="en">Français et anglais</option>
              <option value="ja">Japonais</option>
              <option value="all">Les deux</option>
            </select>
          </label>
          <label>
            Génération
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
            Époque
            <select value={series} onChange={(event) => setSeries(event.target.value)}>
              <option value="all">Toutes</option>
              {seriesOptions.map((id) => (
                <option key={id} value={id}>
                  {seriesLabel(id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Série
            <select value={setId} onChange={(event) => setSetId(event.target.value)}>
              <option value="all">Toutes ({setOptions.length})</option>
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
            Prix max de la PSA 10 (€)
            <input
              inputMode="decimal"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Aucune limite"
            />
          </label>
          <label>
            Prix min de la carte (€)
            <input
              inputMode="decimal"
              value={minRaw}
              onChange={(event) => setMinRaw(event.target.value)}
              placeholder="Aucun minimum"
            />
          </label>
          <label>
            Notes 10, de
            <input
              inputMode="numeric"
              value={minPsa10}
              onChange={(event) => setMinPsa10(event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Notes 10, à
            <input
              inputMode="numeric"
              value={maxPsa10}
              onChange={(event) => setMaxPsa10(event.target.value)}
              placeholder="Aucune limite"
            />
          </label>
          <label>
            Tri
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="upside">Peuvent encore monter</option>
              <option value="price">Moins chères d’abord</option>
              <option value="pop">Moins de notes 10 d’abord</option>
            </select>
          </label>
        </div>

        <label className="hunt-check">
          <input
            type="checkbox"
            checked={pricedOnly}
            onChange={(event) => setPricedOnly(event.target.checked)}
          />
          Cacher les cartes sans prix. Une recherche ou un Pokémon choisi ignore les limites ci-dessus.
        </label>

        <p className="hunt-count">
          {pokemon
            ? `${matches.length.toLocaleString('fr-FR')} ${matches.length > 1 ? 'cartes' : 'carte'} de ${speciesLabel(pokemon)}, toutes les séries`
            : query.trim()
              ? `${matches.length.toLocaleString('fr-FR')} ${matches.length > 1 ? 'cartes' : 'carte'} pour « ${query.trim()} »`
              : `${matches.length.toLocaleString('fr-FR')} ${matches.length > 1 ? 'cartes' : 'carte'}`}
          {matches.length > visible.length
            ? ` · ${visible.length.toLocaleString('fr-FR')} affichées, descends pour la suite`
            : ''}
        </p>
      </form>

      {matches.length === 0 ? (
        <p className="panel state-msg">
          {pokemon
            ? `Aucune carte de ${speciesLabel(pokemon)} dans cette langue. Essaie Les deux dans Langue.`
            : query.trim()
            ? generation !== 'all'
              ? 'Aucune carte de cette génération pour cette recherche. Remets Génération sur Toutes pour revoir les autres.'
              : 'Aucune carte pour cette recherche. Essaie le nom anglais si le français ne suffit pas, par exemple Charizard.'
            : generation !== 'all'
              ? 'Aucune carte de cette génération avec ces limites. Les dresseurs et les énergies ne sont pas comptés. Remets Génération sur Toutes, ou élargis les prix.'
              : 'Aucune carte avec ces filtres. Vide le prix minimum, ou monte le prix maximum de la PSA 10.'}
        </p>
      ) : (
        <div className="panel hunt-results">
        <div className="hunt-grid">
          {visible.map((card, index) => {
            const image = cardImageUrl(card.cardId)
            const psaPrice = toEur(card.psa10Usd)
            const rawPrice = toEur(card.rawUsd)
            const seriesChanged = pokemon !== '' && (index === 0 || visible[index - 1].set.series !== card.set.series)
            const seriesTotal = seriesChanged
              ? matches.filter((item) => item.set.series === card.set.series).length
              : 0
            return (
              <Fragment key={card.key}>
                {seriesChanged && (
                  <h3 className="hunt-series">
                    {seriesLabel(card.set.series)} · {seriesTotal.toLocaleString('fr-FR')}{' '}
                    {seriesTotal > 1 ? 'cartes' : 'carte'}
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
                    <p className="tile-pop">
                      PSA 10 : {formatCount(card.psa10)}
                      <span> · {formatGemRate(asPrinting(card))} des notes</span>
                    </p>
                    <p className="hunt-prices">
                      <strong>{money(psaPrice)}</strong>
                      <span>brute {money(rawPrice)}</span>
                    </p>
                    <a href={cardPageUrl(card.slug)} target="_blank" rel="noreferrer">
                      Voir la fiche
                    </a>
                    {mainSpecies(card.name) && mainSpecies(card.name) !== pokemon && (
                      <button type="button" className="hunt-all-series" onClick={() => showAllSeries(card.name)}>
                        Toutes les séries
                      </button>
                    )}
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
          Afficher {Math.min(PAGE, matches.length - shown)} cartes de plus
        </button>
      )}
    </section>
  )
}
