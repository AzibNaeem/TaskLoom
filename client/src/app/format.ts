import { todayIso } from '../api/filters'

/** "Nov 9" for a YYYY-MM-DD due date (adds the year when it differs). */
export function formatDueDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(y, m - 1, d)
  const sameYear = y === new Date().getFullYear()
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function dueState(date: string | null): 'overdue' | 'today' | 'upcoming' | null {
  if (!date) return null
  const today = todayIso()
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  return 'upcoming'
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
