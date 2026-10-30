import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../../api'
import { canDeleteTask } from '../../api/permissions'
import { qk } from '../../api/queryKeys'
import { ApiError, type Board, type Label, type Member, type Task, type TaskInput } from '../../api/types'
import { useCurrentUser } from '../../app/auth'
import { timeAgo } from '../../app/format'
import { useToast } from '../../app/toast'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { ErrorState, InlineError, LoadingState } from '../../components/States'
import { DueBadge, LabelChip, PriorityBadge } from '../board/TaskCard'
import { upsertTask } from '../realtime/useWorkspaceRealtime'
import { useWorkspace } from '../workspaces/WorkspaceLayout'
import { ActivityList } from './ActivityList'
import { Comments } from './Comments'
import { TaskFields } from './TaskFields'
import styles from './tasks.module.css'

const toInput = (t: Task): TaskInput => ({
  title: t.title,
  description: t.description,
  assigneeId: t.assigneeId,
  dueDate: t.dueDate,
  priority: t.priority,
  labelIds: t.labelIds,
})

export function TaskDrawer() {
  const { workspace, can } = useWorkspace()
  const { projectId = '', taskId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useCurrentUser()
  const close = () => navigate(`/w/${workspace.id}/p/${projectId}`)

  const task = useQuery({
    queryKey: qk.task(taskId),
    queryFn: () => api.tasks.get(taskId),
    initialData: () => qc.getQueryData<Board>(qk.board(projectId))?.tasks.find((t) => t.id === taskId),
    retry: false,
  })
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => api.members.list(workspace.id) })
  const labels = useQuery({ queryKey: qk.labels(workspace.id), queryFn: () => api.labels.list(workspace.id) })
  const activity = useQuery({ queryKey: qk.taskActivity(taskId), queryFn: () => api.activity.list({ taskId }) })

  return (
    <Modal open variant="drawer" title={task.data?.title ?? 'Task'} onClose={close}>
      {task.isPending && <LoadingState label="Loading task…" />}
      {task.isError && (
        <>
          <ErrorState error={task.error} onRetry={() => task.refetch()} />
          {task.error instanceof ApiError && task.error.code === 'NOT_FOUND' && <p className="muted" style={{ textAlign: 'center' }}>It may have been deleted by a teammate.</p>}
        </>
      )}
      {task.data && (
        <div className={styles.drawer}>
          <TaskEditor
            key={task.data.id}
            task={task.data}
            members={members.data ?? []}
            labels={labels.data ?? []}
            canWrite={can('task:write')}
            canDelete={canDeleteTask(workspace.myRole, me.id, task.data.createdBy)}
            onDeleted={close}
          />
          <Comments taskId={taskId} members={members.data ?? []} canComment={can('comment:create')} />
          <section className={styles.section}>
            <h3>History</h3>
            <ActivityList query={activity} />
          </section>
        </div>
      )}
    </Modal>
  )
}

interface EditorProps {
  task: Task
  members: Member[]
  labels: Label[]
  canWrite: boolean
  canDelete: boolean
  onDeleted(): void
}

function TaskEditor({ task, members, labels, canWrite, canDelete, onDeleted }: EditorProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [base, setBase] = useState(task)
  const [form, setForm] = useState<TaskInput>(() => toInput(task))
  const dirty = JSON.stringify(form) !== JSON.stringify(toInput(base))
  const changedElsewhere = task.version > base.version

  // A teammate changed the task: adopt it silently unless we have unsaved edits.
  // (Adjusting state during render is React's recommended pattern for this.)
  if (changedElsewhere && !dirty) {
    setBase(task)
    setForm(toInput(task))
  }

  const save = useMutation({
    mutationFn: () => api.tasks.update(task.id, { ...form, version: base.version }),
    onSuccess: (updated) => {
      setBase(updated)
      setForm(toInput(updated))
      qc.setQueryData(qk.task(updated.id), updated)
      qc.setQueryData<Board>(qk.board(updated.projectId), (b) => upsertTask(b, updated))
      toast('Task saved.', 'success')
    },
    onError: (e: ApiError) => {
      if (e.code === 'CONFLICT') qc.invalidateQueries({ queryKey: qk.task(task.id) })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.tasks.remove(task.id),
    onSuccess: () => {
      qc.setQueryData<Board>(qk.board(task.projectId), (b) => (b ? { ...b, tasks: b.tasks.filter((t) => t.id !== task.id) } : b))
      qc.removeQueries({ queryKey: qk.task(task.id) })
      toast('Task deleted.', 'success')
      onDeleted()
    },
    onError: (e: ApiError) => toast(e.message, 'error'),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  const creator = members.find((m) => m.user.id === task.createdBy)?.user.name ?? 'a former member'
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const assignee = members.find((m) => m.user.id === task.assigneeId)?.user.name

  return (
    <section className={styles.section}>
      <p className="muted" style={{ fontSize: '0.82rem' }}>
        Created by {creator} {timeAgo(task.createdAt)} · updated {timeAgo(task.updatedAt)}
      </p>

      {changedElsewhere && dirty && (
        <div className="alert alert--warning" role="alert">
          <Icon name="alert" size={16} />
          <div>
            <p>A teammate changed this task while you were editing.</p>
            <div className={styles.inlineActions}>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  setBase(task)
                  setForm(toInput(task))
                }}
              >
                Load their version
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBase(task)}>
                Keep mine and overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {canWrite ? (
        <form onSubmit={submit} noValidate className={styles.editor}>
          <TaskFields idPrefix={`edit-${task.id}`} value={form} onChange={setForm} members={members} labels={labels} errors={fieldErrors} />
          {Object.keys(fieldErrors).length === 0 && <InlineError error={save.error} />}
          <div className={styles.inlineActions}>
            {canDelete && (
              <button
                type="button"
                className="btn btn--danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete "${task.title}"? Comments are deleted too.`)) remove.mutate()
                }}
              >
                <Icon name="trash" size={16} /> Delete
              </button>
            )}
            <span style={{ flex: 1 }} />
            {dirty && (
              <button type="button" className="btn btn--outline" onClick={() => setForm(toInput(base))}>
                Discard changes
              </button>
            )}
            <button className="btn btn--primary" disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.readOnly}>
          <p className="alert alert--info">
            <Icon name="alert" size={16} /> You have read-only access to this workspace.
          </p>
          <p className={styles.description}>{task.description || <span className="muted">No description</span>}</p>
          <dl>
            <dt>Assignee</dt>
            <dd>{assignee ?? 'Unassigned'}</dd>
            <dt>Priority</dt>
            <dd>
              <PriorityBadge priority={task.priority} />
            </dd>
            <dt>Due</dt>
            <dd>{task.dueDate ? <DueBadge date={task.dueDate} /> : 'No due date'}</dd>
            <dt>Labels</dt>
            <dd className={styles.labelsRow}>
              {task.labelIds.length === 0
                ? 'None'
                : task.labelIds.map((id) => {
                    const l = labels.find((x) => x.id === id)
                    return l ? <LabelChip key={id} label={l} /> : null
                  })}
            </dd>
          </dl>
        </div>
      )}
    </section>
  )
}
