import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { realtime, serverWaking } from '../../api'
import { qk } from '../../api/queryKeys'
import type { Activity, ApiError, Board, Comment, RealtimeEvent, Task, Workspace } from '../../api/types'
import { useCurrentUser } from '../../app/auth'
import { useToast } from '../../app/toast'

export function useRealtimeStatus() {
  return useSyncExternalStore(realtime.onStatus, realtime.getStatus)
}

export function useServerWaking() {
  return useSyncExternalStore(serverWaking.subscribe, serverWaking.get)
}

/** Only accept a task if it is not older than what we already have. */
export function upsertTask(board: Board | undefined, task: Task): Board | undefined {
  if (!board) return board
  const existing = board.tasks.find((t) => t.id === task.id)
  if (existing && existing.version > task.version) return board
  const tasks = existing ? board.tasks.map((t) => (t.id === task.id ? task : t)) : [...board.tasks, task]
  return { ...board, tasks: tasks.sort((a, b) => a.position - b.position) }
}

function prependActivity(list: Activity[] | undefined, activity: Activity) {
  if (!list || list.some((a) => a.id === activity.id)) return list
  return [activity, ...list]
}

/** Drop a workspace we lost access to, so "/" never redirects back into it. */
export function forgetWorkspace(qc: QueryClient, workspaceId: string) {
  qc.setQueryData<Workspace[]>(qk.workspaces, (list) => list?.filter((w) => w.id !== workspaceId))
  qc.removeQueries({ queryKey: qk.workspace(workspaceId) })
  qc.invalidateQueries({ queryKey: qk.workspaces })
}

export function applyEvent(qc: QueryClient, e: RealtimeEvent) {
  const { task, taskId, comment, activity } = e.data
  switch (e.type) {
    case 'task:created':
    case 'task:updated':
    case 'task:moved':
      if (!task) return
      qc.setQueryData<Board>(qk.board(task.projectId), (b) => upsertTask(b, task))
      qc.setQueryData<Task>(qk.task(task.id), (old) => (old && old.version > task.version ? old : task))
      qc.invalidateQueries({ queryKey: qk.search(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.projects(e.workspaceId) })
      return
    case 'task:deleted':
      if (!taskId || !e.projectId) return
      qc.setQueryData<Board>(qk.board(e.projectId), (b) => (b ? { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) } : b))
      qc.invalidateQueries({ queryKey: qk.task(taskId) })
      qc.invalidateQueries({ queryKey: qk.search(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.projects(e.workspaceId) })
      return
    case 'column:changed':
    case 'project:changed':
      if (e.projectId) qc.invalidateQueries({ queryKey: qk.board(e.projectId) })
      qc.invalidateQueries({ queryKey: qk.projects(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.labels(e.workspaceId) })
      return
    case 'comment:created':
      if (!comment) return
      qc.setQueryData<Comment[]>(qk.comments(comment.taskId), (list) => (list && !list.some((c) => c.id === comment.id) ? [...list, comment] : list))
      return
    case 'activity:created':
      if (!activity) return
      if (activity.projectId) qc.setQueryData<Activity[]>(qk.projectActivity(activity.projectId), (l) => prependActivity(l, activity))
      if (activity.taskId) qc.setQueryData<Activity[]>(qk.taskActivity(activity.taskId), (l) => prependActivity(l, activity))
      return
    case 'member:changed':
      qc.invalidateQueries({ queryKey: qk.members(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.invitations(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.workspace(e.workspaceId) })
      qc.invalidateQueries({ queryKey: qk.workspaces })
      return
    case 'workspace:access-revoked':
      return // handled by the hook (needs navigation)
  }
}

/**
 * Joins the workspace room for as long as the workspace is open and keeps the
 * query cache in sync with server events.
 */
export function useWorkspaceRealtime(workspaceId: string, workspaceName: string | undefined) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const me = useCurrentUser()
  const [joinError, setJoinError] = useState<ApiError | null>(null)

  useEffect(() => {
    let active = true
    setJoinError(null)
    realtime.joinWorkspace(workspaceId).catch((err: ApiError) => {
      if (active) setJoinError(err)
    })

    const offEvent = realtime.onEvent((e) => {
      if (e.workspaceId !== workspaceId) return
      if (e.type === 'workspace:access-revoked') {
        if (e.data.userId && e.data.userId !== me.id) return
        if (!e.data.userId && e.actorId === me.id) return // we deleted it ourselves
        forgetWorkspace(qc, workspaceId)
        toast(`You no longer have access to ${workspaceName ?? 'this workspace'}.`, 'warning')
        navigate('/', { replace: true })
        return
      }
      applyEvent(qc, e)
    })

    // After a reconnect we may have missed events: refetch everything visible.
    const offResync = realtime.onResync(() => {
      qc.invalidateQueries()
      toast('Reconnected. Board refreshed with the latest changes.', 'success')
    })

    return () => {
      active = false
      realtime.leaveWorkspace(workspaceId)
      offEvent()
      offResync()
    }
    // workspaceName only affects the toast text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, me.id, qc, navigate, toast])

  return joinError
}
