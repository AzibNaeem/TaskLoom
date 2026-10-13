import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { ApiError } from './api/types'
import { AuthProvider, applyTheme, initialTheme, notifyUnauthenticated } from './app/auth'
import { ToastProvider } from './app/toast'
import { router } from './router'
import './styles/global.css'

applyTheme(initialTheme())

const onError = (error: unknown) => {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') notifyUnauthenticated()
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry once for transient failures; never retry 4xx responses.
      retry: (count, error) => count < 1 && error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'SERVER'),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
