type Entry<T> = { data: T; ts: number }
const store = new Map<string, Entry<unknown>>()
const TTL = 2 * 60_000 // 2 minutes

export const pageCache = {
  get<T>(key: string): T | null {
    const e = store.get(key)
    if (!e || Date.now() - e.ts > TTL) { store.delete(key); return null }
    return e.data as T
  },
  set<T>(key: string, data: T): void {
    store.set(key, { data, ts: Date.now() })
  },
  del(key: string): void { store.delete(key) },
}
