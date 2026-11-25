import type { CardPotential } from '../utils/psaHunt'

function formatPremium(premium: number | null | undefined): string | null {
  if (premium == null || !Number.isFinite(premium) || premium <= 0) return null
  return `×${premium.toLocaleString('fr-FR', {
    minimumFractionDigits: premium >= 10 ? 0 : 1,
    maximumFractionDigits: premium >= 10 ? 0 : 1,
  })}`
}

export function PotentialStamp({
  potential,
  inline = false,
  /** Sur les tuiles : n’afficher que les signaux utiles (marge / à suivre). */
  tileOnly = false,
}: {
  potential: CardPotential
  inline?: boolean
  tileOnly?: boolean
}) {
  if (tileOnly && potential.level !== 'open' && potential.level !== 'watch') {
    return null
  }

  const premiumLabel = formatPremium(potential.premium)

  return (
    <span
      className={`potential-stamp is-${potential.level}${inline ? ' is-inline' : ''}${tileOnly ? ' is-tile' : ''}`}
      title={potential.reason}
    >
      <span className="potential-dot" aria-hidden="true" />
      <span className="potential-label">{potential.title}</span>
      {premiumLabel && potential.level !== 'unknown' ? (
        <span className="potential-metric">{premiumLabel}</span>
      ) : null}
    </span>
  )
}
