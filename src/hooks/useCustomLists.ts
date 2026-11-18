import { useCallback, useEffect, useState } from 'react'
import type { CardVariant } from '../types'
import { variantKey } from '../types'

export interface CustomList {
  id: string
  name: string
  setId: string
  selected: string[]
  createdAt: number
}

const STORAGE_KEY = 'pokemon-custom-lists-v1'

function load(): CustomList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CustomList[]
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

  const createList = useCallback((name: string, setId: string) => {
    const list: CustomList = {
      id: newId(),
      name: name.trim() || 'Nouvelle liste',
      setId,
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

  const setListSet = useCallback((id: string, setId: string) => {
    setLists((prev) =>
      prev.map((list) => (list.id === id ? { ...list, setId, selected: [] } : list)),
    )
  }, [])

  const toggleCard = useCallback((id: string, cardId: string, variant: CardVariant) => {
    const key = variantKey(cardId, variant)
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
  }, [])

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
    setListSet,
    toggleCard,
    clearSelection,
    selectMany,
  }
}
