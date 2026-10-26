import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Outlet, useParams } from 'react-router'
import { api } from '../../api'
import { emptyFilters, hasActiveFilters, matchesFilters } from '../../api/filters'
import { qk } from '../../api/queryKeys'
import { ApiError, type Board, type Column, type Label, type Member, type Task, type TaskInput } from '../../api/types'
import { useToast } from '../../app/toast'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, InlineError, LoadingState } from '../../components/States'
import { ActivityList } from '../tasks/ActivityList'
import { TaskFields } from '../tasks/TaskFields'
import { useWorkspace } from '../workspaces/WorkspaceLayout'
import { FilterBar } from './FilterBar'
import { TaskCardContent } from './TaskCard'
import styles from './board.module.css'

/** Same placement rule as the server, so the optimistic move matches the result. */
function placeTask(tasks: Task[], taskId: string, columnId: string, afterTaskId: string | null): Task[] {
  const siblings = tasks.filter((t) => t.columnId === columnId && t.id !== taskId).sort((a, b) => a.position - b.position)
  let position: number
  if (afterTaskId === null) position = siblings.length ? siblings[0].position - 1000 : 1000
  else {
    const idx = siblings.findIndex((t) => t.id === afterTaskId)
    if (idx === -1) return tasks
    const next = siblings[idx + 1]
    position = next ? (siblings[idx].position + next.position) / 2 : siblings[idx].position + 1000
  }
  return tasks.map((t) => (t.id === taskId ? { ...t, columnId, position } : t)).sort((a, b) => a.position - b.position)
}

export function BoardPage() {
  const workspaceContext = useWorkspace()
  const { workspace, can } = workspaceContext
  const { projectId = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()

  const board = useQuery({ queryKey: qk.board(projectId), queryFn: () => api.board.get(projectId) })
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => api.members.list(workspace.id) })
  const labels = useQuery({ queryKey: qk.labels(workspace.id), queryFn: () => api.labels.list(workspace.id) })
  const activity = useQuery({ queryKey: qk.projectActivity(projectId), queryFn: () => api.activity.list({ projectId }) })

  const [filters, setFilters] = useState(emptyFilters)
  const [showActivity, setShowActivity] = useState(false)
  const [createIn, setCreateIn] = useState<Column | null>(null)

  const canWrite = can('task:write')
  const canManage = can('project:manage')

  const move = useMutation({
    mutationFn: (v: { task: Task; columnId: string; afterTaskId: string | null }) =>
      api.tasks.move(v.task.id, { columnId: v.columnId, afterTaskId: v.afterTaskId, version: v.task.version }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.board(projectId) })
      const previous = qc.getQueryData<Board>(qk.board(projectId))
      qc.setQueryData<Board>(qk.board(projectId), (b) => (b ? { ...b, tasks: placeTask(b.tasks, v.task.id, v.columnId, v.afterTaskId) } : b))
      return { previous }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
    },
    onError: (error: ApiError, _v, context) => {
      if (context?.previous) qc.setQueryData(qk.board(projectId), context.previous)
      toast(error.message, 'error')
      if (error.code === 'CONFLICT' || error.code === 'NOT_FOUND') qc.invalidateQueries({ queryKey: qk.board(projectId) })
    },
  })

  const visible = useMemo(() => {
    const byColumn = new Map<string, Task[]>()
    for (const t of board.data?.tasks ?? []) {
      if (!matchesFilters(t, filters)) continue
      byColumn.set(t.columnId, [...(byColumn.get(t.columnId) ?? []), t])
    }
    return byColumn
  }, [board.data, filters])

  if (board.isPending) return <LoadingState label="Loading board…" />
  if (board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />

  const { project, columns, tasks } = board.data
  const visibleCount = [...visible.values()].reduce((n, list) => n + list.length, 0)

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const task = tasks.find((t) => t.id === draggableId)
    if (!task) return
    const destVisible = (visible.get(destination.droppableId) ?? []).filter((t) => t.id !== draggableId)
    const afterTaskId = destination.index === 0 ? null : (destVisible[destination.index - 1]?.id ?? null)
    move.mutate({ task, columnId: destination.droppableId, afterTaskId })
  }

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <button className="btn btn--outline" aria-pressed={showActivity} onClick={() => setShowActivity((s) => !s)}>
            <Icon name="activity" size={16} /> Activity
          </button>
        }
      />

      <FilterBar value={filters} onChange={setFilters} members={members.data ?? []} labels={labels.data ?? []} />
      {hasActiveFilters(filters) && (
        <p className="muted" role="status">
          Showing {visibleCount} of {tasks.length} tasks.
        </p>
      )}
      {!canWrite && (
        <p className="alert alert--info">
          <Icon name="alert" size={16} /> You are a Viewer: you can browse the board but not change it.
        </p>
      )}

      <div className={styles.boardWrap}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className={styles.board}>
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={visible.get(column.id) ?? []}
                totalInColumn={tasks.filter((t) => t.columnId === column.id).length}
                workspaceId={workspace.id}
                labels={labels.data ?? []}
                members={members.data ?? []}
                canWrite={canWrite}
                canManage={canManage}
                onAddTask={() => setCreateIn(column)}
              />
            ))}
            {canManage && <AddColumn projectId={projectId} />}
          </div>
        </DragDropContext>

        {showActivity && (
          <aside className={`card ${styles.activityPanel}`} aria-label="Project activity">
            <div className={styles.activityHeader}>
              <h2>Activity</h2>
              <button className="btn btn--ghost btn--icon" aria-label="Close activity" onClick={() => setShowActivity(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <ActivityList query={activity} />
          </aside>
        )}
      </div>

      <CreateTaskModal key={createIn?.id} column={createIn} projectId={projectId} members={members.data ?? []} labels={labels.data ?? []} onClose={() => setCreateIn(null)} />
      <Outlet context={workspaceContext} />
    </>
  )
}

interface ColumnProps {
  column: Column
  tasks: Task[]
  totalInColumn: number
  workspaceId: string
  labels: Label[]
  members: Member[]
  canWrite: boolean
  canManage: boolean
  onAddTask(): void
}

function BoardColumn({ column, tasks, totalInColumn, workspaceId, labels, members, canWrite, canManage, onAddTask }: ColumnProps) {
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
            <span className={styles.count}>{tasks.length === totalInColumn ? totalInColumn : `${tasks.length}/${totalInColumn}`}</span>
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
                    if (totalInColumn > 0) toast('Move or delete the tasks in this column first.', 'warning')
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

      <Droppable droppableId={column.id} isDropDisabled={!canWrite}>
        {(provided, snapshot) => (
          <ol ref={provided.innerRef} {...provided.droppableProps} className={`${styles.cards} ${snapshot.isDraggingOver ? styles.dropTarget : ''}`}>
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canWrite}>
                {(drag, dragSnapshot) => (
                  <li
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    {...drag.dragHandleProps}
                    className={`${styles.card} ${dragSnapshot.isDragging ? styles.dragging : ''}`}
                  >
                    <TaskCardContent task={task} to={`/w/${workspaceId}/p/${task.projectId}/t/${task.id}`} labels={labels} members={members} />
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && <li className={styles.emptyColumn}>{totalInColumn > 0 ? 'No matching tasks' : 'No tasks'}</li>}
          </ol>
        )}
      </Droppable>

      {canWrite && (
        <button className={`btn btn--ghost btn--sm ${styles.addTask}`} onClick={onAddTask}>
          <Icon name="plus" size={14} /> Add task
        </button>
      )}
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

const blankTask: TaskInput = { title: '', description: '', assigneeId: null, dueDate: null, priority: 'medium', labelIds: [] }

function CreateTaskModal({ column, projectId, members, labels, onClose }: { column: Column | null; projectId: string; members: Member[]; labels: Label[]; onClose(): void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<TaskInput>(blankTask)
  const create = useMutation({
    mutationFn: () => api.tasks.create(projectId, column!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
      toast('Task created.', 'success')
      onClose()
    },
  })
  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {}

  return (
    <Modal open={column !== null} title={`New task in ${column?.name ?? ''}`} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <TaskFields idPrefix="new-task" value={form} onChange={setForm} members={members} labels={labels} errors={fieldErrors} />
        {Object.keys(fieldErrors).length === 0 && <InlineError error={create.error} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
