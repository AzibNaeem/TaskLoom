import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { assignableRoles, canManageMember, roleLabel } from '../../api/permissions'
import { qk } from '../../api/queryKeys'
import { ApiError, type Role } from '../../api/types'
import { useCurrentUser } from '../../app/auth'
import { useToast } from '../../app/toast'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, InlineError, LoadingState } from '../../components/States'
import { useWorkspace } from '../workspaces/WorkspaceLayout'
import styles from './members.module.css'

const roleHelp: Record<Role, string> = {
  owner: 'Full control, including deleting the workspace.',
  admin: 'Manages projects, columns, labels, Members and Viewers.',
  member: 'Creates, edits and moves tasks; comments.',
  viewer: 'Read-only access.',
}

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const hours = Math.floor(ms / 3_600_000)
  return hours >= 1 ? `expires in ${hours}h` : `expires in ${Math.max(1, Math.round(ms / 60_000))}m`
}

export function MembersPage() {
  const { workspace, can } = useWorkspace()
  const me = useCurrentUser()
  const qc = useQueryClient()
  const toast = useToast()
  const canManage = can('member:manage')
  const roles = assignableRoles(workspace.myRole)

  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => api.members.list(workspace.id) })
  const invitations = useQuery({ queryKey: qk.invitations(workspace.id), queryFn: () => api.invitations.list(workspace.id), enabled: canManage })

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member')

  const invite = useMutation({
    mutationFn: () => api.invitations.create(workspace.id, { email, role }),
    onSuccess: (inv) => {
      setEmail('')
      qc.invalidateQueries({ queryKey: qk.invitations(workspace.id) })
      toast(`Invitation emailed to ${inv.email}. It expires in 48 hours.`, 'success')
    },
  })
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: Exclude<Role, 'owner'> }) => api.members.updateRole(workspace.id, v.userId, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(workspace.id) }),
    onError: (e: ApiError) => {
      toast(e.message, 'error')
      qc.invalidateQueries({ queryKey: qk.members(workspace.id) })
    },
  })
  const removeMember = useMutation({
    mutationFn: (userId: string) => api.members.remove(workspace.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members(workspace.id) })
      toast('Member removed. They lost access immediately.', 'success')
    },
    onError: (e: ApiError) => toast(e.message, 'error'),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api.invitations.revoke(workspace.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invitations(workspace.id) }),
    onError: (e: ApiError) => toast(e.message, 'error'),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate()
  }
  const inviteFieldErrors = invite.error instanceof ApiError ? invite.error.fieldErrors : {}

  return (
    <>
      <PageHeader title="Members" subtitle={`${workspace.name} · ${members.data?.length ?? '…'} people`} />

      {canManage && (
        <section className={`card ${styles.panel}`}>
          <h2>Invite by email</h2>
          <form className={styles.inviteForm} onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="invite-email">Email</label>
              <input id="invite-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" aria-invalid={inviteFieldErrors.email ? true : undefined} />
              {inviteFieldErrors.email && <span className="field-error">{inviteFieldErrors.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="invite-role">Role</label>
              <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn--primary" disabled={invite.isPending}>
              <Icon name="mail" size={16} /> {invite.isPending ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
          <p className="muted">{roleHelp[role]} Invitation links expire after 48 hours.</p>
          {Object.keys(inviteFieldErrors).length === 0 && <InlineError error={invite.error} />}
        </section>
      )}

      <section className={`card ${styles.panel}`}>
        <h2>People</h2>
        {members.isPending && <LoadingState />}
        {members.isError && <ErrorState error={members.error} onRetry={() => members.refetch()} />}
        {members.data && (
          <ul className={styles.list}>
            {members.data.map((m) => {
              const manageable = m.user.id !== me.id && canManageMember(workspace.myRole, m.role)
              return (
                <li key={m.user.id} className={styles.row}>
                  <Avatar name={m.user.name} size={34} />
                  <div className={styles.who}>
                    <strong>
                      {m.user.name} {m.user.id === me.id && <span className="muted">(you)</span>}
                    </strong>
                    <span className="muted">{m.user.email}</span>
                  </div>
                  {manageable ? (
                    <>
                      <label className="visually-hidden" htmlFor={`role-${m.user.id}`}>
                        Role for {m.user.name}
                      </label>
                      <select
                        id={`role-${m.user.id}`}
                        className={`input ${styles.roleSelect}`}
                        value={m.role}
                        disabled={changeRole.isPending}
                        onChange={(e) => changeRole.mutate({ userId: m.user.id, role: e.target.value as Exclude<Role, 'owner'> })}
                      >
                        {[m.role, ...roles.filter((r) => r !== m.role)].map((r) => (
                          <option key={r} value={r}>
                            {roleLabel[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn--danger btn--sm"
                        disabled={removeMember.isPending}
                        onClick={() => {
                          if (confirm(`Remove ${m.user.name} from ${workspace.name}? They will lose access immediately.`)) removeMember.mutate(m.user.id)
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="badge">{roleLabel[m.role]}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {canManage && (
        <section className={`card ${styles.panel}`}>
          <h2>Pending invitations</h2>
          {invitations.isPending && <LoadingState />}
          {invitations.isError && <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />}
          {invitations.data?.length === 0 && <EmptyState title="No pending invitations" />}
          {invitations.data && invitations.data.length > 0 && (
            <ul className={styles.list}>
              {invitations.data.map((inv) => (
                <li key={inv.id} className={styles.row}>
                  <Icon name="mail" />
                  <div className={styles.who}>
                    <strong>{inv.email}</strong>
                    <span className="muted">
                      {roleLabel[inv.role]} · invited by {inv.invitedBy.name}
                    </span>
                  </div>
                  <span className={`badge ${inv.status === 'expired' ? styles.expired : ''}`}>
                    <Icon name="clock" size={12} /> {inv.status === 'expired' ? 'Expired' : timeLeft(inv.expiresAt)}
                  </span>
                  <button className="btn btn--ghost btn--sm" disabled={revoke.isPending} onClick={() => revoke.mutate(inv.id)}>
                    {inv.status === 'expired' ? 'Remove' : 'Revoke'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
