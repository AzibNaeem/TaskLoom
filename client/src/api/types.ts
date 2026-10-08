// Domain types and the client-side API contract.
// The real backend (Express + MongoDB) must return exactly these shapes,
// so the mock implementation can be swapped without touching the UI.

export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type Theme = 'light' | 'dark'
export type Priority = 'low' | 'medium' | 'high'
export type LabelColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'violet' | 'pink'

export interface User {
  id: string
  name: string
  email: string
  theme: Theme
  authProviders: Array<'password' | 'google'>
}

export interface PublicUser {
  id: string
  name: string
  email: string
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  /** Role of the current user in this workspace. */
  myRole: Role
}

export interface Member {
  user: PublicUser
  role: Role
  joinedAt: string
}

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: Exclude<Role, 'owner'>
  invitedBy: PublicUser
  createdAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

/** What an invitee sees when opening an invitation link. */
export interface InvitationPreview {
  workspaceName: string
  email: string
  role: Exclude<Role, 'owner'>
  invitedByName: string
  expiresAt: string
  status: Invitation['status']
}

export interface Label {
  id: string
  workspaceId: string
  name: string
  color: LabelColor
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string
  createdAt: string
  taskCount: number
}

export interface Column {
  id: string
  projectId: string
  name: string
  position: number
}

export interface Task {
  id: string
  workspaceId: string
  projectId: string
  columnId: string
  title: string
  description: string
  assigneeId: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  dueDate: string | null
  priority: Priority
  labelIds: string[]
  /** Sort key within the column (ascending). */
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Incremented on every change; used to reject stale writes (409). */
  version: number
}

export interface Board {
  project: Project
  columns: Column[]
  tasks: Task[]
}

export interface Comment {
  id: string
  taskId: string
  author: PublicUser
  body: string
  mentionIds: string[]
  createdAt: string
}

export type ActivityType =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'comment.created'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'column.created'
  | 'column.renamed'
  | 'column.deleted'
  | 'member.invited'
  | 'member.joined'
  | 'member.role_changed'
  | 'member.removed'

export interface Activity {
  id: string
  workspaceId: string
  projectId: string | null
  taskId: string | null
  actor: PublicUser
  type: ActivityType
  /** Small, human-readable details (titles, column names, changed fields). */
  data: Record<string, string>
  createdAt: string
}

export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none'

export interface TaskFilters {
  text: string
  assigneeId: string | 'any' | 'unassigned'
  labelId: string | 'any'
  priority: Priority | 'any'
  due: DueFilter
}

export interface SearchResult {
  task: Task
  projectName: string
  columnName: string
}

// ---------- Requests ----------

export interface RegisterInput {
  name: string
  email: string
  password: string
}
export interface LoginInput {
  email: string
  password: string
}
export interface AuthResult {
  token: string
  user: User
}
export interface TaskInput {
  title: string
  description: string
  assigneeId: string | null
  dueDate: string | null
  priority: Priority
  labelIds: string[]
}
export interface MoveTaskInput {
  columnId: string
  /** Place the task directly after this task (null = top of column). */
  afterTaskId: string | null
  version: number
}

// ---------- Errors ----------

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NETWORK'
  | 'SERVER'

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  fieldErrors: Record<string, string>

  constructor(status: number, code: ApiErrorCode, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

// ---------- Service interface ----------

export interface Api {
  auth: {
    register(input: RegisterInput): Promise<AuthResult>
    login(input: LoginInput): Promise<AuthResult>
    /** idToken is the Google Identity Services credential (JWT). */
    loginWithGoogle(idToken: string): Promise<AuthResult>
    me(): Promise<User>
    updateProfile(input: { name?: string; theme?: Theme }): Promise<User>
    logout(): Promise<void>
  }
  workspaces: {
    list(): Promise<Workspace[]>
    get(workspaceId: string): Promise<Workspace>
    create(input: { name: string }): Promise<Workspace>
    rename(workspaceId: string, name: string): Promise<Workspace>
    remove(workspaceId: string): Promise<void>
    leave(workspaceId: string): Promise<void>
  }
  members: {
    list(workspaceId: string): Promise<Member[]>
    updateRole(workspaceId: string, userId: string, role: Exclude<Role, 'owner'>): Promise<Member>
    remove(workspaceId: string, userId: string): Promise<void>
  }
  invitations: {
    list(workspaceId: string): Promise<Invitation[]>
    create(workspaceId: string, input: { email: string; role: Exclude<Role, 'owner'> }): Promise<Invitation>
    revoke(workspaceId: string, invitationId: string): Promise<void>
    preview(token: string): Promise<InvitationPreview>
    accept(token: string): Promise<Workspace>
  }
  labels: {
    list(workspaceId: string): Promise<Label[]>
    create(workspaceId: string, input: { name: string; color: LabelColor }): Promise<Label>
    remove(workspaceId: string, labelId: string): Promise<void>
  }
  projects: {
    list(workspaceId: string): Promise<Project[]>
    create(workspaceId: string, input: { name: string; description: string }): Promise<Project>
    update(projectId: string, input: { name: string; description: string }): Promise<Project>
    remove(projectId: string): Promise<void>
  }
  board: {
    get(projectId: string): Promise<Board>
  }
  columns: {
    create(projectId: string, name: string): Promise<Column>
    rename(columnId: string, name: string): Promise<Column>
    remove(columnId: string): Promise<void>
  }
  tasks: {
    get(taskId: string): Promise<Task>
    create(projectId: string, columnId: string, input: TaskInput): Promise<Task>
    update(taskId: string, input: TaskInput & { version: number }): Promise<Task>
    move(taskId: string, input: MoveTaskInput): Promise<Task>
    remove(taskId: string): Promise<void>
    search(workspaceId: string, filters: TaskFilters): Promise<SearchResult[]>
  }
  comments: {
    list(taskId: string): Promise<Comment[]>
    create(taskId: string, input: { body: string; mentionIds: string[] }): Promise<Comment>
  }
  activity: {
    list(scope: { projectId?: string; taskId?: string }): Promise<Activity[]>
  }
}

// ---------- Real-time contract (Socket.IO later) ----------

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export type RealtimeEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:moved'
  | 'task:deleted'
  | 'column:changed'
  | 'project:changed'
  | 'comment:created'
  | 'activity:created'
  | 'member:changed'
  | 'workspace:access-revoked'

export interface RealtimeEvent {
  eventId: string
  type: RealtimeEventType
  workspaceId: string
  projectId: string | null
  actorId: string
  at: string
  data: {
    task?: Task
    taskId?: string
    comment?: Comment
    activity?: Activity
    userId?: string
  }
}

export interface RealtimeClient {
  connect(token: string): void
  disconnect(): void
  /** Ask the server to join a workspace room. Rejects with FORBIDDEN if not a member. */
  joinWorkspace(workspaceId: string): Promise<void>
  leaveWorkspace(workspaceId: string): void
  getStatus(): RealtimeStatus
  onStatus(listener: (status: RealtimeStatus) => void): () => void
  onEvent(listener: (event: RealtimeEvent) => void): () => void
  /** Fires after a reconnect so the UI can refetch possibly-stale data. */
  onResync(listener: () => void): () => void
}
