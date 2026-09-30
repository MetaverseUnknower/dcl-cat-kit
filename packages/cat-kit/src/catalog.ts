import type { KitCat } from './options'

const cat = (key: string, name: string, scale: number, social: number, nap: number, roam: number): KitCat =>
  ({ key, name, scale, social, nap, roam, models: `assets/dcl-cat-kit/cats/${key}`, voice: key })

/** The MetaPetal Cat Cafe's seven residents, ready to use (models, coats and voices CC BY 4.0, by MetaPetal). */
export const CAFE_CATS = {
  nermal: cat('nermal', 'Nermal', 1.0, 0.6, 0.5, 0.6),
  tigger: cat('tigger', 'Tigger', 1.08, 0.85, 0.4, 0.7),
  smoky: cat('smoky', 'Smoky', 1.04, 0.4, 0.75, 0.4),
  cloud: cat('cloud', 'Cloud', 0.96, 0.7, 0.5, 0.6),
  faith: cat('faith', 'Faith', 1.0, 0.75, 0.6, 0.5),
  haze: cat('haze', 'Haze', 0.94, 0.5, 0.55, 0.8),
  smudge: cat('smudge', 'Smudge', 1.0, 0.65, 0.55, 0.55)
}
