import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { api } from '../../api'
import { qk } from '../../api/queryKeys'
import { applyTheme, useAuth, useCurrentUser } from '../../app/auth'
import { useToast } from '../../app/toast'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import styles from './layout.module.css'

export function AppLayout() {
  const user = useCurrentUser()
  const { setUser, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const match = useMatch('/w/:workspaceId/*')
  const workspaceId = match?.params.workspaceId
  // The mobile menu is open only for the page it was opened on, so navigating closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === location.pathname
  const setMenuOpen = (open: boolean) => setMenuOpenOn(open ? location.pathname : null)

  const workspaces = useQuery({ queryKey: qk.workspaces, queryFn: api.workspaces.list })
  const projects = useQuery({
    queryKey: qk.projects(workspaceId ?? ''),
    queryFn: () => api.projects.list(workspaceId!),
    enabled: !!workspaceId && !!workspaces.data?.some((w) => w.id === workspaceId),
  })

  const theme = useMutation({
    mutationFn: (next: 'light' | 'dark') => api.auth.updateProfile({ theme: next }),
    onMutate: (next) => applyTheme(next),
    onSuccess: setUser,
    onError: () => {
      applyTheme(user.theme)
      toast('Could not save your theme preference.', 'error')
    },
  })

  const nextTheme = user.theme === 'dark' ? 'light' : 'dark'

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className="btn btn--ghost btn--icon" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name="menu" />
        </button>
        <span className={styles.brand}>Taskloom</span>
      </header>

      <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`} aria-label="Main">
        <div className={styles.brandRow}>
          <span className={styles.brand}>Taskloom</span>
        </div>

        <div className={styles.section}>
          <label htmlFor="ws-switch" className={styles.sectionLabel}>
            Workspace
          </label>
          <select
            id="ws-switch"
            className="input"
            value={workspaceId ?? ''}
            onChange={(e) => navigate(e.target.value === '__new' ? '/workspaces/new' : `/w/${e.target.value}`)}
          >
            {!workspaceId && <option value="">Select a workspace</option>}
            {workspaces.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
            {workspaceId && !workspaces.data?.some((w) => w.id === workspaceId) && <option value={workspaceId}>Unavailable workspace</option>}
            <option value="__new">+ Create workspace</option>
          </select>
        </div>

        {workspaceId && workspaces.data?.some((w) => w.id === workspaceId) && (
          <>
            <ul className={styles.nav}>
              <li>
                <NavLink end to={`/w/${workspaceId}`} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                  <Icon name="folder" /> Projects
                </NavLink>
              </li>
              <li>
                <NavLink to={`/w/${workspaceId}/search`} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                  <Icon name="search" /> Search
                </NavLink>
              </li>
              <li>
                <NavLink to={`/w/${workspaceId}/members`} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                  <Icon name="users" /> Members
                </NavLink>
              </li>
              <li>
                <NavLink to={`/w/${workspaceId}/settings`} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                  <Icon name="settings" /> Workspace settings
                </NavLink>
              </li>
            </ul>

            <div className={styles.section}>
              <span className={styles.sectionLabel}>Projects</span>
              <ul className={styles.projects}>
                {projects.data?.map((p) => (
                  <li key={p.id}>
                    <NavLink to={`/w/${workspaceId}/p/${p.id}`} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                      <span className={styles.projectName}>{p.name}</span>
                    </NavLink>
                  </li>
                ))}
                {projects.data?.length === 0 && <li className="muted">No projects yet</li>}
              </ul>
            </div>
          </>
        )}

        <div className={styles.footer}>
          <button className="btn btn--ghost btn--sm" onClick={() => theme.mutate(nextTheme)} aria-label={`Switch to ${nextTheme} mode`}>
            <Icon name={user.theme === 'dark' ? 'sun' : 'moon'} size={16} /> {user.theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
          <div className={styles.userRow}>
            <NavLink to="/settings" className={styles.user}>
              <Avatar name={user.name} />
              <span>
                <strong>{user.name}</strong>
                <span className="muted">{user.email}</span>
              </span>
            </NavLink>
            <button className="btn btn--ghost btn--icon" aria-label="Sign out" title="Sign out" onClick={() => signOut()}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </nav>
      {menuOpen && <div className={styles.scrim} onClick={() => setMenuOpen(false)} />}

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
