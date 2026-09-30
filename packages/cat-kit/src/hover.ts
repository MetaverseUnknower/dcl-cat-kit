export type Hover = 'pet' | 'call' | 'asleep'

/** "Pet <name>" up close, "Psspsspss" from further off, "<name> is sleeping..." while she sleeps. */
export function hoverText(action: Hover, name: string): string {
  return action === 'pet' ? `Pet ${name}` : action === 'asleep' ? `${name} is sleeping...` : 'Psspsspss'
}
