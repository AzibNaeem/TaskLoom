import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import styles from './auth.module.css'

// In the backend phase this button renders Google Identity Services and passes
// the real ID token to onCredential. The mock version lets you pick an account.

const presetAccounts = [
  { name: 'Ahmad Bin Tariq', email: 'ahmad@taskloom.dev' },
  { name: 'Google Newcomer', email: 'newcomer@gmail.com' },
]

function mockIdToken(name: string, email: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ name, email }))
  return `mock-google.${btoa(String.fromCharCode(...bytes))}`
}

export function GoogleButton({ onCredential, disabled }: { onCredential(idToken: string): void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const choose = (n: string, e: string) => {
    setOpen(false)
    onCredential(mockIdToken(n, e))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (email.trim()) choose(name.trim() || email.split('@')[0], email.trim())
  }

  return (
    <>
      <button type="button" className={`btn btn--outline ${styles.google}`} onClick={() => setOpen(true)} disabled={disabled}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>

      <Modal open={open} title="Choose a Google account (simulated)" onClose={() => setOpen(false)}>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Mock mode: no data is sent to Google. The real Google sign-in replaces this window in the backend phase.
        </p>
        <div className={styles.accountList}>
          {presetAccounts.map((a) => (
            <button key={a.email} type="button" className={`btn btn--outline ${styles.account}`} onClick={() => choose(a.name, a.email)}>
              <strong>{a.name}</strong>
              <span className="muted">{a.email}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit} className={styles.form} style={{ marginTop: '1rem' }}>
          <p className="field-label">Use another account</p>
          <div className="field">
            <label htmlFor="g-name">Name</label>
            <input id="g-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="g-email">Email</label>
            <input id="g-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn--primary">Continue</button>
        </form>
      </Modal>
    </>
  )
}
