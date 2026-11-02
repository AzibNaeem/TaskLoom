import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { Link, useMatch } from 'react-router'
import { Icon } from '../../components/Icon'
import { mockControls, type ForcedFailure } from './controls'
import { resetDb } from './db'
import { realtimeStats, replayLastEvent, subscribeStats } from './realtime'
import { mockTools } from './server'
import styles from './MockToolsPanel.module.css'

// Demo-only panel. It exists so every loading, error, authorization and
// real-time scenario can be shown without a backend. Removed with the mocks.

export function MockToolsPanel() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [nextFailure, setNextFailure] = useState<ForcedFailure>('server')
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const qc = useQueryClient()
  const controls = useSyncExternalStore(mockControls.subscribe, mockControls.get)
  // Counters only grow, so their sum changes whenever any of them does.
  useSyncExternalStore(subscribeStats, () => realtimeStats.received + realtimeStats.duplicates + realtimeStats.missed)

  const wsMatch = useMatch('/w/:workspaceId/*')
  const projectMatch = useMatch('/w/:workspaceId/p/:projectId/*')
  const workspaceId = wsMatch?.params.workspaceId ?? null
  const projectId = projectMatch?.params.projectId ?? null

  useEffect(() => {
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const say = (text: string) => {
    setMessage(text)
    refresh()
  }

  const outbox = open ? mockTools.outbox() : []

  return (
    <div className={styles.wrap}>
      {open && (
        <section className={styles.panel} aria-label="Mock tools">
          <header className={styles.header}>
            <strong>Mock tools</strong>
            <span className="muted">frontend phase only</span>
            <button className="btn btn--ghost btn--icon" aria-label="Close mock tools" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </header>

          {message && (
            <p className="alert alert--info" role="status">
              {message}
            </p>
          )}

          <fieldset className={styles.group}>
            <legend>Network</legend>
            <label>
              Latency
              <select className="input" value={controls.latencyMs} onChange={(e) => mockControls.set({ latencyMs: Number(e.target.value) })}>
                <option value={0}>None</option>
                <option value={350}>350 ms</option>
                <option value={1200}>1.2 s</option>
                <option value={3000}>3 s (slow)</option>
              </select>
            </label>
            <label>
              Random failures
              <select className="input" value={controls.failureRate} onChange={(e) => mockControls.set({ failureRate: Number(e.target.value) })}>
                <option value={0}>Off</option>
                <option value={0.1}>10% of requests</option>
                <option value={0.3}>30% of requests</option>
              </select>
            </label>
            <div className={styles.row}>
              <select className="input" aria-label="Failure for the next request" value={nextFailure} onChange={(e) => setNextFailure(e.target.value as ForcedFailure)}>
                <option value="server">500 server error</option>
                <option value="forbidden">403 forbidden</option>
                <option value="validation">422 validation failure</option>
                <option value="network">Network error</option>
                <option value="unauthenticated">401 session expired</option>
              </select>
              <button
                className="btn btn--outline btn--sm"
                onClick={() => {
                  mockControls.set({ nextFailure })
                  say('The next request will fail. Try any action.')
                }}
              >
                Fail next request
              </button>
            </div>
            {controls.nextFailure !== 'none' && <p className="muted">Armed: {controls.nextFailure}</p>}
            <label className={styles.check}>
              <input type="checkbox" checked={controls.offline} onChange={(e) => mockControls.set({ offline: e.target.checked })} />
              Offline (disconnects live updates)
            </label>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => {
                mockControls.set({ sleeping: true })
                say('Server is "asleep". The next request takes ~4 s, like a free-tier wake-up.')
              }}
            >
              Simulate sleeping server
            </button>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Real-time</legend>
            <p className="muted">
              Received {realtimeStats.received} · duplicates ignored {realtimeStats.duplicates} · missed while offline {realtimeStats.missed}
            </p>
            <p className="muted">Tip: open a second tab and sign in as another demo user to see changes live.</p>
            <button
              className="btn btn--outline btn--sm"
              disabled={!workspaceId}
              onClick={() => say(mockTools.simulateTeammate(workspaceId!, projectId))}
            >
              Teammate makes a change
            </button>
            <button className="btn btn--outline btn--sm" onClick={() => say(replayLastEvent() ? 'Last event delivered again. It should be ignored as a duplicate.' : 'No event received yet.')}>
              Replay last event (duplicate)
            </button>
            <button className="btn btn--outline btn--sm" disabled={!projectId} onClick={() => say(mockTools.makeBoardStale(projectId!))}>
              Make board stale (silent change)
            </button>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Access and invitations</legend>
            <Link className="btn btn--ghost btn--sm" to="/w/ws-outsider/p/p-secret">
              Open a workspace you are not in
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/invite/demo-valid-invite">
              Open a valid invitation link
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/invite/demo-expired-invite">
              Open an expired invitation link
            </Link>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => {
                const n = mockTools.expireInvitations()
                qc.invalidateQueries({ queryKey: ['invitations'] })
                say(`${n} pending invitation(s) moved past their 48-hour expiry.`)
              }}
            >
              Expire all pending invitations
            </button>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Email outbox ({outbox.length})</legend>
            {outbox.length === 0 && <p className="muted">No emails sent yet. Invite someone, assign a task or @mention a teammate.</p>}
            <ul className={styles.outbox}>
              {outbox.map((m) => (
                <li key={m.id}>
                  <strong>{m.subject}</strong>
                  <span className="muted">
                    To {m.to} · {new Date(m.sentAt).toLocaleTimeString()}
                  </span>
                  <span>{m.body}</span>
                  {m.link && (
                    <Link to={new URL(m.link).pathname} className={styles.link}>
                      {m.link}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {outbox.length > 0 && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  mockTools.clearOutbox()
                  refresh()
                }}
              >
                Clear outbox
              </button>
            )}
          </fieldset>

          <button
            className="btn btn--danger btn--sm"
            onClick={() => {
              if (confirm('Reset all demo data in this browser? Every tab is signed out.')) {
                resetDb()
                sessionStorage.clear()
                window.location.assign('/login')
              }
            }}
          >
            Reset demo data
          </button>
        </section>
      )}
      <button className={`btn btn--outline ${styles.toggle}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="wrench" size={16} /> Mock tools
      </button>
    </div>
  )
}
