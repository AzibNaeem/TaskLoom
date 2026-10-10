import { createMockApi } from './mock/server'
import { createMockRealtime } from './mock/realtime'
import type { Api, RealtimeClient } from './types'

// The single place where the UI gets its services. In the backend phase an
// HTTP + socket.io-client implementation of the same interfaces is added here
// and selected with VITE_API_MODE=http; no UI code changes.

export const isMockMode = (import.meta.env.VITE_API_MODE ?? 'mock') === 'mock'

// ---- Slow-request tracking (free-tier servers sleep and take time to wake) ----

const SLOW_AFTER_MS = 2500
let slowCount = 0
const slowListeners = new Set<() => void>()

export const serverWaking = {
  get: () => slowCount > 0,
  subscribe(listener: () => void) {
    slowListeners.add(listener)
    return () => slowListeners.delete(listener)
  },
}

function track<T>(promise: Promise<T>): Promise<T> {
  let slow = false
  const timer = setTimeout(() => {
    slow = true
    slowCount += 1
    slowListeners.forEach((l) => l())
  }, SLOW_AFTER_MS)
  return promise.finally(() => {
    clearTimeout(timer)
    if (slow) {
      slowCount -= 1
      slowListeners.forEach((l) => l())
    }
  })
}

function instrument(api: Api): Api {
  const wrapped = {} as Record<string, Record<string, unknown>>
  for (const [group, methods] of Object.entries(api)) {
    wrapped[group] = {}
    for (const [name, fn] of Object.entries(methods as Record<string, (...args: unknown[]) => Promise<unknown>>)) {
      wrapped[group][name] = (...args: unknown[]) => track(fn(...args))
    }
  }
  return wrapped as unknown as Api
}

export const api: Api = instrument(createMockApi())
export const realtime: RealtimeClient = createMockRealtime()
