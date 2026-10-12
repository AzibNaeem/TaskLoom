import type { ReactNode } from 'react'
import { ApiError } from '../api/types'
import { Icon } from './Icon'
import styles from './States.module.css'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className={styles.spinner} role="status">
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={styles.state}>
      <Spinner label={label} />
      <p className="muted">{label}</p>
    </div>
  )
}

const titles: Partial<Record<ApiError['code'], string>> = {
  FORBIDDEN: 'You do not have access',
  NOT_FOUND: 'Not found',
  NETWORK: 'You are offline',
  UNAUTHENTICATED: 'Please sign in again',
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null
  const title = (apiError && titles[apiError.code]) ?? 'Something went wrong'
  const message = apiError?.message ?? 'An unexpected error occurred.'
  return (
    <div className={styles.state} role="alert">
      <span className={styles.errorIcon}>
        <Icon name={apiError?.code === 'NETWORK' ? 'offline' : 'alert'} size={28} />
      </span>
      <h2>{title}</h2>
      <p className="muted">{message}</p>
      {onRetry && apiError?.code !== 'FORBIDDEN' && apiError?.code !== 'NOT_FOUND' && (
        <button className="btn btn--outline" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.state}>
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

/** Small inline error for a failed mutation. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof ApiError ? error.message : 'Something went wrong.'
  return (
    <p className="alert alert--error" role="alert">
      <Icon name="alert" size={16} /> {message}
    </p>
  )
}
