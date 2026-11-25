import { useCallback, useEffect, useState } from 'react'
import type { CardVariant } from '../types'
import { variantKey } from '../types'

export interface CustomList {
  id: string
  name: string
  /** Ancien champ (une série par liste). Conservé pour migration. */
  setId?: string
  /** Clés `setId|cardId` ou `setId|cardId:reverse`. */
  selected: string[]
  createdAt: number
}

const STORAGE_KEY = 'pokemon-custom-lists-v1'

export function listItemKey(setId: string, cardId: string, variant: CardVariant): string {
  return `${setId}|${variantKey(cardId, variant)}`
}

export function parseListItemKey(
  key: string,
): { setId: string; cardId: string; variant: CardVariant } | null {
  const sep = key.indexOf('|')
  if (sep <= 0) return null
  const setId = key.slice(0, sep)
  const rest = key.slice(sep + 1)
  if (!setId || !rest) return null
  if (rest.endsWith(':reverse')) {
    return { setId, cardId: rest.slice(0, -':reverse'.length), variant: 'reverse' }
  }
  return { setId, cardId: rest, variant: 'normal' }
}

function migrateList(raw: CustomList): CustomList {
  const setId = raw.setId
  const selected = (raw.selected ?? []).map((key) => {
    if (key.includes('|')) return key
    if (setId) return `${setId}|${key}`
    return key
  })
  return {
    id: raw.id,
    name: raw.name,
    selected,
    createdAt: raw.createdAt,
  }
}

function load(): CustomList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomList[]
    return parsed.map(migrateList)
  } catch {
    return []
  }
}

function newId() {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCustomLists() {
  const [lists, setLists] = useState<CustomList[]>(() => load())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
  }, [lists])

  const createList = useCallback((name: string) => {
    const list: CustomList = {
      id: newId(),
      name: name.trim() || 'Nouvelle liste',
      selected: [],
      createdAt: Date.now(),
    }
    setLists((prev) => [list, ...prev])
    return list.id
  }, [])

  const renameList = useCallback((id: string, name: string) => {
    setLists((prev) =>
      prev.map((list) => (list.id === id ? { ...list, name: name.trim() || list.name } : list)),
    )
  }, [])

  const deleteList = useCallback((id: string) => {
    setLists((prev) => prev.filter((list) => list.id !== id))
  }, [])

  const addCard = useCallback((id: string, setId: string, cardId: string, variant: CardVariant) => {
    const key = listItemKey(setId, cardId, variant)
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== id) return list
        if (list.selected.includes(key)) return list
        return { ...list, selected: [...list.selected, key] }
      }),
    )
  }, [])

  const removeCard = useCallback(
    (id: string, setId: string, cardId: string, variant: CardVariant) => {
      const key = listItemKey(setId, cardId, variant)
      setLists((prev) =>
        prev.map((list) => {
          if (list.id !== id) return list
          return { ...list, selected: list.selected.filter((k) => k !== key) }
        }),
      )
    },
    [],
  )

  const toggleCard = useCallback(
    (id: string, setId: string, cardId: string, variant: CardVariant) => {
      const key = listItemKey(setId, cardId, variant)
      setLists((prev) =>
        prev.map((list) => {
          if (list.id !== id) return list
          const has = list.selected.includes(key)
          return {
            ...list,
            selected: has ? list.selected.filter((k) => k !== key) : [...list.selected, key],
          }
        }),
      )
    },
    [],
  )

  const isInList = useCallback(
    (id: string, setId: string, cardId: string, variant: CardVariant) => {
      const list = lists.find((l) => l.id === id)
      if (!list) return false
      return list.selected.includes(listItemKey(setId, cardId, variant))
    },
    [lists],
  )

  const clearSelection = useCallback((id: string) => {
    setLists((prev) => prev.map((list) => (list.id === id ? { ...list, selected: [] } : list)))
  }, [])

  const selectMany = useCallback((id: string, keys: string[], mode: 'add' | 'replace') => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== id) return list
        if (mode === 'replace') return { ...list, selected: [...new Set(keys)] }
        return { ...list, selected: [...new Set([...list.selected, ...keys])] }
      }),
    )
  }, [])

  return {
    lists,
    createList,
    renameList,
    deleteList,
    addCard,
    removeCard,
    toggleCard,
    isInList,
    clearSelection,
    selectMany,
  }
}
