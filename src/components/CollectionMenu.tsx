import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { matchesSearchText } from '../utils/frenchNames'
import { buildPokemonSuggestions } from '../utils/pokemonSuggest'
import { SERIES_ORDER, seriesLabel, type PsaHuntData } from '../utils/psaHunt'
import type { CollectionSetInfo } from '../utils/collectionSets'
import { SearchSuggest } from './SearchSuggest'

interface Props {
  sets: CollectionSetInfo[]
  activeSetId: string | null
  /** `all` = recherche sur toutes les séries. */
  selectedSetId: string | 'all'
  isCollectionActive: boolean
  ownedCountBySet: Record<string, number>
  hunt?: PsaHuntData | null
  onSelectSet: (setId: string | 'all') => void
  onOpenCollection: () => void
  /** Lance la recherche globale avec un nom de Pokémon. */
  onSearchPokemon?: (name: string) => void
}

type LangFilter = 'intl' | 'ja'

export function CollectionMenu({
  sets,
  activeSetId,
  selectedSetId,
  isCollectionActive,
  ownedCountBySet,
  hunt = null,
  onSelectSet,
  onOpenCollection,
  onSearchPokemon,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<LangFilter>('intl')
  const [suggestIndex, setSuggestIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const activeSet = useMemo(
    () => sets.find((s) => s.id === activeSetId) ?? null,
    [sets, activeSetId],
  )

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    window.setTimeout(() => searchRef.current?.focus(), 20)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const mySets = useMemo(
    () => sets.filter((set) => set.featured || (ownedCountBySet[set.id] ?? 0) > 0),
    [sets, ownedCountBySet],
  )

  const intlCount = useMemo(() => sets.filter((s) => s.language !== 'ja').length, [sets])
  const jaCount = useMemo(() => sets.filter((s) => s.language === 'ja').length, [sets])

  const pokemonSuggestions = useMemo(
    () => buildPokemonSuggestions(hunt, query, 8),
    [hunt, query],
  )

  useEffect(() => {
    setSuggestIndex(0)
  }, [query])

  const groupedSets = useMemo(() => {
    const trimmed = query.trim()
    const filtered = sets.filter((set) => {
      if (trimmed) return matchesSearchText(set.searchText, trimmed)
      return lang === 'ja' ? set.language === 'ja' : set.language !== 'ja'
    })

    const map = new Map<string, CollectionSetInfo[]>()
    for (const set of filtered) {
      const bucket = map.get(set.series) ?? []
      bucket.push(set)
      map.set(set.series, bucket)
    }

    const keys = [...map.keys()].sort((a, b) => {
      const ia = SERIES_ORDER.indexOf(a)
      const ib = SERIES_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

    return keys.map((series) => ({
      series,
      label: seriesLabel(series),
      items: map.get(series) ?? [],
    }))
  }, [sets, query, lang])

  function handlePick(setId: string | 'all') {
    onSelectSet(setId)
    setOpen(false)
    setQuery('')
  }

  function handlePokemonSearch(name: string) {
    onSearchPokemon?.(name)
    setOpen(false)
    setQuery('')
  }

  function handleTrigger() {
    if (!isCollectionActive) {
      onOpenCollection()
      setOpen(true)
      return
    }
    setOpen((prev) => !prev)
  }

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && pokemonSuggestions.length > 0) {
      e.preventDefault()
      setSuggestIndex((i) => Math.min(i + 1, pokemonSuggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp' && pokemonSuggestions.length > 0) {
      e.preventDefault()
      setSuggestIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    if (pokemonSuggestions.length > 0) {
      const picked = pokemonSuggestions[suggestIndex] ?? pokemonSuggestions[0]
      handlePokemonSearch(picked.name)
      return
    }
    const firstSet = groupedSets[0]?.items[0]
    if (firstSet) handlePick(firstSet.id)
  }

  const pillLabel =
    selectedSetId === 'all' ? 'Toutes' : (activeSet?.shortName ?? activeSet?.name ?? null)
  const showPokemon = query.trim().length >= 2 && pokemonSuggestions.length > 0

  return (
    <div className="nav-dropdown" ref={wrapRef}>
      <button
        type="button"
        className={isCollectionActive ? 'tab active nav-drop-trigger' : 'tab nav-drop-trigger'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleTrigger}
      >
        <span>Collection</span>
        {isCollectionActive && pillLabel && (
          <span className="tab-series-pill">{pillLabel}</span>
        )}
        <span className={open ? 'nav-caret open' : 'nav-caret'} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="nav-submenu" role="menu" aria-label="Séries de la collection">
          <div className="nav-submenu-head">
            <input
              ref={searchRef}
              type="search"
              className="nav-submenu-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Série ou Pokémon (151, Mewtwo…)"
              aria-label="Rechercher une série ou un Pokémon"
            />
            {!query.trim() && jaCount > 0 && (
              <div className="nav-submenu-langs" role="group" aria-label="Langue des séries">
                <button
                  type="button"
                  className={lang === 'intl' ? 'nav-lang-btn active' : 'nav-lang-btn'}
                  onClick={() => setLang('intl')}
                >
                  International ({intlCount})
                </button>
                <button
                  type="button"
                  className={lang === 'ja' ? 'nav-lang-btn active' : 'nav-lang-btn'}
                  onClick={() => setLang('ja')}
                >
                  Japon ({jaCount})
                </button>
              </div>
            )}
          </div>

          <div className="nav-submenu-body">
            {showPokemon && (
              <div className="nav-submenu-group">
                <p className="nav-submenu-title">
                  Pokémon
                  <span>{pokemonSuggestions.length}</span>
                </p>
                <SearchSuggest
                  items={pokemonSuggestions}
                  activeIndex={suggestIndex}
                  onHover={setSuggestIndex}
                  onPick={(item) => handlePokemonSearch(item.name)}
                />
              </div>
            )}

            <div className="nav-submenu-group">
              <div className="nav-submenu-list">
                <button
                  type="button"
                  role="menuitem"
                  className={
                    isCollectionActive && selectedSetId === 'all'
                      ? 'nav-submenu-item active'
                      : 'nav-submenu-item'
                  }
                  onClick={() => handlePick('all')}
                >
                  <span className="nav-submenu-name">Toutes les séries</span>
                  <span className="nav-submenu-meta">Recherche globale</span>
                </button>
              </div>
            </div>

            {!query.trim() && mySets.length > 0 && (
              <div className="nav-submenu-group">
                <p className="nav-submenu-title">Mes séries</p>
                <div className="nav-submenu-list">
                  {mySets.map((set) => {
                    const owned = ownedCountBySet[set.id] ?? 0
                    const active = isCollectionActive && selectedSetId === set.id
                    return (
                      <button
                        key={`mine-${set.id}`}
                        type="button"
                        role="menuitem"
                        className={active ? 'nav-submenu-item active' : 'nav-submenu-item'}
                        onClick={() => handlePick(set.id)}
                      >
                        <span className="nav-submenu-name">{set.name}</span>
                        <span className="nav-submenu-meta">
                          {owned > 0
                            ? `${owned} possédée${owned > 1 ? 's' : ''}`
                            : set.featured
                              ? 'FR'
                              : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {groupedSets.length === 0 && !showPokemon ? (
              <p className="nav-submenu-empty">Aucune série ni Pokémon pour « {query} ».</p>
            ) : (
              groupedSets.map((group) => (
                <div key={group.series} className="nav-submenu-group">
                  <p className="nav-submenu-title">
                    {group.label}
                    <span>{group.items.length}</span>
                  </p>
                  <div className="nav-submenu-list">
                    {group.items.map((set) => {
                      const owned = ownedCountBySet[set.id] ?? 0
                      const active = isCollectionActive && selectedSetId === set.id
                      return (
                        <button
                          key={set.id}
                          type="button"
                          role="menuitem"
                          className={active ? 'nav-submenu-item active' : 'nav-submenu-item'}
                          onClick={() => handlePick(set.id)}
                        >
                          <span className="nav-submenu-name">{set.name}</span>
                          <span className="nav-submenu-meta">
                            {owned > 0
                              ? `${owned} ✓`
                              : set.cardCount
                                ? `${set.cardCount}`
                                : set.featured
                                  ? 'FR'
                                  : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
