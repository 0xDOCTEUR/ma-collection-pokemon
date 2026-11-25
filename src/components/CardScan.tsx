import { useEffect, useId, useRef, useState } from 'react'
import { LOOSE_CONDITIONS } from '../utils/advicePrice'
import {
  conditionLabel,
  scanCardPhoto,
  type LooseConditionId,
  type ScanMatch,
} from '../utils/cardScan'
import { matchesSearchText } from '../utils/frenchNames'
import { frenchCardName } from '../utils/generations'
import type { ScanTarget } from '../utils/scanTargets'

interface Props {
  targets: ScanTarget[]
  /** Mode page (onglet) : pas de bouton Fermer obligatoire. */
  embedded?: boolean
  onClose?: () => void
  onConfirm: (target: ScanTarget, conditionId: LooseConditionId) => void
}

type Step = 'capture' | 'reading' | 'result' | 'error'

export function CardScan({ targets, embedded = false, onClose, onConfirm }: Props) {
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
  const [manualName, setManualName] = useState('')

  useEffect(() => {
    if (!onClose) return
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
      const result = await scanCardPhoto(blob, targets)
      setPreviewUrl(result.previewUrl)
      setMatches(result.matches)
      setSelectedId(result.matches[0]?.target.id ?? null)
      setConditionId(result.condition.id)
      setConditionReason(result.condition.reason)
      if (result.matches.length === 0) {
        setMessage(
          'Pas de carte assez sûre. Cadre la carte entière, avec le nom et le numéro lisibles (ex. 199/165 ou GG03/GG70), peu de reflet, ou cherche à la main.',
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
    const sourceW = video.videoWidth || 960
    const sourceH = video.videoHeight || 1280
    // Même proportion que le cadre jaune à l’écran (inset 8% / 12 %).
    const sx = sourceW * 0.12
    const sy = sourceH * 0.08
    const sw = sourceW * 0.76
    const sh = sourceH * 0.84
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw)
    canvas.height = Math.round(sh)
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (blob) await analyze(blob)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    void analyze(file)
  }

  function applyManual() {
    const rawNumber = manualNumber.trim()
    const number = /^\d+$/.test(rawNumber)
      ? String(Number.parseInt(rawNumber, 10))
      : rawNumber.toUpperCase()
    const nameNeedle = manualName.trim().toLowerCase()
    let list = targets
    if (number) list = list.filter((target) => target.number === number)
    if (nameNeedle) {
      list = list.filter((target) =>
        matchesSearchText(`${target.name} ${target.setLabel}`, manualName),
      )
    }
    if (list.length === 0) {
      setMessage('Aucune carte trouvée avec ce numéro / ce nom.')
      return
    }
    const next = list.slice(0, 12).map((target) => ({
      target,
      number: target.number,
      score: 100,
      why: 'Recherche à la main',
    }))
    setMatches(next)
    setSelectedId(next[0]?.target.id ?? null)
    setMessage(null)
    setStep('result')
  }

  const selected = matches.find((match) => match.target.id === selectedId)?.target ?? null

  const body = (
    <>
      <header className="card-sheet-head">
        <div>
          <p className="card-sheet-num">Scan</p>
          <h2 id={titleId}>Reconnaître une carte</h2>
          <p className="muted">
            Toutes les séries du catalogue. Cadre la carte (même un peu loin, on la recadre). Nom en
            haut, numéro en bas à droite — y compris GG03/GG70. La photo reste sur ton appareil.
            L’état proposé est une estimation : tu confirmes avant le prix.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        )}
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
                className="btn primary"
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
          <p className="state-msg">Lecture du nom, du numéro et estimation de l’état…</p>
        )}

        {(step === 'result' || step === 'error') && (
          <>
            {previewUrl && <img className="scan-preview" src={previewUrl} alt="Photo scannée" />}
            {message && <p className="state-msg">{message}</p>}

            {matches.length > 0 ? (
              <div className="scan-matches">
                <p className="stat-label">Carte reconnue</p>
                {matches.slice(0, 8).map((match) => (
                  <label key={match.target.id} className="scan-match">
                    <input
                      type="radio"
                      name="scan-card"
                      checked={selectedId === match.target.id}
                      onChange={() => setSelectedId(match.target.id)}
                    />
                    {match.target.imageSmall ? (
                      <img src={match.target.imageSmall} alt="" width={48} height={68} />
                    ) : (
                      <span className="scan-match-fallback" aria-hidden="true" />
                    )}
                    <span>
                      <strong>
                        #{match.target.number} · {frenchCardName(match.target.name)}
                      </strong>
                      <small>
                        {match.target.setLabel} · {match.why}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="state-msg">
                Aucune carte assez sûre. Cherche à la main ci-dessous, ou reprends une photo.
              </p>
            )}

            <div className="scan-manual">
              <label>
                Numéro
                <input
                  value={manualNumber}
                  onChange={(event) => setManualNumber(event.target.value)}
                  placeholder="150"
                  inputMode="numeric"
                />
              </label>
              <label>
                Nom
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Mewtwo"
                />
              </label>
              <button type="button" className="btn ghost" onClick={applyManual}>
                Chercher
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
                className="btn primary"
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
    </>
  )

  if (embedded) {
    return (
      <section className="scan-page" aria-labelledby={titleId}>
        <div className="panel scan-sheet is-embedded">{body}</div>
      </section>
    )
  }

  return (
    <div className="card-sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="card-sheet scan-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {body}
      </aside>
    </div>
  )
}
