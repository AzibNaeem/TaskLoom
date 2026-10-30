import { useQuery } from '@tanstack/react-query'
import { Outlet, useOutletContext, useParams } from 'react-router'
import { api } from '../../api'
import { can, type Action } from '../../api/permissions'
import { qk } from '../../api/queryKeys'
import type { Workspace } from '../../api/types'
import { ErrorState, LoadingState } from '../../components/States'
import { useWorkspaceRealtime } from '../realtime/useWorkspaceRealtime'

interface WorkspaceContext {
  workspace: Workspace
  can(action: Action): boolean
}

export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams()
  const workspace = useQuery({ queryKey: qk.workspace(workspaceId), queryFn: () => api.workspaces.get(workspaceId) })
  const joinError = useWorkspaceRealtime(workspaceId, workspace.data?.name)

  if (workspace.isPending) return <LoadingState label="Loading workspace…" />
  if (workspace.isError) return <ErrorState error={workspace.error} onRetry={() => workspace.refetch()} />
  // The realtime server refused to put us in the room: treat as no access.
  if (joinError?.code === 'FORBIDDEN') return <ErrorState error={joinError} />

  const ws = workspace.data
  const context: WorkspaceContext = { workspace: ws, can: (action) => can(ws.myRole, action) }
  return <Outlet context={context} />
}

export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext>()
}
