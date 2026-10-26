import { emptyFilters, hasActiveFilters } from '../../api/filters'
import type { DueFilter, Label, Member, Priority, TaskFilters } from '../../api/types'
import { Icon } from '../../components/Icon'
import styles from './board.module.css'

interface Props {
  value: TaskFilters
  onChange(next: TaskFilters): void
  members: Member[]
  labels: Label[]
}

/** Search text plus assignee, label, priority and due filters, combined with AND. */
export function FilterBar({ value, onChange, members, labels }: Props) {
  const set = <K extends keyof TaskFilters>(key: K, v: TaskFilters[K]) => onChange({ ...value, [key]: v })

  return (
    <div className={styles.filters} role="search">
      <div className={styles.searchBox}>
        <Icon name="search" size={16} />
        <label htmlFor="filter-text" className="visually-hidden">
          Search tasks
        </label>
        <input id="filter-text" className="input" placeholder="Search tasks…" value={value.text} onChange={(e) => set('text', e.target.value)} />
      </div>

      <label className="visually-hidden" htmlFor="filter-assignee">
        Assignee
      </label>
      <select id="filter-assignee" className="input" value={value.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
        <option value="any">Any assignee</option>
        <option value="unassigned">Unassigned</option>
        {members.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.name}
          </option>
        ))}
      </select>

      <label className="visually-hidden" htmlFor="filter-label">
        Label
      </label>
      <select id="filter-label" className="input" value={value.labelId} onChange={(e) => set('labelId', e.target.value)}>
        <option value="any">Any label</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <label className="visually-hidden" htmlFor="filter-priority">
        Priority
      </label>
      <select id="filter-priority" className="input" value={value.priority} onChange={(e) => set('priority', e.target.value as Priority | 'any')}>
        <option value="any">Any priority</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <label className="visually-hidden" htmlFor="filter-due">
        Due date
      </label>
      <select id="filter-due" className="input" value={value.due} onChange={(e) => set('due', e.target.value as DueFilter)}>
        <option value="any">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="week">Due in the next 7 days</option>
        <option value="none">No due date</option>
      </select>

      {hasActiveFilters(value) && (
        <button className="btn btn--ghost btn--sm" onClick={() => onChange(emptyFilters)}>
          Clear filters
        </button>
      )}
    </div>
  )
}
