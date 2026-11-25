export interface SearchSuggestItem {
  key: string
  name: string
  number: string
  setName: string
  image?: string
}

interface Props {
  items: SearchSuggestItem[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (item: SearchSuggestItem) => void
}

export function SearchSuggest({ items, activeIndex, onHover, onPick }: Props) {
  if (items.length === 0) return null

  return (
    <ul className="search-suggest" role="listbox" aria-label="Suggestions de cartes">
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <li key={item.key} role="option" aria-selected={active}>
            <button
              type="button"
              className={active ? 'search-suggest-item is-active' : 'search-suggest-item'}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                // Empêche le blur de l’input avant le clic.
                e.preventDefault()
              }}
              onClick={() => onPick(item)}
            >
              {item.image ? (
                <img src={item.image} alt="" width={36} height={50} loading="lazy" />
              ) : (
                <span className="search-suggest-fallback" aria-hidden="true" />
              )}
              <span className="search-suggest-copy">
                <strong>{item.name}</strong>
                <small>
                  {item.number} · {item.setName}
                </small>
              </span>
            </button>
          </li>
        )
      })}
      <li className="search-suggest-hint" aria-hidden="true">
        Survole une carte · Entrée pour chercher partout
      </li>
    </ul>
  )
}
