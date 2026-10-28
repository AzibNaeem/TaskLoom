import { ApiError, type RealtimeClient, type RealtimeEvent, type RealtimeStatus } from '../types'
import { mockControls } from './controls'
import { loadDb } from './db'

// Simulates the Socket.IO connection. Events produced by the mock server in any
// tab travel over a BroadcastChannel; delivery re-checks workspace membership,
// exactly like the real server must before emitting to a room.

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('taskloom-mock-events') : null

let status: RealtimeStatus = 'offline'
let token: string | null = null
const joined = new Set<string>()
const seen: string[] = []
let lastEvent: RealtimeEvent | null = null

const statusListeners = new Set<(s: RealtimeStatus) => void>()
const eventListeners = new Set<(e: RealtimeEvent) => void>()
const resyncListeners = new Set<() => void>()

export const realtimeStats = { received: 0, duplicates: 0, missed: 0 }
const statsListeners = new Set<() => void>()
function bumpStats(key: keyof typeof realtimeStats) {
  realtimeStats[key] += 1
  statsListeners.forEach((l) => l())
}
export function subscribeStats(listener: () => void) {
  statsListeners.add(listener)
  return () => statsListeners.delete(listener)
}

function setStatus(next: RealtimeStatus) {
  if (status === next) return
  status = next
  statusListeners.forEach((l) => l(next))
}

function currentUserId(): string | null {
  if (!token) return null
  return loadDb().sessions.find((s) => s.token === token)?.userId ?? null
}

function isMember(workspaceId: string, userId: string): boolean {
  return loadDb().memberships.some((m) => m.workspaceId === workspaceId && m.userId === userId)
}

function evict(workspaceId: string, me: string) {
  joined.delete(workspaceId)
  const revoked: RealtimeEvent = { eventId: crypto.randomUUID(), type: 'workspace:access-revoked', workspaceId, projectId: null, actorId: me, at: new Date().toISOString(), data: { userId: me } }
  eventListeners.forEach((l) => l(revoked))
}

function deliver(event: RealtimeEvent) {
  if (status !== 'live') {
    bumpStats('missed')
    return
  }
  const me = currentUserId()
  if (!me || !joined.has(event.workspaceId)) return

  if (event.type === 'workspace:access-revoked') {
    if (event.data.userId && event.data.userId !== me) return
    joined.delete(event.workspaceId)
  } else if (!isMember(event.workspaceId, me)) {
    // Server-side rule: a user who lost membership is evicted from the room
    // and told so, instead of receiving the event.
    evict(event.workspaceId, me)
    return
  }

  if (seen.includes(event.eventId)) {
    bumpStats('duplicates')
    return
  }
  seen.push(event.eventId)
  if (seen.length > 500) seen.shift()
  bumpStats('received')
  eventListeners.forEach((l) => l(event))
}

/** Called by the mock server after a successful, persisted mutation. */
export function publish(event: RealtimeEvent) {
  lastEvent = event
  channel?.postMessage(event)
  deliver(event)
}

if (channel) {
  channel.onmessage = (e: MessageEvent<RealtimeEvent>) => {
    lastEvent = e.data
    deliver(e.data)
  }
}

/** Mock Tools: re-deliver the last event to prove duplicates are ignored. */
export function replayLastEvent(): boolean {
  if (!lastEvent) return false
  deliver(lastEvent)
  return true
}

function goOnline() {
  if (!token) return
  setStatus('reconnecting')
  setTimeout(() => {
    if (mockControls.get().offline || !navigator.onLine || !token) return
    const me = currentUserId()
    if (!me) {
      setStatus('offline')
      return
    }
    setStatus('live')
    // Re-join rooms; the server re-checks membership on every join.
    for (const ws of [...joined]) {
      if (!isMember(ws, me)) evict(ws, me)
    }
    resyncListeners.forEach((l) => l())
  }, 900)
}

function goOffline() {
  if (token) setStatus('offline')
}

let lastOffline = mockControls.get().offline
mockControls.subscribe(() => {
  const offline = mockControls.get().offline
  if (offline === lastOffline) return
  lastOffline = offline
  if (offline) goOffline()
  else goOnline()
})
window.addEventListener('offline', goOffline)
window.addEventListener('online', goOnline)

export function createMockRealtime(): RealtimeClient {
  return {
    connect(newToken) {
      token = newToken
      setStatus('connecting')
      setTimeout(() => {
        if (token !== newToken) return
        if (mockControls.get().offline || !navigator.onLine) return setStatus('offline')
        setStatus(currentUserId() ? 'live' : 'offline')
      }, 400)
    },
    disconnect() {
      token = null
      joined.clear()
      setStatus('offline')
    },
    async joinWorkspace(workspaceId) {
      await new Promise((r) => setTimeout(r, 150))
      const me = currentUserId()
      if (!me) throw new ApiError(401, 'UNAUTHENTICATED', 'Not signed in.')
      if (!isMember(workspaceId, me)) throw new ApiError(403, 'FORBIDDEN', 'You are not a member of this workspace.')
      joined.add(workspaceId)
    },
    leaveWorkspace(workspaceId) {
      joined.delete(workspaceId)
    },
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
