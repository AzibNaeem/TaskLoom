import { Link } from 'react-router'
import type { Label, Member, Priority, Task } from '../../api/types'
import { dueState, formatDueDate } from '../../app/format'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import styles from './board.module.css'

const priorityText: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="badge" style={{ color: `var(--priority-${priority})` }}>
      {priorityText[priority]}
    </span>
  )
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className={styles.label}>
      <span className="dot" style={{ color: `var(--label-${label.color})` }} />
      {label.name}
    </span>
  )
}

export function DueBadge({ date }: { date: string }) {
  const state = dueState(date)
  return (
    <span className={`${styles.due} ${state === 'overdue' ? styles.overdue : state === 'today' ? styles.today : ''}`}>
      <Icon name="clock" size={12} />
      {state === 'overdue' ? 'Overdue · ' : state === 'today' ? 'Today · ' : ''}
      {formatDueDate(date)}
    </span>
  )
}

/** Card content only; the board wraps it with drag-and-drop behaviour. */
export function TaskCardContent({ task, to, labels, members }: { task: Task; to: string; labels: Label[]; members: Member[] }) {
  const assignee = members.find((m) => m.user.id === task.assigneeId)?.user
  const taskLabels = task.labelIds.map((id) => labels.find((l) => l.id === id)).filter((l): l is Label => !!l)

  return (
    <>
      <Link to={to} className={styles.cardTitle}>
        {task.title}
      </Link>
      {taskLabels.length > 0 && (
        <div className={styles.cardLabels}>
          {taskLabels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <div className={styles.cardMeta}>
        <PriorityBadge priority={task.priority} />
        {task.dueDate && <DueBadge date={task.dueDate} />}
        <span className={styles.spacer} />
        {assignee ? (
          <span title={`Assigned to ${assignee.name}`}>
            <Avatar name={assignee.name} size={24} />
            <span className="visually-hidden">Assigned to {assignee.name}</span>
          </span>
        ) : (
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            Unassigned
          </span>
        )}
      </div>
    </>
  )
}
