import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CardVariant } from '../types'
import type { CustomList } from '../hooks/useCustomLists'
import { listItemKey } from '../hooks/useCustomLists'

interface Props {
  lists: CustomList[]
  setId: string
  cardId: string
  variant?: CardVariant
  createList: (name: string) => string
  addCard: (listId: string, setId: string, cardId: string, variant: CardVariant) => void
  removeCard: (listId: string, setId: string, cardId: string, variant: CardVariant) => void
  compact?: boolean
}

export function AddToListMenu({
  lists,
  setId,
  cardId,
  variant = 'normal',
  createList,
  addCard,
  removeCard,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const key = listItemKey(setId, cardId, variant)
  const inAny = lists.some((list) => list.selected.includes(key))

  function placeMenu() {
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const menuWidth = 260
    const gap = 6
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    )
    const below = rect.bottom + gap
    const estimatedHeight = 220
    const top =
      below + estimatedHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - estimatedHeight - gap)
        : below
    setCoords({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    placeMenu()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onReposition = () => placeMenu()
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 1400)
  }

  function handleToggle(list: CustomList) {
    const has = list.selected.includes(key)
    if (has) {
      removeCard(list.id, setId, cardId, variant)
      flash(`Retiré de « ${list.name} »`)
    } else {
      addCard(list.id, setId, cardId, variant)
      flash(`Ajouté à « ${list.name} »`)
    }
  }

  function handleCreate() {
    const id = createList(draftName.trim() || 'Achats')
    addCard(id, setId, cardId, variant)
    setDraftName('')
    setOpen(false)
    flash('Ajouté à la nouvelle liste')
  }

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            className="add-list-dropdown add-list-dropdown-portal"
            role="menu"
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {lists.length === 0 ? (
              <p className="add-list-empty">Aucune liste pour l’instant.</p>
            ) : (
              <ul className="add-list-options">
                {lists.map((list) => {
                  const checked = list.selected.includes(key)
                  return (
                    <li key={list.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                        className={checked ? 'add-list-option active' : 'add-list-option'}
                        onClick={() => handleToggle(list)}
                      >
                        <span>{checked ? '✓' : '+'}</span>
                        <span>{list.name}</span>
                        <small>{list.selected.length}</small>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="add-list-create">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Nouvelle liste…"
                aria-label="Nom de la nouvelle liste"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                }}
              />
              <button type="button" className="btn primary" onClick={handleCreate}>
                Créer
              </button>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className={compact ? 'add-list-menu compact' : 'add-list-menu'}>
      <button
        ref={triggerRef}
        type="button"
        className={inAny ? 'btn ghost add-list-trigger is-on' : 'btn ghost add-list-trigger'}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {compact ? (inAny ? '✓ Liste' : '+ Liste') : inAny ? 'Dans une liste' : '+ Liste'}
      </button>
      {toast && <span className="add-list-toast">{toast}</span>}
      {menu}
    </div>
  )
}
