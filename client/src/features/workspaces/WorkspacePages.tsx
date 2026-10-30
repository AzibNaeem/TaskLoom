import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../../api'
import { qk } from '../../api/queryKeys'
import { ApiError, type LabelColor } from '../../api/types'
import { useToast } from '../../app/toast'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, InlineError, LoadingState } from '../../components/States'
import { forgetWorkspace } from '../realtime/useWorkspaceRealtime'
import { useWorkspace } from './WorkspaceLayout'
import styles from './workspaces.module.css'

export const LABEL_COLORS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink']

/** "/" sends the user to their first workspace, or to onboarding. */
export function HomeRedirect() {
  const workspaces = useQuery({ queryKey: qk.workspaces, queryFn: api.workspaces.list })
  if (workspaces.isPending) return <LoadingState />
  if (workspaces.isError) return <ErrorState error={workspaces.error} onRetry={() => workspaces.refetch()} />
  if (workspaces.data.length === 0) return <Navigate to="/workspaces/new" replace />
  return <Navigate to={`/w/${workspaces.data[0].id}`} replace />
}

export function NewWorkspacePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const workspaces = useQuery({ queryKey: qk.workspaces, queryFn: api.workspaces.list })
  const create = useMutation({
    mutationFn: () => api.workspaces.create({ name }),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: qk.workspaces })
      navigate(`/w/${ws.id}`)
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }
  const fieldError = create.error instanceof ApiError ? create.error.fieldErrors.name : undefined

  return (
    <div className={styles.centered}>
      <div className={`card ${styles.panel}`}>
        <h1>{workspaces.data?.length === 0 ? 'Create your first workspace' : 'Create a workspace'}</h1>
        <p className="muted">A workspace is your team’s private space. Its projects and tasks are never visible to other workspaces. You can also join a workspace through an email invitation.</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="ws-name">Workspace name</label>
            <input id="ws-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Programming Group" aria-invalid={fieldError ? true : undefined} autoFocus />
            {fieldError && <span className="field-error">{fieldError}</span>}
          </div>
          {!fieldError && <InlineError error={create.error} />}
          <button className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function WorkspaceSettingsPage() {
  const { workspace, can } = useWorkspace()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(workspace.name)
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState<LabelColor>('blue')

  const labels = useQuery({ queryKey: qk.labels(workspace.id), queryFn: () => api.labels.list(workspace.id) })

  const rename = useMutation({
    mutationFn: () => api.workspaces.rename(workspace.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workspace(workspace.id) })
      qc.invalidateQueries({ queryKey: qk.workspaces })
      toast('Workspace renamed.', 'success')
    },
  })
  const createLabel = useMutation({
    mutationFn: () => api.labels.create(workspace.id, { name: labelName, color: labelColor }),
    onSuccess: () => {
      setLabelName('')
      qc.invalidateQueries({ queryKey: qk.labels(workspace.id) })
    },
  })
  const removeLabel = useMutation({
    mutationFn: (labelId: string) => api.labels.remove(workspace.id, labelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labels(workspace.id) }),
    onError: (e: ApiError) => toast(e.message, 'error'),
  })
  const leaveOrDelete = useMutation({
    mutationFn: () => (workspace.myRole === 'owner' ? api.workspaces.remove(workspace.id) : api.workspaces.leave(workspace.id)),
    onSuccess: () => {
      forgetWorkspace(qc, workspace.id)
      toast(workspace.myRole === 'owner' ? 'Workspace deleted.' : 'You left the workspace.', 'success')
      navigate('/', { replace: true })
    },
  })

  const labelError = createLabel.error instanceof ApiError ? Object.values(createLabel.error.fieldErrors)[0] ?? createLabel.error.message : null

  return (
    <>
      <PageHeader title="Workspace settings" subtitle={workspace.name} />

      <section className={`card ${styles.panel}`}>
        <h2>Name</h2>
        {can('workspace:rename') ? (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault()
              rename.mutate()
            }}
          >
            <div className="field">
              <label htmlFor="ws-rename">Workspace name</label>
              <input id="ws-rename" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn btn--primary" disabled={rename.isPending || name.trim() === workspace.name}>
              Save
            </button>
          </form>
        ) : (
          <p className="muted">Only Owners and Admins can rename the workspace.</p>
        )}
        <InlineError error={rename.error} />
      </section>

      <section className={`card ${styles.panel}`}>
        <h2>Labels</h2>
        <p className="muted">Labels are shared by every project in this workspace.</p>
        {labels.isPending && <LoadingState />}
        {labels.isError && <ErrorState error={labels.error} onRetry={() => labels.refetch()} />}
        {labels.data && (
          <ul className={styles.labelList}>
            {labels.data.length === 0 && <li className="muted">No labels yet.</li>}
            {labels.data.map((l) => (
              <li key={l.id} className="badge">
                <span className="dot" style={{ color: `var(--label-${l.color})` }} />
                {l.name}
                {can('project:manage') && (
                  <button className="btn btn--ghost btn--sm" aria-label={`Delete label ${l.name}`} onClick={() => removeLabel.mutate(l.id)} disabled={removeLabel.isPending}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {can('project:manage') && (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault()
              createLabel.mutate()
            }}
          >
            <div className="field">
              <label htmlFor="label-name">New label</label>
              <input id="label-name" className="input" value={labelName} onChange={(e) => setLabelName(e.target.value)} maxLength={24} />
            </div>
            <div className="field">
              <span className="field-label">Colour</span>
              <div className={styles.swatches} role="group" aria-label="Label colour">
                {LABEL_COLORS.map((c) => (
                  <button key={c} type="button" className={styles.swatch} style={{ backgroundColor: `var(--label-${c})` }} aria-pressed={labelColor === c} aria-label={c} onClick={() => setLabelColor(c)} />
                ))}
              </div>
            </div>
            <button className="btn btn--outline" disabled={createLabel.isPending}>
              <Icon name="plus" size={16} /> Add label
            </button>
          </form>
        )}
        {labelError && <p className="field-error">{labelError}</p>}
      </section>

      <section className={`card ${styles.panel} ${styles.danger}`}>
        <h2>{workspace.myRole === 'owner' ? 'Delete workspace' : 'Leave workspace'}</h2>
        <p className="muted">
          {workspace.myRole === 'owner'
            ? 'Deletes every project, task, comment and invitation in this workspace. Members lose access immediately.'
            : 'You will lose access to this workspace until someone invites you again.'}
        </p>
        <InlineError error={leaveOrDelete.error} />
        <div>
          <button
            className="btn btn--danger"
            disabled={leaveOrDelete.isPending}
            onClick={() => {
              const msg = workspace.myRole === 'owner' ? `Delete "${workspace.name}" permanently?` : `Leave "${workspace.name}"?`
              if (confirm(msg)) leaveOrDelete.mutate()
            }}
          >
            {workspace.myRole === 'owner' ? 'Delete workspace' : 'Leave workspace'}
          </button>
        </div>
      </section>
    </>
  )
}
