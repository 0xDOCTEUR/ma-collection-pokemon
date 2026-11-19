interface Props {
  compact?: boolean
  className?: string
}

export function PokedocLogo({ compact = false, className = '' }: Props) {
  return (
    <div className={`pokedoc-logo ${compact ? 'compact' : ''} ${className}`.trim()}>
      <svg
        className="pokedoc-ball"
        viewBox="0 0 64 64"
        width={compact ? 28 : 36}
        height={compact ? 28 : 36}
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="30" fill="#f4f1ec" />
        <path d="M2 32a30 30 0 0 1 60 0" fill="#e63946" />
        <path d="M2 32h60" stroke="#0c1118" strokeWidth="5" />
        <circle cx="32" cy="32" r="30" stroke="#0c1118" strokeWidth="4" fill="none" />
        <circle cx="32" cy="32" r="11" fill="#0c1118" />
        <circle cx="32" cy="32" r="6.5" fill="#f4f1ec" />
        <circle cx="32" cy="32" r="3" fill="#0c1118" />
      </svg>
      <span className="pokedoc-word">POKEDOC</span>
    </div>
  )
}
