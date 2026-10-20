import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { ApiError, type Theme } from '../../api/types'
import { applyTheme, useAuth, useCurrentUser } from '../../app/auth'
import { useToast } from '../../app/toast'
import { PageHeader } from '../../components/PageHeader'
import { InlineError } from '../../components/States'
import styles from '../workspaces/workspaces.module.css'

export function UserSettingsPage() {
  const user = useCurrentUser()
  const { setUser } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.name)

  const saveName = useMutation({
    mutationFn: () => api.auth.updateProfile({ name }),
    onSuccess: (u) => {
      setUser(u)
      toast('Profile saved.', 'success')
    },
  })
  const saveTheme = useMutation({
    mutationFn: (theme: Theme) => api.auth.updateProfile({ theme }),
    onMutate: (theme) => applyTheme(theme),
    onSuccess: setUser,
    onError: () => applyTheme(user.theme),
  })
  const nameError = saveName.error instanceof ApiError ? saveName.error.fieldErrors.name : undefined

  return (
    <>
      <PageHeader title="Your settings" subtitle={user.email} />

      <section className={`card ${styles.panel}`}>
        <h2>Profile</h2>
        <form
          className={styles.inlineForm}
          onSubmit={(e) => {
            e.preventDefault()
            saveName.mutate()
          }}
          noValidate
        >
          <div className="field">
            <label htmlFor="profile-name">Display name</label>
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={nameError ? true : undefined} />
            {nameError && <span className="field-error">{nameError}</span>}
          </div>
          <button className="btn btn--primary" disabled={saveName.isPending || name.trim() === user.name}>
            Save
          </button>
        </form>
        {!nameError && <InlineError error={saveName.error} />}
        <p className="muted">Signed in with: {user.authProviders.map((p) => (p === 'google' ? 'Google' : 'Email and password')).join(', ')}</p>
      </section>

      <section className={`card ${styles.panel}`}>
        <h2>Appearance</h2>
        <p className="muted">Saved to your account, so it follows you to any device.</p>
        <fieldset style={{ border: 'none', display: 'flex', gap: '0.5rem' }}>
          <legend className="visually-hidden">Theme</legend>
          {(['light', 'dark'] as const).map((t) => (
            <label key={t} className="btn btn--outline" style={user.theme === t ? { borderColor: 'var(--color-red-text)' } : undefined}>
              <input type="radio" name="theme" value={t} checked={user.theme === t} onChange={() => saveTheme.mutate(t)} />
              {t === 'light' ? 'Light' : 'Dark'}
            </label>
          ))}
        </fieldset>
        <InlineError error={saveTheme.error} />
      </section>
    </>
  )
}
