import type { Label, Member, Priority, TaskInput } from '../../api/types'
import styles from './tasks.module.css'

interface Props {
  value: TaskInput
  onChange(next: TaskInput): void
  members: Member[]
  labels: Label[]
  errors: Record<string, string>
  idPrefix: string
}

export function TaskFields({ value, onChange, members, labels, errors, idPrefix }: Props) {
  const set = <K extends keyof TaskInput>(key: K, v: TaskInput[K]) => onChange({ ...value, [key]: v })
  const id = (name: string) => `${idPrefix}-${name}`
  const assignable = members.filter((m) => m.role !== 'viewer')

  return (
    <div className={styles.fields}>
      <div className="field">
        <label htmlFor={id('title')}>Title</label>
        <input id={id('title')} className="input" value={value.title} maxLength={120} onChange={(e) => set('title', e.target.value)} aria-invalid={errors.title ? true : undefined} />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </div>

      <div className="field">
        <label htmlFor={id('description')}>Description</label>
        <textarea id={id('description')} className="input" value={value.description} onChange={(e) => set('description', e.target.value)} aria-invalid={errors.description ? true : undefined} />
        {errors.description && <span className="field-error">{errors.description}</span>}
      </div>

      <div className={styles.row}>
        <div className="field">
          <label htmlFor={id('assignee')}>Assignee</label>
          <select id={id('assignee')} className="input" value={value.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value || null)} aria-invalid={errors.assigneeId ? true : undefined}>
            <option value="">Unassigned</option>
            {assignable.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
          {errors.assigneeId && <span className="field-error">{errors.assigneeId}</span>}
        </div>

        <div className="field">
          <label htmlFor={id('due')}>Due date</label>
          <input id={id('due')} type="date" className="input" value={value.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} aria-invalid={errors.dueDate ? true : undefined} />
          {errors.dueDate && <span className="field-error">{errors.dueDate}</span>}
        </div>

        <div className="field">
          <label htmlFor={id('priority')}>Priority</label>
          <select id={id('priority')} className="input" value={value.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <fieldset className={styles.labelPicker}>
        <legend className="field-label">Labels</legend>
        {labels.length === 0 && <span className="muted">No labels in this workspace yet. Owners and Admins can add them in workspace settings.</span>}
        {labels.map((l) => {
          const checked = value.labelIds.includes(l.id)
          return (
            <label key={l.id} className={`badge ${styles.labelOption} ${checked ? styles.labelChecked : ''}`}>
              <input type="checkbox" className="visually-hidden" checked={checked} onChange={() => set('labelIds', checked ? value.labelIds.filter((x) => x !== l.id) : [...value.labelIds, l.id])} />
              <span className="dot" style={{ color: `var(--label-${l.color})` }} />
              {l.name}
            </label>
          )
        })}
        {errors.labelIds && <span className="field-error">{errors.labelIds}</span>}
      </fieldset>
    </div>
  )
}
