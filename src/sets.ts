export interface SetInfo {
  id: string
  name: string
  shortName: string
  dataUrl: string
  populationUrl: string
  /** Recensement PSA des cartes françaises, même numéro que la série. */
  frenchPopulationUrl?: string
  logo: string
  logoFallback?: string
}

const base = import.meta.env.BASE_URL

export const SETS: SetInfo[] = [
  {
    id: 'sv03.5',
    name: 'Pokémon 151',
    shortName: '151',
    dataUrl: `${base}data/sets/sv03.5.json`,
    populationUrl: `${base}data/population/sv03.5.json`,
    frenchPopulationUrl: `${base}data/population/sv03.5-fr.json`,
    logo: 'https://assets.tcgdex.net/fr/sv/sv03.5/logo.webp',
    logoFallback: 'https://images.pokemontcg.io/sv3pt5/logo.png',
  },
  {
    id: 'me06',
    name: 'Règne Delta',
    shortName: 'Règne Delta',
    dataUrl: `${base}data/sets/me06.json`,
    populationUrl: `${base}data/population/me06.json`,
    // Pas encore de logo officiel sur TCGdex : on affiche une carte du set
    logo: 'https://assets.tcgdex.net/fr/me/me06/084/high.webp',
  },
]

export type AppTab = 'accueil' | 'collection' | 'scan' | 'estimation' | 'listes'
