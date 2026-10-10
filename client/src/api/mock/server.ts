import { can, canDeleteTask, canManageMember, assignableRoles, roleLabel, type Action } from '../permissions'
import { matchesFilters } from '../filters'
import { getToken, setToken } from '../session'
import {
  ApiError,
  type Activity,
  type Api,
  type Comment,
  type Invitation,
  type LabelColor,
  type Priority,
  type Project,
  type RealtimeEvent,
  type Role,
  type Task,
  type TaskInput,
  type User,
  type Workspace,
} from '../types'
import { mockControls } from './controls'
import { loadDb, newId, saveDb, type Db, type DbActivity, type DbMembership, type DbUser } from './db'
import { publish } from './realtime'

// Mock backend. Every operation follows the same order the Express API will:
// authenticate -> authorize -> validate -> persist -> activity -> emit event.

const INVITE_TTL_MS = 48 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITIES: Priority[] = ['low', 'medium', 'high']
const LABEL_COLORS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink']

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()

// ---------- request pipeline (latency + simulated failures) ----------

async function handle<T>(fn: () => T): Promise<T> {
  const c = mockControls.get()
  if (c.sleeping) {
    await delay(4000)
    mockControls.set({ sleeping: false })
  }
  await delay(c.latencyMs)
  if (c.offline || !navigator.onLine) throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.')

  const forced = mockControls.get().nextFailure
  if (forced !== 'none') {
    mockControls.set({ nextFailure: 'none' })
    switch (forced) {
      case 'server':
        throw new ApiError(500, 'SERVER', 'Something went wrong on the server. Please try again.')
      case 'forbidden':
        throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do that.')
      case 'validation':
        throw new ApiError(422, 'VALIDATION', 'The server rejected this request (simulated validation failure).')
      case 'network':
        throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.')
      case 'unauthenticated':
        setToken(null)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
    }
  }
  if (Math.random() < c.failureRate) throw new ApiError(500, 'SERVER', 'Something went wrong on the server. Please try again.')
  return fn()
}

// ---------- helpers ----------

function requireUser(db: Db): DbUser {
  const token = getToken()
  const userId = db.sessions.find((s) => s.token === token)?.userId
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.')
  return user
}

function toUser(u: DbUser): User {
  return { id: u.id, name: u.name, email: u.email, theme: u.theme, authProviders: u.authProviders }
}

function publicUser(db: Db, userId: string) {
  const u = db.users.find((x) => x.id === userId)
  return u ? { id: u.id, name: u.name, email: u.email } : { id: userId, name: 'Deleted user', email: '' }
}

function requireMember(db: Db, workspaceId: string, userId: string): DbMembership {
  if (!db.workspaces.some((w) => w.id === workspaceId)) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.')
  const m = db.memberships.find((x) => x.workspaceId === workspaceId && x.userId === userId)
  if (!m) throw new ApiError(403, 'FORBIDDEN', 'You are not a member of this workspace.')
  return m
}

function requireAction(m: DbMembership, action: Action) {
  if (!can(m.role, action)) throw new ApiError(403, 'FORBIDDEN', `Your role (${roleLabel[m.role]}) cannot do this.`)
}

/** Resources in other workspaces are reported as "not found" so their existence never leaks. */
function findProject(db: Db, projectId: string, userId: string) {
  const project = db.projects.find((p) => p.id === projectId)
  if (!project || !db.memberships.some((m) => m.workspaceId === project.workspaceId && m.userId === userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found.')
  }
  return { project, membership: requireMember(db, project.workspaceId, userId) }
}

function findTask(db: Db, taskId: string, userId: string) {
  const task = db.tasks.find((t) => t.id === taskId)
  if (!task || !db.memberships.some((m) => m.workspaceId === task.workspaceId && m.userId === userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found.')
  }
  return { task, membership: requireMember(db, task.workspaceId, userId) }
}

class Validator {
  errors: Record<string, string> = {}
  text(field: string, value: unknown, min: number, max: number, label: string): string {
    const v = typeof value === 'string' ? value.trim() : ''
    if (v.length < min) this.errors[field] = min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`
    else if (v.length > max) this.errors[field] = `${label} must be at most ${max} characters.`
    return v
  }
  check(field: string, ok: boolean, message: string) {
    if (!ok && !this.errors[field]) this.errors[field] = message
  }
  done() {
    if (Object.keys(this.errors).length > 0) throw new ApiError(422, 'VALIDATION', 'Please fix the highlighted fields.', this.errors)
  }
}

function toWorkspace(db: Db, workspaceId: string, userId: string): Workspace {
  const w = db.workspaces.find((x) => x.id === workspaceId)!
  const m = requireMember(db, workspaceId, userId)
  return { id: w.id, name: w.name, createdAt: w.createdAt, myRole: m.role }
}

function toProject(db: Db, projectId: string): Project {
  const p = db.projects.find((x) => x.id === projectId)!
  return { ...p, taskCount: db.tasks.filter((t) => t.projectId === p.id).length }
}

function toComment(db: Db, c: Db['comments'][number]): Comment {
  return { id: c.id, taskId: c.taskId, author: publicUser(db, c.authorId), body: c.body, mentionIds: c.mentionIds, createdAt: c.createdAt }
}

function toActivity(db: Db, a: DbActivity): Activity {
  const { actorId, ...rest } = a
  return { ...rest, actor: publicUser(db, actorId) }
}

function toInvitation(db: Db, i: Db['invitations'][number]): Invitation {
  const expired = i.status === 'pending' && new Date(i.expiresAt).getTime() < Date.now()
  return {
    id: i.id,
    workspaceId: i.workspaceId,
    email: i.email,
    role: i.role,
    invitedBy: publicUser(db, i.invitedById),
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    status: expired ? 'expired' : i.status,
  }
}

function sendEmail(db: Db, to: string, subject: string, body: string, link: string | null = null) {
  db.outbox.unshift({ id: newId(), to, subject, body, link, sentAt: now() })
  if (db.outbox.length > 50) db.outbox.length = 50
}

/** Collected during an operation and published only after the DB is saved. */
type Pending = RealtimeEvent[]

function event(type: RealtimeEvent['type'], workspaceId: string, projectId: string | null, actorId: string, data: RealtimeEvent['data'] = {}): RealtimeEvent {
  return { eventId: newId(), type, workspaceId, projectId, actorId, at: now(), data }
}

function logActivity(db: Db, pending: Pending, a: Omit<DbActivity, 'id' | 'createdAt'>) {
  const row: DbActivity = { ...a, id: newId(), createdAt: now() }
  db.activity.push(row)
  pending.push(event('activity:created', a.workspaceId, a.projectId, a.actorId, { activity: toActivity(db, row) }))
}

function commit(db: Db, pending: Pending) {
  saveDb(db)
  pending.forEach(publish)
}

function createSession(db: Db, user: DbUser) {
  const token = `mock.${user.id}.${newId()}`
  db.sessions.push({ token, userId: user.id })
  setToken(token)
  return { token, user: toUser(user) }
}

function validateTaskInput(db: Db, workspaceId: string, input: TaskInput) {
  const v = new Validator()
  const title = v.text('title', input.title, 1, 120, 'Title')
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  v.check('description', description.length <= 5000, 'Description must be at most 5000 characters.')
  v.check('priority', PRIORITIES.includes(input.priority), 'Choose a valid priority.')
  if (input.dueDate !== null) {
    v.check('dueDate', DATE_RE.test(input.dueDate) && !Number.isNaN(Date.parse(input.dueDate)), 'Enter a valid date.')
  }
  if (input.assigneeId !== null) {
    const m = db.memberships.find((x) => x.workspaceId === workspaceId && x.userId === input.assigneeId)
    v.check('assigneeId', !!m && m.role !== 'viewer', 'The assignee must be a workspace member who can edit tasks.')
  }
  const validLabels = new Set(db.labels.filter((l) => l.workspaceId === workspaceId).map((l) => l.id))
  v.check('labelIds', Array.isArray(input.labelIds) && input.labelIds.every((id) => validLabels.has(id)), 'One of the labels does not belong to this workspace.')
  v.done()
  return { title, description, assigneeId: input.assigneeId, dueDate: input.dueDate, priority: input.priority, labelIds: [...new Set(input.labelIds)] }
}

function inviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`
}

// ---------- operations shared with the "simulate teammate" tool ----------

function opCreateTask(db: Db, pending: Pending, actor: DbUser, projectId: string, columnId: string, input: TaskInput): Task {
  const { project, membership } = findProject(db, projectId, actor.id)
  requireAction(membership, 'task:write')
  const column = db.columns.find((c) => c.id === columnId && c.projectId === project.id)
  if (!column) throw new ApiError(422, 'VALIDATION', 'That column does not exist in this project.')
  const clean = validateTaskInput(db, project.workspaceId, input)
  const inColumn = db.tasks.filter((t) => t.columnId === columnId)
  const position = inColumn.length ? Math.max(...inColumn.map((t) => t.position)) + 1000 : 1000
  const task: Task = { id: newId(), workspaceId: project.workspaceId, projectId, columnId, ...clean, position, createdBy: actor.id, createdAt: now(), updatedAt: now(), version: 1 }
  db.tasks.push(task)
  logActivity(db, pending, { workspaceId: task.workspaceId, projectId, taskId: task.id, actorId: actor.id, type: 'task.created', data: { title: task.title, column: column.name } })
  if (task.assigneeId && task.assigneeId !== actor.id) {
    const assignee = db.users.find((u) => u.id === task.assigneeId)
    if (assignee) sendEmail(db, assignee.email, `You were assigned: ${task.title}`, `${actor.name} assigned you a task in ${project.name}.`)
  }
  pending.push(event('task:created', task.workspaceId, projectId, actor.id, { task }))
  return task
}

function opMoveTask(db: Db, pending: Pending, actor: DbUser, taskId: string, columnId: string, afterTaskId: string | null, version: number): Task {
  const { task, membership } = findTask(db, taskId, actor.id)
  requireAction(membership, 'task:write')
  if (task.version !== version) throw new ApiError(409, 'CONFLICT', 'Someone else changed this task. The board has been refreshed.')
  const target = db.columns.find((c) => c.id === columnId && c.projectId === task.projectId)
  if (!target) throw new ApiError(422, 'VALIDATION', 'That column does not exist in this project.')

  const siblings = db.tasks.filter((t) => t.columnId === columnId && t.id !== task.id).sort((a, b) => a.position - b.position)
  let position: number
  if (afterTaskId === null) {
    position = siblings.length ? siblings[0].position - 1000 : 1000
  } else {
    const idx = siblings.findIndex((t) => t.id === afterTaskId)
    if (idx === -1) throw new ApiError(409, 'CONFLICT', 'The board changed while you were dragging. It has been refreshed.')
    const next = siblings[idx + 1]
    position = next ? (siblings[idx].position + next.position) / 2 : siblings[idx].position + 1000
  }

  const fromColumn = db.columns.find((c) => c.id === task.columnId)
  const changedColumn = task.columnId !== columnId
  Object.assign(task, { columnId, position, updatedAt: now(), version: task.version + 1 })
  if (changedColumn) {
    logActivity(db, pending, { workspaceId: task.workspaceId, projectId: task.projectId, taskId: task.id, actorId: actor.id, type: 'task.moved', data: { title: task.title, from: fromColumn?.name ?? '', to: target.name } })
  }
  pending.push(event('task:moved', task.workspaceId, task.projectId, actor.id, { task: { ...task } }))
  return { ...task }
}

function opCreateComment(db: Db, pending: Pending, actor: DbUser, taskId: string, body: string, mentionIds: string[]): Comment {
  const { task, membership } = findTask(db, taskId, actor.id)
  requireAction(membership, 'comment:create')
  const v = new Validator()
  const text = v.text('body', body, 1, 2000, 'Comment')
  const memberIds = new Set(db.memberships.filter((m) => m.workspaceId === task.workspaceId).map((m) => m.userId))
  v.check('body', Array.isArray(mentionIds) && mentionIds.every((id) => memberIds.has(id)), 'You can only mention members of this workspace.')
  v.done()
  const row = { id: newId(), taskId, authorId: actor.id, body: text, mentionIds: [...new Set(mentionIds)], createdAt: now() }
  db.comments.push(row)
  const comment = toComment(db, row)
  logActivity(db, pending, { workspaceId: task.workspaceId, projectId: task.projectId, taskId, actorId: actor.id, type: 'comment.created', data: { title: task.title } })
  for (const id of row.mentionIds) {
    const u = db.users.find((x) => x.id === id)
    if (u && u.id !== actor.id) sendEmail(db, u.email, `${actor.name} mentioned you on "${task.title}"`, text)
  }
  pending.push(event('comment:created', task.workspaceId, task.projectId, actor.id, { comment, taskId }))
  return comment
}

// ---------- API ----------

export function createMockApi(): Api {
  return {
    auth: {
      register: (input) =>
        handle(() => {
          const db = loadDb()
          const v = new Validator()
          const name = v.text('name', input.name, 2, 60, 'Name')
          const email = v.text('email', input.email, 3, 254, 'Email').toLowerCase()
          v.check('email', EMAIL_RE.test(email), 'Enter a valid email address.')
          v.check('password', typeof input.password === 'string' && input.password.length >= 8, 'Password must be at least 8 characters.')
          v.check('email', !db.users.some((u) => u.email === email), 'An account with this email already exists.')
          v.done()
          const user: DbUser = { id: newId(), name, email, password: input.password, theme: 'light', authProviders: ['password'] }
          db.users.push(user)
          const result = createSession(db, user)
          saveDb(db)
          return result
        }),

      login: (input) =>
        handle(() => {
          const db = loadDb()
          const email = String(input.email ?? '').trim().toLowerCase()
          const user = db.users.find((u) => u.email === email)
          if (!user || user.password === null || user.password !== input.password) {
            throw new ApiError(401, 'UNAUTHENTICATED', user && user.password === null ? 'This account uses Google sign-in.' : 'Incorrect email or password.')
          }
          const result = createSession(db, user)
          saveDb(db)
          return result
        }),

      loginWithGoogle: (idToken) =>
        handle(() => {
          // Real backend: verify the ID token with google-auth-library.
          let claims: { email?: string; name?: string }
          try {
            const bytes = Uint8Array.from(atob(idToken.replace(/^mock-google\./, '')), (c) => c.charCodeAt(0))
            claims = JSON.parse(new TextDecoder().decode(bytes))
          } catch {
            throw new ApiError(401, 'UNAUTHENTICATED', 'Google sign-in failed. Please try again.')
          }
          const email = String(claims.email ?? '').toLowerCase()
          if (!EMAIL_RE.test(email)) throw new ApiError(401, 'UNAUTHENTICATED', 'Google sign-in failed. Please try again.')
          const db = loadDb()
          let user = db.users.find((u) => u.email === email)
          if (!user) {
            user = { id: newId(), name: String(claims.name ?? email.split('@')[0]).slice(0, 60), email, password: null, theme: 'light', authProviders: ['google'] }
            db.users.push(user)
          } else if (!user.authProviders.includes('google')) {
            user.authProviders.push('google')
          }
          const result = createSession(db, user)
          saveDb(db)
          return result
        }),

      me: () => handle(() => toUser(requireUser(loadDb()))),

      updateProfile: (input) =>
        handle(() => {
          const db = loadDb()
          const user = requireUser(db)
          const v = new Validator()
          if (input.name !== undefined) user.name = v.text('name', input.name, 2, 60, 'Name')
          if (input.theme !== undefined) {
            v.check('theme', input.theme === 'light' || input.theme === 'dark', 'Invalid theme.')
            user.theme = input.theme
          }
          v.done()
          saveDb(db)
          return toUser(user)
        }),

      logout: async () => {
        const db = loadDb()
        const token = getToken()
        db.sessions = db.sessions.filter((s) => s.token !== token)
        saveDb(db)
        setToken(null)
      },
    },

    workspaces: {
      list: () =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          return db.memberships
            .filter((m) => m.userId === me.id)
            .map((m) => toWorkspace(db, m.workspaceId, me.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        }),

      get: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          return toWorkspace(db, workspaceId, requireUser(db).id)
        }),

      create: (input) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const v = new Validator()
          const name = v.text('name', input.name, 2, 50, 'Workspace name')
          v.done()
          const ws = { id: newId(), name, createdAt: now() }
          db.workspaces.push(ws)
          db.memberships.push({ workspaceId: ws.id, userId: me.id, role: 'owner', joinedAt: now() })
          saveDb(db)
          return toWorkspace(db, ws.id, me.id)
        }),

      rename: (workspaceId, name) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          requireAction(requireMember(db, workspaceId, me.id), 'workspace:rename')
          const v = new Validator()
          const clean = v.text('name', name, 2, 50, 'Workspace name')
          v.done()
          db.workspaces.find((w) => w.id === workspaceId)!.name = clean
          commit(db, [event('member:changed', workspaceId, null, me.id)])
          return toWorkspace(db, workspaceId, me.id)
        }),

      remove: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          requireAction(requireMember(db, workspaceId, me.id), 'workspace:delete')
          const taskIds = new Set(db.tasks.filter((t) => t.workspaceId === workspaceId).map((t) => t.id))
          const projectIds = new Set(db.projects.filter((p) => p.workspaceId === workspaceId).map((p) => p.id))
          db.workspaces = db.workspaces.filter((w) => w.id !== workspaceId)
          db.memberships = db.memberships.filter((m) => m.workspaceId !== workspaceId)
          db.invitations = db.invitations.filter((i) => i.workspaceId !== workspaceId)
          db.labels = db.labels.filter((l) => l.workspaceId !== workspaceId)
          db.projects = db.projects.filter((p) => p.workspaceId !== workspaceId)
          db.columns = db.columns.filter((c) => !projectIds.has(c.projectId))
          db.tasks = db.tasks.filter((t) => t.workspaceId !== workspaceId)
          db.comments = db.comments.filter((c) => !taskIds.has(c.taskId))
          db.activity = db.activity.filter((a) => a.workspaceId !== workspaceId)
          // No userId: everyone in the room loses access.
          commit(db, [event('workspace:access-revoked', workspaceId, null, me.id)])
        }),

      leave: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const m = requireMember(db, workspaceId, me.id)
          if (m.role === 'owner') throw new ApiError(422, 'VALIDATION', 'The owner cannot leave. Delete the workspace instead.')
          db.memberships = db.memberships.filter((x) => x !== m)
          const pending: Pending = []
          logActivity(db, pending, { workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'member.removed', data: { name: me.name, reason: 'left' } })
          pending.push(event('member:changed', workspaceId, null, me.id, { userId: me.id }))
          commit(db, pending)
        }),
    },

    members: {
      list: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          requireMember(db, workspaceId, requireUser(db).id)
          const order: Role[] = ['owner', 'admin', 'member', 'viewer']
          return db.memberships
            .filter((m) => m.workspaceId === workspaceId)
            .map((m) => ({ user: publicUser(db, m.userId), role: m.role, joinedAt: m.joinedAt }))
            .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.user.name.localeCompare(b.user.name))
        }),

      updateRole: (workspaceId, userId, role) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const mine = requireMember(db, workspaceId, me.id)
          const target = db.memberships.find((m) => m.workspaceId === workspaceId && m.userId === userId)
          if (!target) throw new ApiError(404, 'NOT_FOUND', 'Member not found.')
          if (userId === me.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot change your own role.')
          if (!canManageMember(mine.role, target.role) || !assignableRoles(mine.role).includes(role)) {
            throw new ApiError(403, 'FORBIDDEN', `Your role (${roleLabel[mine.role]}) cannot make this change.`)
          }
          const from = target.role
          target.role = role
          const pending: Pending = []
          const name = publicUser(db, userId).name
          logActivity(db, pending, { workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'member.role_changed', data: { name, from: roleLabel[from], to: roleLabel[role] } })
          pending.push(event('member:changed', workspaceId, null, me.id, { userId }))
          commit(db, pending)
          return { user: publicUser(db, userId), role, joinedAt: target.joinedAt }
        }),

      remove: (workspaceId, userId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const mine = requireMember(db, workspaceId, me.id)
          const target = db.memberships.find((m) => m.workspaceId === workspaceId && m.userId === userId)
          if (!target) throw new ApiError(404, 'NOT_FOUND', 'Member not found.')
          if (userId === me.id) throw new ApiError(422, 'VALIDATION', 'Use "Leave workspace" to remove yourself.')
          if (!canManageMember(mine.role, target.role)) throw new ApiError(403, 'FORBIDDEN', `Your role (${roleLabel[mine.role]}) cannot remove this member.`)
          db.memberships = db.memberships.filter((m) => m !== target)
          db.tasks.forEach((t) => {
            if (t.workspaceId === workspaceId && t.assigneeId === userId) {
              t.assigneeId = null
              t.version += 1
            }
          })
          const pending: Pending = []
          logActivity(db, pending, { workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'member.removed', data: { name: publicUser(db, userId).name, reason: 'removed' } })
          pending.push(event('member:changed', workspaceId, null, me.id, { userId }))
          pending.push(event('workspace:access-revoked', workspaceId, null, me.id, { userId }))
          commit(db, pending)
        }),
    },

    invitations: {
      list: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          requireAction(requireMember(db, workspaceId, requireUser(db).id), 'member:manage')
          return db.invitations
            .filter((i) => i.workspaceId === workspaceId && i.status === 'pending')
            .map((i) => toInvitation(db, i))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        }),

      create: (workspaceId, input) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const mine = requireMember(db, workspaceId, me.id)
          requireAction(mine, 'member:manage')
          const v = new Validator()
          const email = v.text('email', input.email, 3, 254, 'Email').toLowerCase()
          v.check('email', EMAIL_RE.test(email), 'Enter a valid email address.')
          v.check('role', assignableRoles(mine.role).includes(input.role), 'You cannot invite someone with this role.')
          const existing = db.users.find((u) => u.email === email)
          v.check('email', !existing || !db.memberships.some((m) => m.workspaceId === workspaceId && m.userId === existing.id), 'This person is already a member.')
          v.done()
          // Re-inviting replaces any earlier pending invitation for the same email.
          db.invitations.forEach((i) => {
            if (i.workspaceId === workspaceId && i.email === email && i.status === 'pending') i.status = 'revoked'
          })
          const token = newId().replaceAll('-', '')
          const row = { id: newId(), workspaceId, email, role: input.role, token, invitedById: me.id, createdAt: now(), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(), status: 'pending' as const }
          db.invitations.push(row)
          const wsName = db.workspaces.find((w) => w.id === workspaceId)!.name
          sendEmail(db, email, `${me.name} invited you to ${wsName} on Taskloom`, `You have been invited as ${roleLabel[input.role]}. The link expires in 48 hours.`, inviteLink(token))
          const pending: Pending = []
          logActivity(db, pending, { workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'member.invited', data: { email, role: roleLabel[input.role] } })
          commit(db, pending)
          return toInvitation(db, row)
        }),

      revoke: (workspaceId, invitationId) =>
        handle(() => {
          const db = loadDb()
          requireAction(requireMember(db, workspaceId, requireUser(db).id), 'member:manage')
          const inv = db.invitations.find((i) => i.id === invitationId && i.workspaceId === workspaceId)
          if (!inv) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found.')
          inv.status = 'revoked'
          saveDb(db)
        }),

      preview: (token) =>
        handle(() => {
          const db = loadDb()
          const inv = db.invitations.find((i) => i.token === token)
          if (!inv) throw new ApiError(404, 'NOT_FOUND', 'This invitation link is invalid.')
          const view = toInvitation(db, inv)
          return {
            workspaceName: db.workspaces.find((w) => w.id === inv.workspaceId)?.name ?? 'Unknown workspace',
            email: inv.email,
            role: inv.role,
            invitedByName: view.invitedBy.name,
            expiresAt: inv.expiresAt,
            status: view.status,
          }
        }),

      accept: (token) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const inv = db.invitations.find((i) => i.token === token)
          if (!inv) throw new ApiError(404, 'NOT_FOUND', 'This invitation link is invalid.')
          const status = toInvitation(db, inv).status
          if (status === 'expired') throw new ApiError(409, 'CONFLICT', 'This invitation has expired. Ask for a new one.')
          if (status !== 'pending') throw new ApiError(409, 'CONFLICT', 'This invitation is no longer valid.')
          if (inv.email !== me.email) throw new ApiError(403, 'FORBIDDEN', `This invitation was sent to ${inv.email}. Sign in with that account to accept it.`)
          if (!db.memberships.some((m) => m.workspaceId === inv.workspaceId && m.userId === me.id)) {
            db.memberships.push({ workspaceId: inv.workspaceId, userId: me.id, role: inv.role, joinedAt: now() })
          }
          inv.status = 'accepted'
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: inv.workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'member.joined', data: { name: me.name, role: roleLabel[inv.role] } })
          pending.push(event('member:changed', inv.workspaceId, null, me.id, { userId: me.id }))
          commit(db, pending)
          return toWorkspace(db, inv.workspaceId, me.id)
        }),
    },

    labels: {
      list: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          requireMember(db, workspaceId, requireUser(db).id)
          return db.labels.filter((l) => l.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name))
        }),

      create: (workspaceId, input) =>
        handle(() => {
          const db = loadDb()
          requireAction(requireMember(db, workspaceId, requireUser(db).id), 'project:manage')
          const v = new Validator()
          const name = v.text('name', input.name, 1, 24, 'Label name')
          v.check('color', LABEL_COLORS.includes(input.color), 'Choose a colour.')
          v.check('name', !db.labels.some((l) => l.workspaceId === workspaceId && l.name.toLowerCase() === name.toLowerCase()), 'A label with this name already exists.')
          v.done()
          const label = { id: newId(), workspaceId, name, color: input.color }
          db.labels.push(label)
          commit(db, [event('project:changed', workspaceId, null, requireUser(db).id)])
          return label
        }),

      remove: (workspaceId, labelId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          requireAction(requireMember(db, workspaceId, me.id), 'project:manage')
          if (!db.labels.some((l) => l.id === labelId && l.workspaceId === workspaceId)) throw new ApiError(404, 'NOT_FOUND', 'Label not found.')
          db.labels = db.labels.filter((l) => l.id !== labelId)
          db.tasks.forEach((t) => {
            if (t.labelIds.includes(labelId)) {
              t.labelIds = t.labelIds.filter((id) => id !== labelId)
              t.version += 1
            }
          })
          commit(db, [event('project:changed', workspaceId, null, me.id)])
        }),
    },

    projects: {
      list: (workspaceId) =>
        handle(() => {
          const db = loadDb()
          requireMember(db, workspaceId, requireUser(db).id)
          return db.projects
            .filter((p) => p.workspaceId === workspaceId)
            .map((p) => toProject(db, p.id))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        }),

      create: (workspaceId, input) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          requireAction(requireMember(db, workspaceId, me.id), 'project:manage')
          const v = new Validator()
          const name = v.text('name', input.name, 2, 60, 'Project name')
          const description = v.text('description', input.description ?? '', 0, 500, 'Description')
          v.done()
          const project = { id: newId(), workspaceId, name, description, createdAt: now() }
          db.projects.push(project)
          ;['To Do', 'In Progress', 'Review', 'Done'].forEach((col, i) => db.columns.push({ id: newId(), projectId: project.id, name: col, position: i }))
          const pending: Pending = []
          logActivity(db, pending, { workspaceId, projectId: project.id, taskId: null, actorId: me.id, type: 'project.created', data: { name } })
          pending.push(event('project:changed', workspaceId, project.id, me.id))
          commit(db, pending)
          return toProject(db, project.id)
        }),

      update: (projectId, input) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const { project, membership } = findProject(db, projectId, me.id)
          requireAction(membership, 'project:manage')
          const v = new Validator()
          const name = v.text('name', input.name, 2, 60, 'Project name')
          const description = v.text('description', input.description ?? '', 0, 500, 'Description')
          v.done()
          Object.assign(project, { name, description })
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: project.workspaceId, projectId, taskId: null, actorId: me.id, type: 'project.updated', data: { name } })
          pending.push(event('project:changed', project.workspaceId, projectId, me.id))
          commit(db, pending)
          return toProject(db, projectId)
        }),

      remove: (projectId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const { project, membership } = findProject(db, projectId, me.id)
          requireAction(membership, 'project:manage')
          const taskIds = new Set(db.tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
          db.projects = db.projects.filter((p) => p.id !== projectId)
          db.columns = db.columns.filter((c) => c.projectId !== projectId)
          db.tasks = db.tasks.filter((t) => t.projectId !== projectId)
          db.comments = db.comments.filter((c) => !taskIds.has(c.taskId))
          db.activity = db.activity.filter((a) => a.projectId !== projectId)
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: project.workspaceId, projectId: null, taskId: null, actorId: me.id, type: 'project.deleted', data: { name: project.name } })
          pending.push(event('project:changed', project.workspaceId, projectId, me.id))
          commit(db, pending)
        }),
    },

    board: {
      get: (projectId) =>
        handle(() => {
          const db = loadDb()
          const { project } = findProject(db, projectId, requireUser(db).id)
          return {
            project: toProject(db, project.id),
            columns: db.columns.filter((c) => c.projectId === projectId).sort((a, b) => a.position - b.position),
            tasks: db.tasks.filter((t) => t.projectId === projectId).sort((a, b) => a.position - b.position),
          }
        }),
    },

    columns: {
      create: (projectId, name) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const { project, membership } = findProject(db, projectId, me.id)
          requireAction(membership, 'project:manage')
          const v = new Validator()
          const clean = v.text('name', name, 1, 30, 'Column name')
          const existing = db.columns.filter((c) => c.projectId === projectId)
          v.check('name', existing.length < 10, 'A board can have at most 10 columns.')
          v.done()
          const column = { id: newId(), projectId, name: clean, position: existing.length ? Math.max(...existing.map((c) => c.position)) + 1 : 0 }
          db.columns.push(column)
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: project.workspaceId, projectId, taskId: null, actorId: me.id, type: 'column.created', data: { name: clean } })
          pending.push(event('column:changed', project.workspaceId, projectId, me.id))
          commit(db, pending)
          return column
        }),

      rename: (columnId, name) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const column = db.columns.find((c) => c.id === columnId)
          if (!column) throw new ApiError(404, 'NOT_FOUND', 'Column not found.')
          const { project, membership } = findProject(db, column.projectId, me.id)
          requireAction(membership, 'project:manage')
          const v = new Validator()
          const clean = v.text('name', name, 1, 30, 'Column name')
          v.done()
          const from = column.name
          column.name = clean
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: project.workspaceId, projectId: project.id, taskId: null, actorId: me.id, type: 'column.renamed', data: { from, to: clean } })
          pending.push(event('column:changed', project.workspaceId, project.id, me.id))
          commit(db, pending)
          return column
        }),

      remove: (columnId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const column = db.columns.find((c) => c.id === columnId)
          if (!column) throw new ApiError(404, 'NOT_FOUND', 'Column not found.')
          const { project, membership } = findProject(db, column.projectId, me.id)
          requireAction(membership, 'project:manage')
          if (db.tasks.some((t) => t.columnId === columnId)) throw new ApiError(409, 'CONFLICT', 'Move or delete the tasks in this column first.')
          if (db.columns.filter((c) => c.projectId === project.id).length <= 1) throw new ApiError(422, 'VALIDATION', 'A board needs at least one column.')
          db.columns = db.columns.filter((c) => c.id !== columnId)
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: project.workspaceId, projectId: project.id, taskId: null, actorId: me.id, type: 'column.deleted', data: { name: column.name } })
          pending.push(event('column:changed', project.workspaceId, project.id, me.id))
          commit(db, pending)
        }),
    },

    tasks: {
      get: (taskId) =>
        handle(() => {
          const db = loadDb()
          return { ...findTask(db, taskId, requireUser(db).id).task }
        }),

      create: (projectId, columnId, input) =>
        handle(() => {
          const db = loadDb()
          const pending: Pending = []
          const task = opCreateTask(db, pending, requireUser(db), projectId, columnId, input)
          commit(db, pending)
          return task
        }),

      update: (taskId, input) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const { task, membership } = findTask(db, taskId, me.id)
          requireAction(membership, 'task:write')
          if (task.version !== input.version) throw new ApiError(409, 'CONFLICT', 'Someone else changed this task while you were editing. Review the latest version and try again.')
          const clean = validateTaskInput(db, task.workspaceId, input)
          const names: Record<string, string> = { title: 'title', description: 'description', assigneeId: 'assignee', dueDate: 'due date', priority: 'priority', labelIds: 'labels' }
          const changed = (Object.keys(names) as Array<keyof typeof clean>).filter((k) => JSON.stringify(task[k]) !== JSON.stringify(clean[k]))
          if (changed.length === 0) return { ...task }
          const assigneeChanged = task.assigneeId !== clean.assigneeId
          Object.assign(task, clean, { updatedAt: now(), version: task.version + 1 })
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: task.workspaceId, projectId: task.projectId, taskId, actorId: me.id, type: 'task.updated', data: { title: task.title, fields: changed.map((k) => names[k]).join(', ') } })
          if (assigneeChanged && task.assigneeId && task.assigneeId !== me.id) {
            const assignee = db.users.find((u) => u.id === task.assigneeId)
            if (assignee) sendEmail(db, assignee.email, `You were assigned: ${task.title}`, `${me.name} assigned you a task.`)
          }
          pending.push(event('task:updated', task.workspaceId, task.projectId, me.id, { task: { ...task } }))
          commit(db, pending)
          return { ...task }
        }),

      move: (taskId, input) =>
        handle(() => {
          const db = loadDb()
          const pending: Pending = []
          const task = opMoveTask(db, pending, requireUser(db), taskId, input.columnId, input.afterTaskId, input.version)
          commit(db, pending)
          return task
        }),

      remove: (taskId) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          const { task, membership } = findTask(db, taskId, me.id)
          if (!canDeleteTask(membership.role, me.id, task.createdBy)) throw new ApiError(403, 'FORBIDDEN', 'You can only delete tasks you created.')
          db.tasks = db.tasks.filter((t) => t.id !== taskId)
          db.comments = db.comments.filter((c) => c.taskId !== taskId)
          const pending: Pending = []
          logActivity(db, pending, { workspaceId: task.workspaceId, projectId: task.projectId, taskId: null, actorId: me.id, type: 'task.deleted', data: { title: task.title } })
          pending.push(event('task:deleted', task.workspaceId, task.projectId, me.id, { taskId }))
          commit(db, pending)
        }),

      search: (workspaceId, filters) =>
        handle(() => {
          const db = loadDb()
          requireMember(db, workspaceId, requireUser(db).id)
          return db.tasks
            .filter((t) => t.workspaceId === workspaceId && matchesFilters(t, filters))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 50)
            .map((task) => ({
              task,
              projectName: db.projects.find((p) => p.id === task.projectId)?.name ?? '',
              columnName: db.columns.find((c) => c.id === task.columnId)?.name ?? '',
            }))
        }),
    },

    comments: {
      list: (taskId) =>
        handle(() => {
          const db = loadDb()
          findTask(db, taskId, requireUser(db).id)
          return db.comments
            .filter((c) => c.taskId === taskId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((c) => toComment(db, c))
        }),

      create: (taskId, input) =>
        handle(() => {
          const db = loadDb()
          const pending: Pending = []
          const comment = opCreateComment(db, pending, requireUser(db), taskId, input.body, input.mentionIds)
          commit(db, pending)
          return comment
        }),
    },

    activity: {
      list: (scope) =>
        handle(() => {
          const db = loadDb()
          const me = requireUser(db)
          let rows: DbActivity[]
          if (scope.taskId) {
            const { task } = findTask(db, scope.taskId, me.id)
            rows = db.activity.filter((a) => a.taskId === task.id)
          } else if (scope.projectId) {
            const { project } = findProject(db, scope.projectId, me.id)
            rows = db.activity.filter((a) => a.projectId === project.id)
          } else {
            throw new ApiError(422, 'VALIDATION', 'A project or task is required.')
          }
          return rows
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 100)
            .map((a) => toActivity(db, a))
        }),
    },
  }
}

// ---------- Mock Tools (not part of the API contract) ----------

export const mockTools = {
  outbox: () => loadDb().outbox,

  clearOutbox() {
    const db = loadDb()
    db.outbox = []
    saveDb(db)
  },

  expireInvitations() {
    const db = loadDb()
    let count = 0
    db.invitations.forEach((i) => {
      if (i.status === 'pending') {
        i.expiresAt = new Date(Date.now() - 60_000).toISOString()
        count += 1
      }
    })
    saveDb(db)
    return count
  },

  /** A teammate performs a real change (with events), as if in another browser. */
  simulateTeammate(workspaceId: string, projectId: string | null): string {
    const db = loadDb()
    const me = db.sessions.find((s) => s.token === getToken())?.userId
    const mates = db.memberships.filter((m) => m.workspaceId === workspaceId && m.userId !== me && m.role !== 'viewer')
    if (mates.length === 0) return 'No teammate who can edit is in this workspace.'
    const actor = db.users.find((u) => u.id === mates[Math.floor(Math.random() * mates.length)].userId)!
    const project = db.projects.find((p) => p.id === projectId) ?? db.projects.find((p) => p.workspaceId === workspaceId)
    if (!project) return 'Create a project first.'
    const columns = db.columns.filter((c) => c.projectId === project.id).sort((a, b) => a.position - b.position)
    const tasks = db.tasks.filter((t) => t.projectId === project.id)
    const pending: Pending = []
    const roll = Math.random()
    let message: string
    if (tasks.length === 0 || roll < 0.34) {
      const t = opCreateTask(db, pending, actor, project.id, columns[0].id, { title: `Follow-up from ${actor.name.split(' ')[0]}`, description: '', assigneeId: null, dueDate: null, priority: 'medium', labelIds: [] })
      message = `${actor.name} created "${t.title}".`
    } else if (roll < 0.67 && columns.length > 1) {
      const t = tasks[Math.floor(Math.random() * tasks.length)]
      const target = columns.filter((c) => c.id !== t.columnId)[Math.floor(Math.random() * (columns.length - 1))]
      opMoveTask(db, pending, actor, t.id, target.id, null, t.version)
      message = `${actor.name} moved "${t.title}" to ${target.name}.`
    } else {
      const t = tasks[Math.floor(Math.random() * tasks.length)]
      opCreateComment(db, pending, actor, t.id, 'Looks good, I will take a look later today.', [])
      message = `${actor.name} commented on "${t.title}".`
    }
    commit(db, pending)
    return message
  },

  /** Changes a task without sending an event, so this tab's board becomes stale. */
  makeBoardStale(projectId: string): string {
    const db = loadDb()
    const tasks = db.tasks.filter((t) => t.projectId === projectId)
    if (tasks.length === 0) return 'This board has no tasks.'
    const t = tasks[Math.floor(Math.random() * tasks.length)]
    t.title = t.title.endsWith(' (edited elsewhere)') ? t.title : `${t.title} (edited elsewhere)`
    t.version += 1
    t.updatedAt = now()
    saveDb(db)
    return `"${t.title}" changed silently. Editing or moving it now returns 409 Conflict.`
  },
}
