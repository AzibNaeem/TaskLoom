import type { TaskFilters } from './types'

// TanStack Query cache keys. Real-time events update or invalidate these.
export const qk = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  members: (workspaceId: string) => ['members', workspaceId] as const,
  invitations: (workspaceId: string) => ['invitations', workspaceId] as const,
  labels: (workspaceId: string) => ['labels', workspaceId] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  board: (projectId: string) => ['board', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  projectActivity: (projectId: string) => ['activity', 'project', projectId] as const,
  taskActivity: (taskId: string) => ['activity', 'task', taskId] as const,
  search: (workspaceId: string, filters?: TaskFilters) =>
    (filters ? ['search', workspaceId, filters] : ['search', workspaceId]) as readonly unknown[],
}
