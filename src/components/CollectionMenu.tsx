import { useEffect, useMemo, useRef, useState } from 'react'
import { matchesSearchText } from '../utils/frenchNames'
import { SERIES_ORDER, seriesLabel } from '../utils/psaHunt'
import type { CollectionSetInfo } from '../utils/collectionSets'

interface Props {
  sets: CollectionSetInfo[]
  activeSetId: string | null
  isCollectionActive: boolean
  ownedCountBySet: Record<string, number>
  onSelectSet: (setId: string) => void
}

type LangFilter = 'intl' | 'ja'

export function CollectionMenu({
  sets,
  activeSetId,
  isCollectionActive,
  ownedCountBySet,
  onSelectSet,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<LangFilter>('intl')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const activeSet = useMemo(
    () => sets.find((s) => s.id === activeSetId) ?? sets[0] ?? null,
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
    () =>
      sets.filter(
        (set) => set.featured || (ownedCountBySet[set.id] ?? 0) > 0,
      ),
    [sets, ownedCountBySet],
  )

  const intlCount = useMemo(
    () => sets.filter((s) => s.language !== 'ja').length,
    [sets],
  )
  const jaCount = useMemo(
    () => sets.filter((s) => s.language === 'ja').length,
    [sets],
  )

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

  function handlePick(setId: string) {
    onSelectSet(setId)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="nav-dropdown" ref={wrapRef}>
      <button
        type="button"
        className={isCollectionActive ? 'tab active nav-drop-trigger' : 'tab nav-drop-trigger'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>Collection</span>
        {isCollectionActive && activeSet && (
          <span className="tab-series-pill">{activeSet.shortName}</span>
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
              placeholder="Rechercher une série (151, Évolutions, Base…)"
              aria-label="Rechercher une série"
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
            {!query.trim() && mySets.length > 0 && (
              <div className="nav-submenu-group">
                <p className="nav-submenu-title">Mes séries</p>
                <div className="nav-submenu-list">
                  {mySets.map((set) => {
                    const owned = ownedCountBySet[set.id] ?? 0
                    const active = isCollectionActive && activeSetId === set.id
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
                          {owned > 0 ? `${owned} possédée${owned > 1 ? 's' : ''}` : set.featured ? 'FR' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {groupedSets.length === 0 ? (
              <p className="nav-submenu-empty">Aucune série ne correspond à « {query} ».</p>
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
                      const active = isCollectionActive && activeSetId === set.id
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
