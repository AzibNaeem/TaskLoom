import type { RealtimeClient, RealtimeEvent, RealtimeStatus } from '../types'

// Placeholder for the Socket.IO connection. The mock server already publishes an
// event after every persisted mutation, so the contract is fixed from the start,
// but delivery is in-tab only for now: rooms, cross-tab transport, membership
// re-checks, dedupe and reconnect resync land in the real-time phase.

let status: RealtimeStatus = 'offline'
let token: string | null = null

const statusListeners = new Set<(s: RealtimeStatus) => void>()
const eventListeners = new Set<(e: RealtimeEvent) => void>()
const resyncListeners = new Set<() => void>()

function setStatus(next: RealtimeStatus) {
  if (status === next) return
  status = next
  statusListeners.forEach((l) => l(next))
}

/** Called by the mock server after a successful, persisted mutation. */
export function publish(event: RealtimeEvent) {
  if (status !== 'live') return
  eventListeners.forEach((l) => l(event))
}

export function createMockRealtime(): RealtimeClient {
  return {
    connect(newToken) {
      token = newToken
      setStatus('connecting')
      setTimeout(() => {
        if (token === newToken) setStatus('live')
      }, 400)
    },
    disconnect() {
      token = null
      setStatus('offline')
    },
    async joinWorkspace() {
      // No room authorisation yet; every connected tab sees its own events.
    },
    leaveWorkspace() {},
    getStatus: () => status,
    onStatus(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    onEvent(listener) {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    },
    onResync(listener) {
      resyncListeners.add(listener)
      return () => resyncListeners.delete(listener)
    },
  }
}
