import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { api } from '../../api'
import { qk } from '../../api/queryKeys'
import { ApiError, type Column, type Label, type Member, type Task } from '../../api/types'
import { useToast } from '../../app/toast'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/States'
import { TaskCardContent } from './TaskCard'
import { useWorkspace } from '../workspaces/WorkspaceLayout'
import styles from './board.module.css'

export function BoardPage() {
  const { workspace, can } = useWorkspace()
  const { projectId = '' } = useParams()

  const board = useQuery({ queryKey: qk.board(projectId), queryFn: () => api.board.get(projectId) })
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => api.members.list(workspace.id) })
  const labels = useQuery({ queryKey: qk.labels(workspace.id), queryFn: () => api.labels.list(workspace.id) })

  const canWrite = can('task:write')
  const canManage = can('project:manage')

  if (board.isPending) return <LoadingState label="Loading board…" />
  if (board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />

  const { project, columns, tasks } = board.data

  return (
    <>
      <PageHeader title={project.name} subtitle={project.description || undefined} />

      {!canWrite && (
        <p className="alert alert--info">
          <Icon name="alert" size={16} /> You are a Viewer: you can browse the board but not change it.
        </p>
      )}

      <div className={styles.boardWrap}>
        <div className={styles.board}>
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasks.filter((t) => t.columnId === column.id)}
              workspaceId={workspace.id}
              labels={labels.data ?? []}
              members={members.data ?? []}
              canManage={canManage}
            />
          ))}
          {canManage && <AddColumn projectId={projectId} />}
        </div>
      </div>
    </>
  )
}

interface ColumnProps {
  column: Column
  tasks: Task[]
  workspaceId: string
  labels: Label[]
  members: Member[]
  canManage: boolean
}

function BoardColumn({ column, tasks, workspaceId, labels, members, canManage }: ColumnProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)

  const rename = useMutation({
    mutationFn: () => api.columns.rename(column.id, name),
    onSuccess: () => {
      setRenaming(false)
      qc.invalidateQueries({ queryKey: qk.board(column.projectId) })
    },
    onError: (e: ApiError) => toast(Object.values(e.fieldErrors)[0] ?? e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: () => api.columns.remove(column.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.board(column.projectId) }),
    onError: (e: ApiError) => toast(e.message, 'error'),
  })

  return (
    <section className={styles.column} aria-label={`${column.name} column`}>
      <header className={styles.columnHeader}>
        {renaming ? (
          <form
            className={styles.renameForm}
            onSubmit={(e) => {
              e.preventDefault()
              rename.mutate()
            }}
          >
            <label htmlFor={`rename-${column.id}`} className="visually-hidden">
              Column name
            </label>
            <input
              id={`rename-${column.id}`}
              className="input"
              value={name}
              maxLength={30}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRenaming(false)
                  setName(column.name)
                }
              }}
            />
            <button className="btn btn--primary btn--sm" disabled={rename.isPending}>
              Save
            </button>
          </form>
        ) : (
          <>
            <h2 className={styles.columnTitle}>{column.name}</h2>
            <span className={styles.count}>{tasks.length}</span>
            {canManage && (
              <span className={styles.columnActions}>
                <button
                  className="btn btn--ghost btn--icon"
                  aria-label={`Rename ${column.name}`}
                  onClick={() => {
                    setName(column.name)
                    setRenaming(true)
                  }}
                >
                  <Icon name="edit" size={14} />
                </button>
                <button
                  className="btn btn--ghost btn--icon"
                  aria-label={`Delete ${column.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (tasks.length > 0) toast('Move or delete the tasks in this column first.', 'warning')
                    else if (confirm(`Delete the "${column.name}" column?`)) remove.mutate()
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </span>
            )}
          </>
        )}
      </header>

      <ol className={styles.cards}>
        {tasks.map((task) => (
          <li key={task.id} className={styles.card}>
            <TaskCardContent task={task} to={`/w/${workspaceId}/p/${task.projectId}/t/${task.id}`} labels={labels} members={members} />
          </li>
        ))}
        {tasks.length === 0 && <li className={styles.emptyColumn}>No tasks</li>}
      </ol>
    </section>
  )
}

function AddColumn({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => api.columns.create(projectId, name),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }
  const error = create.error instanceof ApiError ? (Object.values(create.error.fieldErrors)[0] ?? create.error.message) : null

  return (
    <form className={`${styles.column} ${styles.addColumn}`} onSubmit={submit}>
      <label htmlFor="new-column" className="field-label">
        Add a column
      </label>
      <input id="new-column" className="input" placeholder="e.g. Blocked" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      {error && <span className="field-error">{error}</span>}
      <button className="btn btn--outline btn--sm" disabled={create.isPending || !name.trim()}>
        <Icon name="plus" size={14} /> Add column
      </button>
    </form>
  )
}
