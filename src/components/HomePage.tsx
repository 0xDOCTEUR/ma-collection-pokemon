import { PokedocLogo } from './PokedocLogo'

/** Carte Mew (151) pour le fond du hero. */
const HERO_ART = 'https://assets.tcgdex.net/fr/sv/sv03.5/151/high.webp'

interface Props {
  onOpenCollection: () => void
  onOpenScan: () => void
  onOpenLists: () => void
  onOpenEstimate: () => void
}

export function HomePage({
  onOpenCollection,
  onOpenScan,
  onOpenLists,
  onOpenEstimate,
}: Props) {
  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-bg" aria-hidden="true">
          <img
            src={HERO_ART}
            alt=""
            className="home-hero-art"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="home-hero-shade" />
        </div>

        <div className="home-hero-copy">
          <PokedocLogo className="hero-logo home-brand" />
          <h1 id="home-title" className="home-headline">
            Suis ta collection Pokémon
          </h1>
          <p className="home-lead">
            Séries, listes d’achat et scan d’une carte — tout au même endroit.
          </p>
          <div className="home-cta">
            <button type="button" className="btn primary home-cta-main" onClick={onOpenCollection}>
              Ma collection
            </button>
            <button type="button" className="btn ghost home-cta-secondary" onClick={onOpenScan}>
              Scanner une carte
            </button>
          </div>
        </div>
      </section>

      <section className="home-continue" aria-labelledby="home-continue-title">
        <h2 id="home-continue-title" className="home-continue-title">
          Continuer
        </h2>
        <p className="home-continue-lead">Choisis où reprendre.</p>
        <ul className="home-paths">
          <li>
            <button type="button" className="home-path" onClick={onOpenCollection}>
              <span className="home-path-label">Collection</span>
              <span className="home-path-desc">Coche ce que tu as, série par série.</span>
            </button>
          </li>
          <li>
            <button type="button" className="home-path" onClick={onOpenLists}>
              <span className="home-path-label">Listes</span>
              <span className="home-path-desc">Prépare tes achats et lots.</span>
            </button>
          </li>
          <li>
            <button type="button" className="home-path" onClick={onOpenEstimate}>
              <span className="home-path-label">Estimation</span>
              <span className="home-path-desc">Vois la valeur de ce que tu possèdes.</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  )
}
