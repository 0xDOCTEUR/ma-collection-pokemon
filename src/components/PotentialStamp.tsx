import type { CardPotential } from '../utils/psaHunt'

export function PotentialStamp({
  potential,
  inline = false,
}: {
  potential: CardPotential
  inline?: boolean
}) {
  return (
    <span
      className={`potential-stamp is-${potential.level}${inline ? ' is-inline' : ''}`}
      title={potential.reason}
    >
      {potential.title}
    </span>
  )
}
