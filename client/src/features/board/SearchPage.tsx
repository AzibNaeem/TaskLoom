import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { emptyFilters, hasActiveFilters } from '../../api/filters'
import { qk } from '../../api/queryKeys'
import type { Label } from '../../api/types'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { useWorkspace } from '../workspaces/WorkspaceLayout'
import { FilterBar } from './FilterBar'
import { DueBadge, LabelChip, PriorityBadge } from './TaskCard'
import styles from './search.module.css'

/** Workspace-wide search; the server applies all filters together. */
export function SearchPage() {
  const { workspace } = useWorkspace()
  const [filters, setFilters] = useState(emptyFilters)
  const [debounced, setDebounced] = useState(emptyFilters)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(filters), 250)
    return () => clearTimeout(id)
  }, [filters])

  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => api.members.list(workspace.id) })
  const labels = useQuery({ queryKey: qk.labels(workspace.id), queryFn: () => api.labels.list(workspace.id) })
  const results = useQuery({
    queryKey: qk.search(workspace.id, debounced),
    queryFn: () => api.tasks.search(workspace.id, debounced),
    enabled: hasActiveFilters(debounced),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageHeader title="Search" subtitle={`Find tasks across every project in ${workspace.name}.`} />
      <FilterBar value={filters} onChange={setFilters} members={members.data ?? []} labels={labels.data ?? []} />

      {!hasActiveFilters(debounced) && <EmptyState title="Search your workspace">Type a word or choose a filter. Filters combine, e.g. high priority + overdue + assigned to you.</EmptyState>}
      {hasActiveFilters(debounced) && results.isPending && <LoadingState label="Searching…" />}
      {results.isError && <ErrorState error={results.error} onRetry={() => results.refetch()} />}
      {hasActiveFilters(debounced) && results.data?.length === 0 && <EmptyState title="No matching tasks">Try removing a filter.</EmptyState>}

      {hasActiveFilters(debounced) && results.data && results.data.length > 0 && (
        <>
          <p className="muted" role="status">
            {results.data.length === 50 ? 'Showing the first 50 results.' : `${results.data.length} result${results.data.length === 1 ? '' : 's'}`}
          </p>
          <ul className={styles.results} style={{ opacity: results.isPlaceholderData ? 0.6 : 1 }}>
            {results.data.map(({ task, projectName, columnName }) => {
              const assignee = members.data?.find((m) => m.user.id === task.assigneeId)?.user
              return (
                <li key={task.id} className={`card ${styles.result}`}>
                  <Link to={`/w/${workspace.id}/p/${task.projectId}/t/${task.id}`} className={styles.title}>
                    {task.title}
                  </Link>
                  <p className="muted">
                    {projectName} · {columnName}
                  </p>
                  <div className={styles.meta}>
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && <DueBadge date={task.dueDate} />}
                    {task.labelIds
                      .map((id) => labels.data?.find((l) => l.id === id))
                      .filter((l): l is Label => !!l)
                      .map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                    <span style={{ flex: 1 }} />
                    {assignee ? (
                      <span className={styles.assignee}>
                        <Avatar name={assignee.name} size={22} /> {assignee.name}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
