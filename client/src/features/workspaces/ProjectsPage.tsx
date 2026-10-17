import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { roleLabel } from '../../api/permissions'
import { qk } from '../../api/queryKeys'
import { ApiError, type Project } from '../../api/types'
import { useToast } from '../../app/toast'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, InlineError, LoadingState } from '../../components/States'
import { useWorkspace } from './WorkspaceLayout'
import styles from './workspaces.module.css'

export function ProjectsPage() {
  const { workspace, can } = useWorkspace()
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => api.projects.list(workspace.id) })
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const canManage = can('project:manage')

  return (
    <>
      <PageHeader
        title={workspace.name}
        subtitle={`Your role: ${roleLabel[workspace.myRole]}`}
        actions={
          canManage && (
            <button className="btn btn--primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> New project
            </button>
          )
        }
      />

      {projects.isPending && <LoadingState label="Loading projects…" />}
      {projects.isError && <ErrorState error={projects.error} onRetry={() => projects.refetch()} />}
      {projects.data?.length === 0 && (
        <EmptyState
          title="No projects yet"
          action={
            canManage && (
              <button className="btn btn--primary" onClick={() => setEditing('new')}>
                Create the first project
              </button>
            )
          }
        >
          {canManage ? 'Projects hold a Kanban board each. Create one to start adding tasks.' : 'An Owner or Admin needs to create a project first.'}
        </EmptyState>
      )}

      {projects.data && projects.data.length > 0 && (
        <ul className={styles.grid}>
          {projects.data.map((p) => (
            <li key={p.id} className={`card ${styles.projectCard}`}>
              <Link to={`/w/${workspace.id}/p/${p.id}`} className={styles.projectLink}>
                <h2>{p.name}</h2>
                <p className="muted">{p.description || 'No description'}</p>
                <span className="badge">{p.taskCount === 1 ? '1 task' : `${p.taskCount} tasks`}</span>
              </Link>
              {canManage && (
                <button className="btn btn--ghost btn--icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                  <Icon name="edit" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ProjectDialog key={editing === 'new' ? 'new' : editing?.id} workspaceId={workspace.id} project={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function ProjectDialog({ workspaceId, project, onClose }: { workspaceId: string; project: Project | 'new' | null; onClose(): void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = project && project !== 'new' ? project : null
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')

  const save = useMutation({
    mutationFn: () => (existing ? api.projects.update(existing.id, { name, description }) : api.projects.create(workspaceId, { name, description })),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      qc.invalidateQueries({ queryKey: qk.board(p.id) })
      toast(existing ? 'Project updated.' : 'Project created.', 'success')
      onClose()
    },
  })

  const remove = useMutation({
    mutationFn: () => api.projects.remove(existing!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      toast('Project deleted.', 'success')
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}

  return (
    <Modal open={project !== null} title={existing ? 'Edit project' : 'New project'} onClose={onClose}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="project-name">Name</label>
          <input id="project-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={fieldErrors.name ? true : undefined} autoFocus />
          {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="project-desc">Description</label>
          <textarea id="project-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          {fieldErrors.description && <span className="field-error">{fieldErrors.description}</span>}
        </div>
        {Object.keys(fieldErrors).length === 0 && <InlineError error={save.error} />}
        <InlineError error={remove.error} />
        <div className={styles.formActions}>
          {existing && (
            <button
              type="button"
              className="btn btn--danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Delete "${existing.name}" and all of its tasks? This cannot be undone.`)) remove.mutate()
              }}
            >
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : existing ? 'Save' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
