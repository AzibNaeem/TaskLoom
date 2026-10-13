import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import { useAuth } from './app/auth'
import { EmptyState, ErrorState, LoadingState } from './components/States'
import { AppLayout } from './features/workspaces/AppLayout'

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
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <EmptyState title="No workspace yet">Workspace creation lands next.</EmptyState> },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
