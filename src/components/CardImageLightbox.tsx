import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  src: string
  alt: string
  fallbackSrc?: string | null
  onClose: () => void
}

export function CardImageLightbox({ src, alt, fallbackSrc = null, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return createPortal(
    <div
      className="card-zoom-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Image agrandie : ${alt}`}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        type="button"
        className="card-zoom-close btn ghost"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        Fermer
      </button>
      <img
        className="card-zoom-image"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onError={(e) => {
          const img = e.currentTarget
          if (fallbackSrc && img.dataset.fallbackTried !== '1') {
            img.dataset.fallbackTried = '1'
            img.src = fallbackSrc
          }
        }}
      />
      <p className="card-zoom-hint">Clique à côté ou appuie sur Échap pour fermer</p>
    </div>,
    document.body,
  )
}
