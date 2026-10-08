import type { Role } from './types'

// Permission matrix. The backend enforces the same rules; the UI only uses
// these to hide actions a user cannot perform.

export type Action =
  | 'task:write' // create, edit, move tasks
  | 'task:delete-any'
  | 'comment:create'
  | 'project:manage' // projects, columns, labels
  | 'member:manage' // invite, remove, change roles
  | 'workspace:rename'
  | 'workspace:delete'

const matrix: Record<Action, Role[]> = {
  'task:write': ['owner', 'admin', 'member'],
  'task:delete-any': ['owner', 'admin'],
  'comment:create': ['owner', 'admin', 'member'],
  'project:manage': ['owner', 'admin'],
  'member:manage': ['owner', 'admin'],
  'workspace:rename': ['owner', 'admin'],
  'workspace:delete': ['owner'],
}

export function can(role: Role | undefined, action: Action): boolean {
  return role !== undefined && matrix[action].includes(role)
}

/** Members may delete only tasks they created; Admins and Owners may delete any. */
export function canDeleteTask(role: Role | undefined, userId: string, createdBy: string): boolean {
  if (can(role, 'task:delete-any')) return true
  return role === 'member' && userId === createdBy
}

/** Owner manages everyone; Admin manages only Members and Viewers. */
export function canManageMember(actorRole: Role | undefined, targetRole: Role): boolean {
  if (actorRole === 'owner') return targetRole !== 'owner'
  if (actorRole === 'admin') return targetRole === 'member' || targetRole === 'viewer'
  return false
}

/** Roles an actor may assign (invite as / change to). */
export function assignableRoles(actorRole: Role | undefined): Array<Exclude<Role, 'owner'>> {
  if (actorRole === 'owner') return ['admin', 'member', 'viewer']
  if (actorRole === 'admin') return ['member', 'viewer']
  return []
}

export const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}
