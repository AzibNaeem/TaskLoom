import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, isMockMode } from '../../api'
import { SEED_PASSWORD, seedAccounts } from '../../api/mock/db'
import { ApiError, type AuthResult } from '../../api/types'
import { useAuth } from '../../app/auth'
import { InlineError } from '../../components/States'
import { GoogleButton } from './GoogleButton'
import styles from './auth.module.css'

function useAfterSignIn() {
  const { signedIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  return (result: AuthResult) => {
    signedIn(result)
    navigate(next && next.startsWith('/') ? next : '/', { replace: true })
  }
}

function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldErrors[field] : undefined
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <p className={styles.brand}>Taskloom</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </main>
  )
}

function Field(props: { id: string; label: string; type?: string; value: string; onChange(v: string): void; error?: string; autoComplete?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        className="input"
        type={props.type ?? 'text'}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${props.id}-error` : undefined}
        required
      />
      {props.error && (
        <span id={`${props.id}-error`} className="field-error">
          {props.error}
        </span>
      )}
    </div>
  )
}

export function LoginPage() {
  const { state } = useAuth()
  const afterSignIn = useAfterSignIn()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({ mutationFn: api.auth.login, onSuccess: afterSignIn })
  const google = useMutation({ mutationFn: api.auth.loginWithGoogle, onSuccess: afterSignIn })
  const busy = login.isPending || google.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    google.reset()
    login.mutate({ email, password })
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Pick up where your team left off.">
      {state.status === 'anonymous' && state.expired && <p className="alert alert--warning">Your session expired. Please sign in again.</p>}
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <InlineError error={login.error ?? google.error} />
        <button className="btn btn--primary" disabled={busy}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className={styles.divider}>or</div>
      <GoogleButton
        disabled={busy}
        onCredential={(token) => {
          login.reset()
          google.mutate(token)
        }}
      />
      <p className={styles.switch}>
        New to Taskloom?{' '}
        <Link to={`/register${params.toString() ? `?${params}` : ''}`} className={styles.link}>
          Create an account
        </Link>
      </p>

      {isMockMode && (
        <details className={styles.demo}>
          <summary>Demo accounts (mock mode)</summary>
          <p className="muted">
            All use the password <code>{SEED_PASSWORD}</code>. Open a second tab to sign in as another user.
          </p>
          <ul>
            {seedAccounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setEmail(a.email)
                    setPassword(SEED_PASSWORD)
                  }}
                >
                  {a.name}
                </button>
                <span className="muted">{a.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AuthShell>
  )
}

export function RegisterPage() {
  const afterSignIn = useAfterSignIn()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')

  const register = useMutation({ mutationFn: api.auth.register, onSuccess: afterSignIn })
  const google = useMutation({ mutationFn: api.auth.loginWithGoogle, onSuccess: afterSignIn })
  const err = register.error

  const submit = (e: FormEvent) => {
    e.preventDefault()
    register.mutate({ name, email, password })
  }

  return (
    <AuthShell title="Create your account" subtitle="One shared board for your whole team.">
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field id="name" label="Name" autoComplete="name" value={name} onChange={setName} error={fieldError(err, 'name')} />
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={fieldError(err, 'email')} />
        <Field id="password" label="Password (at least 8 characters)" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={fieldError(err, 'password')} />
        {err instanceof ApiError && Object.keys(err.fieldErrors).length === 0 && <InlineError error={err} />}
        <InlineError error={google.error} />
        <button className="btn btn--primary" disabled={register.isPending || google.isPending}>
          {register.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className={styles.divider}>or</div>
      <GoogleButton disabled={register.isPending || google.isPending} onCredential={(token) => google.mutate(token)} />
      <p className={styles.switch}>
        Already have an account?{' '}
        <Link to={`/login${params.toString() ? `?${params}` : ''}`} className={styles.link}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
