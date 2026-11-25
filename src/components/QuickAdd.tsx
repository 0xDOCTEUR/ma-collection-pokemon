import { useState } from 'react'
import type { CardStatus, CardVariant, PokemonCard } from '../types'

interface Props {
  cards: PokemonCard[]
  onApply: (ids: string[], status: CardStatus, variant: CardVariant) => void
}

function parseNumbers(raw: string): string[] {
  return raw
    .split(/[\s,;./|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => String(Number.parseInt(part.replace(/^0+/, '') || part, 10)))
    .filter((n) => n !== 'NaN')
}

export function QuickAdd({ cards, onApply }: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<CardStatus>('owned')
  const [variant, setVariant] = useState<CardVariant>('normal')
  const [message, setMessage] = useState<string | null>(null)

  function apply() {
    const numbers = [...new Set(parseNumbers(text))]
    if (numbers.length === 0) {
      setMessage('Colle des numéros, par exemple : 1, 4, 25, 150')
      return
    }

    const byNumber = new Map(cards.map((c) => [c.number, c]))
    const ids: string[] = []
    const unknown: string[] = []
    const noReverse: string[] = []

    for (const n of numbers) {
      const card = byNumber.get(n)
      if (!card) {
        unknown.push(n)
        continue
      }
      if (variant === 'reverse' && !card.hasReverse) {
        noReverse.push(n)
        continue
      }
      ids.push(card.id)
    }

    if (ids.length) onApply(ids, mode, variant)

    const label = mode === 'owned' ? 'possédées' : 'manquantes'
    const version = variant === 'reverse' ? 'reverse' : 'normales'
    let msg = `${ids.length} carte(s) ${version} marquées comme ${label}.`
    if (noReverse.length) msg += ` Pas de reverse pour : ${noReverse.join(', ')}.`
    if (unknown.length) msg += ` Numéros inconnus : ${unknown.join(', ')}.`
    setMessage(msg)
    if (ids.length) setText('')
  }

  return (
    <section className="quick panel">
      <div className="export-head">
        <div>
          <h2>Ajout rapide par numéros</h2>
          <p className="muted">Colle une liste (ex. 1, 4, 25). Tout est sauvegardé automatiquement.</p>
        </div>
        <div className="quick-selects">
          <label>
            Marquer comme
            <select value={mode} onChange={(e) => setMode(e.target.value as CardStatus)}>
              <option value="owned">Possédées</option>
              <option value="missing">Manquantes</option>
            </select>
          </label>
          <label>
            Version
            <select value={variant} onChange={(e) => setVariant(e.target.value as CardVariant)}>
              <option value="normal">Normale</option>
              <option value="reverse">Reverse</option>
            </select>
          </label>
        </div>
      </div>
      <textarea
        className="export-box"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="1, 4, 25, 143, 150…"
      />
      <div className="export-actions">
        <button type="button" className="btn primary" onClick={apply}>
          Ajouter à ma collection
        </button>
      </div>
      {message && <p className="quick-msg">{message}</p>}
    </section>
  )
}
