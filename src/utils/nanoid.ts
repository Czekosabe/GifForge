/** Generates a short, unique id for layers/assets/jobs using the platform's crypto API. */
export function nanoid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
