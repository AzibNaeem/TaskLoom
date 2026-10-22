import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../api'
import { roleLabel } from '../../api/permissions'
import { qk } from '../../api/queryKeys'
import { useAuth } from '../../app/auth'
import { ErrorState, InlineError, LoadingState } from '../../components/States'
import styles from './members.module.css'

export function InvitePage() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const preview = useQuery({ queryKey: ['invitation', token], queryFn: () => api.invitations.preview(token), retry: false })
  const accept = useMutation({
    mutationFn: () => api.invitations.accept(token),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: qk.workspaces })
      navigate(`/w/${ws.id}`, { replace: true })
    },
  })

  if (preview.isPending) return <LoadingState label="Checking invitation…" />
  if (preview.isError) return <ErrorState error={preview.error} onRetry={() => preview.refetch()} />

  const inv = preview.data
  const next = encodeURIComponent(`/invite/${token}`)

  return (
    <main className={`card ${styles.invite}`}>
      <p style={{ color: 'var(--color-red-text)', fontWeight: 800 }}>Taskloom</p>
      <h1>Join {inv.workspaceName}</h1>
      <p className="muted">
        {inv.invitedByName} invited <strong>{inv.email}</strong> to join as <strong>{roleLabel[inv.role]}</strong>.
      </p>

      {inv.status === 'expired' && <p className="alert alert--error">This invitation expired on {new Date(inv.expiresAt).toLocaleString()}. Ask {inv.invitedByName} to send a new one.</p>}
      {(inv.status === 'revoked' || inv.status === 'accepted') && <p className="alert alert--warning">This invitation is no longer valid.</p>}

      {inv.status === 'pending' && !user && (
        <>
          <p>Sign in or create an account with {inv.email} to accept.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link className="btn btn--primary" to={`/login?next=${next}`}>
              Sign in
            </Link>
            <Link className="btn btn--outline" to={`/register?next=${next}&email=${encodeURIComponent(inv.email)}`}>
              Create account
            </Link>
          </div>
        </>
      )}

      {inv.status === 'pending' && user && (
        <>
          <p className="muted">
            Signed in as {user.name} ({user.email}).
          </p>
          <InlineError error={accept.error} />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending ? 'Joining…' : 'Accept invitation'}
            </button>
            <Link className="btn btn--outline" to="/">
              Not now
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
