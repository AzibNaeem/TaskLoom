// Per-tab switches for the mock backend, driven by the Mock Tools panel.
// They let us demonstrate loading, errors, offline and wake-up states.

export type ForcedFailure = 'none' | 'server' | 'forbidden' | 'validation' | 'network' | 'unauthenticated'

export interface MockControls {
  latencyMs: number
  failureRate: number
  nextFailure: ForcedFailure
  offline: boolean
  /** Next request waits ~4s, like a sleeping free-tier server. */
  sleeping: boolean
}

const KEY = 'taskloom-mock-controls'
const defaults: MockControls = { latencyMs: 350, failureRate: 0, nextFailure: 'none', offline: false, sleeping: false }

let state: MockControls = read()
const listeners = new Set<() => void>()

function read(): MockControls {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<MockControls>) } : defaults
  } catch {
    return defaults
  }
}

export const mockControls = {
  get: (): MockControls => state,
  set(patch: Partial<MockControls>) {
    state = { ...state, ...patch }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // ignore storage failures
    }
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
