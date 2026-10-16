import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import { useAuth } from './app/auth'
import { EmptyState, ErrorState, LoadingState } from './components/States'
import { LoginPage, RegisterPage } from './features/auth/AuthPages'
import { AppLayout } from './features/workspaces/AppLayout'
import { WorkspaceLayout } from './features/workspaces/WorkspaceLayout'
import { HomeRedirect, NewWorkspacePage, WorkspaceSettingsPage } from './features/workspaces/WorkspacePages'

function Root() {
  const { state, retry } = useAuth()
  if (state.status === 'loading') return <LoadingState label="Starting Taskloom…" />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />
  return <Outlet />
}

function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return <Outlet />
}

function GuestOnly() {
  const { user } = useAuth()
  const location = useLocation()
  if (user) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />
  }
  return <Outlet />
}

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Link className="btn btn--primary" to="/">
          Go home
        </Link>
      }
    >
      The page you are looking for does not exist.
    </EmptyState>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <HomeRedirect /> },
              { path: '/workspaces/new', element: <NewWorkspacePage /> },
              {
                path: '/w/:workspaceId',
                element: <WorkspaceLayout />,
                children: [
                  { path: 'settings', element: <WorkspaceSettingsPage /> },
                ],
              },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
