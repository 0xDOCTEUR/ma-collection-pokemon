import { useCallback, useEffect, useState } from 'react'
import type { CardStatus, CardVariant, CollectionMap, CollectionsBySet } from '../types'
import { normalizeCardStatus, variantKey } from '../types'

const STORAGE_KEY = 'pokemon-collection-v2'
const LEGACY_KEY = 'pokemon-151-collection-v1'
const LEGACY_SET = 'sv03.5'

function normalizeMap(map: CollectionMap): CollectionMap {
  const next: CollectionMap = {}
  for (const [key, status] of Object.entries(map)) {
    const normalized = normalizeCardStatus(status)
    if (normalized === 'owned') next[key] = 'owned'
  }
  return next
}

function load(): CollectionsBySet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as CollectionsBySet
      const next: CollectionsBySet = {}
      for (const [setId, map] of Object.entries(parsed)) {
        next[setId] = normalizeMap(map)
      }
      return next
    }

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      return { [LEGACY_SET]: normalizeMap(JSON.parse(legacy) as CollectionMap) }
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function useCollection() {
  const [collections, setCollections] = useState<CollectionsBySet>(() => load())
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections))
    setSavedAt(Date.now())
  }, [collections])

  const getStatus = useCallback(
    (setId: string, id: string, variant: CardVariant = 'normal'): CardStatus =>
      normalizeCardStatus(collections[setId]?.[variantKey(id, variant)]),
    [collections],
  )

  const setStatus = useCallback(
    (setId: string, id: string, status: CardStatus, variant: CardVariant = 'normal') => {
      const key = variantKey(id, variant)
      const nextStatus = normalizeCardStatus(status)
      setCollections((prev) => {
        const setMap = { ...(prev[setId] ?? {}) }
        if (nextStatus === 'missing') delete setMap[key]
        else setMap[key] = 'owned'
        return { ...prev, [setId]: setMap }
      })
    },
    [],
  )

  const markMany = useCallback(
    (setId: string, ids: string[], status: CardStatus, variant: CardVariant = 'normal') => {
      const nextStatus = normalizeCardStatus(status)
      setCollections((prev) => {
        const setMap = { ...(prev[setId] ?? {}) }
        for (const id of ids) {
          const key = variantKey(id, variant)
          if (nextStatus === 'missing') delete setMap[key]
          else setMap[key] = 'owned'
        }
        return { ...prev, [setId]: setMap }
      })
    },
    [],
  )

  const resetSet = useCallback((setId: string) => {
    setCollections((prev) => {
      const next = { ...prev }
      delete next[setId]
      return next
    })
  }, [])

  return { collections, getStatus, setStatus, markMany, resetSet, savedAt }
}
