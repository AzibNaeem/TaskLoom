import type { Activity } from '../../api/types'
import { timeAgo } from '../../app/format'
import { Avatar } from '../../components/Avatar'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import styles from './tasks.module.css'

function describe(a: Activity): string {
  const d = a.data
  switch (a.type) {
    case 'task.created':
      return `created "${d.title}"${d.column ? ` in ${d.column}` : ''}`
    case 'task.updated':
      return `changed ${d.fields} on "${d.title}"`
    case 'task.moved':
      return `moved "${d.title}" from ${d.from} to ${d.to}`
    case 'task.deleted':
      return `deleted "${d.title}"`
    case 'comment.created':
      return `commented on "${d.title}"`
    case 'project.created':
      return `created project ${d.name}`
    case 'project.updated':
      return `updated project ${d.name}`
    case 'project.deleted':
      return `deleted project ${d.name}`
    case 'column.created':
      return `added column ${d.name}`
    case 'column.renamed':
      return `renamed column ${d.from} to ${d.to}`
    case 'column.deleted':
      return `deleted column ${d.name}`
    case 'member.invited':
      return `invited ${d.email} as ${d.role}`
    case 'member.joined':
      return `joined as ${d.role}`
    case 'member.role_changed':
      return `changed ${d.name} from ${d.from} to ${d.to}`
    case 'member.removed':
      return d.reason === 'left' ? 'left the workspace' : `removed ${d.name}`
  }
}

interface Props {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: Activity[]; refetch(): unknown }
}

export function ActivityList({ query }: Props) {
  if (query.isPending) return <LoadingState label="Loading activity…" />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data || query.data.length === 0) return <EmptyState title="No activity yet" />
  return (
    <ol className={styles.activity}>
      {query.data.map((a) => (
        <li key={a.id}>
          <Avatar name={a.actor.name} size={24} />
          <p>
            <strong>{a.actor.name}</strong> {describe(a)}
            <time className="muted" dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>
              {' · '}
              {timeAgo(a.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  )
}
