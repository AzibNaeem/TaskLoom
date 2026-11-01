import { Icon, type IconName } from '../../components/Icon'
import type { RealtimeStatus } from '../../api/types'
import { useRealtimeStatus, useServerWaking } from './useWorkspaceRealtime'
import styles from './ConnectionStatus.module.css'

const view: Record<RealtimeStatus, { label: string; icon: IconName; tone: string }> = {
  live: { label: 'Live', icon: 'live', tone: 'success' },
  connecting: { label: 'Connecting…', icon: 'clock', tone: 'info' },
  reconnecting: { label: 'Reconnecting…', icon: 'refresh', tone: 'warning' },
  offline: { label: 'Offline', icon: 'offline', tone: 'error' },
}

/** Compact indicator for the sidebar. Always icon + text, never colour alone. */
export function ConnectionStatus() {
  const status = useRealtimeStatus()
  const waking = useServerWaking()
  const v = waking ? { label: 'Server waking up…', icon: 'clock' as const, tone: 'info' } : view[status]
  return (
    <div className={`${styles.status} ${styles[v.tone]}`} aria-live="polite">
      <Icon name={v.icon} size={16} />
      <span>{v.label}</span>
    </div>
  )
}

/** Full-width banner shown above page content when something is degraded. */
export function ConnectionBanner() {
  const status = useRealtimeStatus()
  const waking = useServerWaking()
  if (waking) {
    return (
      <div className="alert alert--info" role="status">
        <Icon name="clock" size={16} />
        <span>The server is waking up. Free hosting sleeps when idle, so this can take up to a minute.</span>
      </div>
    )
  }
  if (status === 'offline') {
    return (
      <div className="alert alert--error" role="status">
        <Icon name="offline" size={16} />
        <span>You are offline. Changes cannot be saved right now. Everything will refresh when the connection returns.</span>
      </div>
    )
  }
  if (status === 'reconnecting') {
    return (
      <div className="alert alert--warning" role="status">
        <Icon name="refresh" size={16} />
        <span>Reconnecting to live updates…</span>
      </div>
    )
  }
  return null
}
