const KEYS = [
  'pokemon-collection-v2',
  'pokemon-151-collection-v1',
  'pokemon-custom-lists-v1',
] as const

export interface AppBackup {
  version: 1
  exportedAt: string
  data: Record<string, string>
}

export function exportBackup(): AppBackup {
  const data: Record<string, string> = {}
  for (const key of KEYS) {
    const value = localStorage.getItem(key)
    if (value != null) data[key] = value
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export function downloadBackup() {
  const backup = exportBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sauvegarde-collection-pokemon-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importBackup(raw: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as AppBackup
    if (!parsed || typeof parsed !== 'object' || !parsed.data) {
      return { ok: false, error: 'Fichier de sauvegarde invalide.' }
    }
    for (const [key, value] of Object.entries(parsed.data)) {
      if (typeof value === 'string') localStorage.setItem(key, value)
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Impossible de lire ce fichier.' }
  }
}
