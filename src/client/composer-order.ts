/** Shared across connector bundles in the same renderer. Lower orders render left. */
const key = Symbol.for('dsh-connect.composer-orders.v1')
export function claimComposerOrder(preferred: number): { order: number; release: () => void } {
  const shared = globalThis as typeof globalThis & { [key]?: Set<number> }
  const occupied = shared[key] ??= new Set<number>()
  let order = preferred
  while (occupied.has(order)) order -= 1
  occupied.add(order)
  return { order, release: () => { occupied.delete(order) } }
}
