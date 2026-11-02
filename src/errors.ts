export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as { type?: unknown; message?: unknown }
    if (typeof value.message === 'string') return typeof value.type === 'string' ? `${value.type}: ${value.message}` : value.message
  }
  return String(error)
}
