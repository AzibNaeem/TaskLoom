import type { Task, TaskFilters } from './types'

export const emptyFilters: TaskFilters = {
  text: '',
  assigneeId: 'any',
  labelId: 'any',
  priority: 'any',
  due: 'any',
}

export function hasActiveFilters(f: TaskFilters): boolean {
  return f.text.trim() !== '' || f.assigneeId !== 'any' || f.labelId !== 'any' || f.priority !== 'any' || f.due !== 'any'
}

/** Local date as YYYY-MM-DD (due dates are calendar dates, not instants). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayIso(new Date(y, m - 1, d + days))
}

/** All filters combine with AND. Used by the board and by workspace search. */
export function matchesFilters(task: Task, f: TaskFilters, today = todayIso()): boolean {
  const text = f.text.trim().toLowerCase()
  if (text && !task.title.toLowerCase().includes(text) && !task.description.toLowerCase().includes(text)) return false

  if (f.assigneeId === 'unassigned' && task.assigneeId !== null) return false
  if (f.assigneeId !== 'any' && f.assigneeId !== 'unassigned' && task.assigneeId !== f.assigneeId) return false

  if (f.labelId !== 'any' && !task.labelIds.includes(f.labelId)) return false
  if (f.priority !== 'any' && task.priority !== f.priority) return false

  switch (f.due) {
    case 'none':
      return task.dueDate === null
    case 'overdue':
      return task.dueDate !== null && task.dueDate < today
    case 'today':
      return task.dueDate === today
    case 'week':
      return task.dueDate !== null && task.dueDate >= today && task.dueDate <= addDays(today, 7)
    default:
      return true
  }
}
