import { useEffect, useId, useRef, useState } from 'react'
import type { PokemonCard } from '../types'
import { LOOSE_CONDITIONS } from '../utils/advicePrice'
import {
  conditionLabel,
  scanCardPhoto,
  type LooseConditionId,
  type ScanMatch,
} from '../utils/cardScan'

interface Props {
  cards: PokemonCard[]
  setName: string
  onClose: () => void
  onConfirm: (card: PokemonCard, conditionId: LooseConditionId) => void
}

type Step = 'capture' | 'reading' | 'result' | 'error'

export function CardScan({ cards, setName, onClose, onConfirm }: Props) {
  const titleId = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [step, setStep] = useState<Step>('capture')
  const [message, setMessage] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [matches, setMatches] = useState<ScanMatch[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [conditionId, setConditionId] = useState<LooseConditionId>('nm')
  const [conditionReason, setConditionReason] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [manualNumber, setManualNumber] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMessage('Cet appareil n’a pas de caméra utilisable. Choisis une photo à la place.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCameraReady(true)
        }
      } catch {
        if (!cancelled) {
          setMessage('Caméra refusée ou indisponible. Choisis une photo à la place.')
        }
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  async function analyze(blob: Blob) {
    setStep('reading')
    setMessage(null)
    try {
      const result = await scanCardPhoto(blob, cards)
      setPreviewUrl(result.previewUrl)
      setMatches(result.matches)
      setSelectedId(result.matches[0]?.card.id ?? null)
      setConditionId(result.condition.id)
      setConditionReason(result.condition.reason)
      if (result.matches.length === 0) {
        setMessage(
          'Pas de correspondance assez sûre. Cadre le nom en haut et le numéro en bas à droite, sans trop de reflet, ou tape le numéro.',
        )
      }
      setStep('result')
    } catch (error) {
      setStep('error')
      setMessage(error instanceof Error ? error.message : 'Le scan a échoué.')
    }
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || !cameraReady) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 960
    canvas.height = video.videoHeight || 1280
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (blob) await analyze(blob)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    void analyze(file)
  }

  function applyManualNumber() {
    const number = String(Number.parseInt(manualNumber.trim(), 10))
    if (!number || number === 'NaN') {
      setMessage('Entre un numéro, par exemple 199.')
      return
    }
    const card = cards.find((item) => item.number === number)
    if (!card) {
      setMessage(`Aucune carte n° ${number} dans ${setName}.`)
      return
    }
    setMatches([{ card, number, score: 100, why: 'Numéro saisi à la main' }])
    setSelectedId(card.id)
    setMessage(null)
  }

  const selected = matches.find((match) => match.card.id === selectedId)?.card ?? null

  return (
    <div className="card-sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="card-sheet scan-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="card-sheet-head">
          <div>
            <p className="card-sheet-num">Scan</p>
            <h2 id={titleId}>Reconnaître une carte</h2>
            <p className="muted">
              Photo dans la série {setName}. Cadre le nom en haut et le numéro en bas à droite. La
              photo reste sur ton appareil. L’état proposé est une estimation : tu confirmes avant
              le prix.
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="scan-body">
          {step === 'capture' && (
            <>
              <div className="scan-camera">
                <video ref={videoRef} playsInline muted autoPlay />
                <div className="scan-frame" aria-hidden="true" />
              </div>
              <div className="scan-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={!cameraReady}
                  onClick={() => void captureFrame()}
                >
                  Prendre la photo
                </button>
                <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                  Choisir une photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(event) => onFile(event.target.files?.[0])}
                />
              </div>
              {message && <p className="state-msg">{message}</p>}
            </>
          )}

          {step === 'reading' && (
            <p className="state-msg">Lecture du numéro et estimation de l’état…</p>
          )}

          {(step === 'result' || step === 'error') && (
            <>
              {previewUrl && (
                <img className="scan-preview" src={previewUrl} alt="Photo scannée" />
              )}
              {message && <p className="state-msg">{message}</p>}

              {matches.length > 0 ? (
                <div className="scan-matches">
                  <p className="stat-label">Carte reconnue</p>
                  {matches.slice(0, 4).map((match) => (
                    <label key={match.card.id} className="scan-match">
                      <input
                        type="radio"
                        name="scan-card"
                        checked={selectedId === match.card.id}
                        onChange={() => setSelectedId(match.card.id)}
                      />
                      <img src={match.card.imageSmall} alt="" width={48} height={68} />
                      <span>
                        <strong>
                          #{match.card.number} · {match.card.name}
                        </strong>
                        <small>
                          {match.card.rarity} · {match.why}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="state-msg">
                  Aucune carte assez sûre dans {setName}. Cadre le nom en haut et le numéro en bas
                  à droite, ou tape le numéro.
                </p>
              )}

              <div className="scan-manual">
                <label>
                  Numéro à la main
                  <input
                    value={manualNumber}
                    onChange={(event) => setManualNumber(event.target.value)}
                    placeholder="199"
                    inputMode="numeric"
                  />
                </label>
                <button type="button" className="btn ghost" onClick={applyManualNumber}>
                  Utiliser ce numéro
                </button>
              </div>

              <div className="scan-condition">
                <p className="stat-label">État estimé — à confirmer</p>
                {conditionReason && <p className="muted">{conditionReason}</p>}
                <div className="scan-condition-list">
                  {LOOSE_CONDITIONS.map((condition) => (
                    <button
                      key={condition.id}
                      type="button"
                      className={conditionId === condition.id ? 'chip active-owned' : 'chip'}
                      onClick={() => setConditionId(condition.id)}
                    >
                      {condition.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="scan-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={!selected}
                  onClick={() => selected && onConfirm(selected, conditionId)}
                >
                  Voir le prix pour {conditionLabel(conditionId)}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setStep('capture')
                    setMatches([])
                    setSelectedId(null)
                    setPreviewUrl(null)
                    setMessage(null)
                  }}
                >
                  Reprendre une photo
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
