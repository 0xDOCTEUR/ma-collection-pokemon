import { useRef, useState } from 'react'
import { downloadBackup, importBackup } from '../utils/backup'

export function BackupPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importBackup(String(reader.result ?? ''))
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setMessage('Sauvegarde restaurée. Rechargement…')
      window.setTimeout(() => window.location.reload(), 700)
    }
    reader.readAsText(file)
  }

  return (
    <section className="panel backup-panel">
      <div>
        <h2>Sauvegarde</h2>
        <p className="muted">
          Exporte ta collection et tes listes pour les retrouver sur le site en ligne (ou un autre
          appareil).
        </p>
      </div>
      <div className="export-actions">
        <button type="button" className="btn primary" onClick={downloadBackup}>
          Télécharger ma sauvegarde
        </button>
        <button type="button" className="btn ghost" onClick={() => inputRef.current?.click()}>
          Restaurer une sauvegarde
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {message && <p className="quick-msg">{message}</p>}
    </section>
  )
}
