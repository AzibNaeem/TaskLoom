import type { ActivityType, Column, Label, Priority, Role, Task, Theme } from '../types'

// In-browser "database" for the mock backend. Persisted in localStorage so it
// survives refreshes and is shared by every tab (two tabs = two users).
// Mock only: the real backend stores bcrypt hashes, never plain passwords.

export interface DbUser {
  id: string
  name: string
  email: string
  password: string | null
  theme: Theme
  authProviders: Array<'password' | 'google'>
}
export interface DbWorkspace {
  id: string
  name: string
  createdAt: string
}
export interface DbMembership {
  workspaceId: string
  userId: string
  role: Role
  joinedAt: string
}
export interface DbInvitation {
  id: string
  workspaceId: string
  email: string
  role: Exclude<Role, 'owner'>
  token: string
  invitedById: string
  createdAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'revoked'
}
export interface DbProject {
  id: string
  workspaceId: string
  name: string
  description: string
  createdAt: string
}
export interface DbComment {
  id: string
  taskId: string
  authorId: string
  body: string
  mentionIds: string[]
  createdAt: string
}
export interface DbActivity {
  id: string
  workspaceId: string
  projectId: string | null
  taskId: string | null
  actorId: string
  type: ActivityType
  data: Record<string, string>
  createdAt: string
}
export interface DbEmail {
  id: string
  to: string
  subject: string
  body: string
  link: string | null
  sentAt: string
}

export interface Db {
  users: DbUser[]
  sessions: Array<{ token: string; userId: string }>
  workspaces: DbWorkspace[]
  memberships: DbMembership[]
  invitations: DbInvitation[]
  labels: Label[]
  projects: DbProject[]
  columns: Column[]
  tasks: Task[]
  comments: DbComment[]
  activity: DbActivity[]
  outbox: DbEmail[]
}

const STORAGE_KEY = 'taskloom-mock-db-v1'

export function newId(): string {
  return crypto.randomUUID()
}

export function loadDb(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // fall through to a fresh seed
  }
  const db = seed()
  saveDb(db)
  return db
}

export function saveDb(db: Db): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetDb(): void {
  saveDb(seed())
}

// ---------- Seed ----------

const DAY = 24 * 60 * 60 * 1000

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

function dateDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * DAY)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const SEED_PASSWORD = 'password123'

export const seedAccounts = [
  { email: 'azib@taskloom.dev', name: 'Azib Naeem', note: 'Owner of Taskloom Team' },
  { email: 'ahmad@taskloom.dev', name: 'Ahmad Bin Tariq', note: 'Admin of Taskloom Team' },
  { email: 'hamza@taskloom.dev', name: 'Hamza Ali', note: 'Member of Taskloom Team' },
  { email: 'sara@taskloom.dev', name: 'Sara Khan', note: 'Viewer of Taskloom Team (read-only)' },
  { email: 'bilal@taskloom.dev', name: 'Bilal Ahmed', note: 'Outsider: owns a different workspace' },
]

function seed(): Db {
  const users: DbUser[] = [
    { id: 'u-azib', name: 'Azib Naeem', email: 'azib@taskloom.dev', password: SEED_PASSWORD, theme: 'dark', authProviders: ['password'] },
    { id: 'u-ahmad', name: 'Ahmad Bin Tariq', email: 'ahmad@taskloom.dev', password: SEED_PASSWORD, theme: 'dark', authProviders: ['password', 'google'] },
    { id: 'u-hamza', name: 'Hamza Ali', email: 'hamza@taskloom.dev', password: SEED_PASSWORD, theme: 'light', authProviders: ['password'] },
    { id: 'u-sara', name: 'Sara Khan', email: 'sara@taskloom.dev', password: SEED_PASSWORD, theme: 'light', authProviders: ['password'] },
    { id: 'u-bilal', name: 'Bilal Ahmed', email: 'bilal@taskloom.dev', password: SEED_PASSWORD, theme: 'dark', authProviders: ['password'] },
  ]

  const workspaces: DbWorkspace[] = [
    { id: 'ws-team', name: 'Taskloom Team', createdAt: isoDaysFromNow(-20) },
    { id: 'ws-outsider', name: 'Outsider Studio', createdAt: isoDaysFromNow(-15) },
  ]

  const memberships: DbMembership[] = [
    { workspaceId: 'ws-team', userId: 'u-azib', role: 'owner', joinedAt: isoDaysFromNow(-20) },
    { workspaceId: 'ws-team', userId: 'u-ahmad', role: 'admin', joinedAt: isoDaysFromNow(-19) },
    { workspaceId: 'ws-team', userId: 'u-hamza', role: 'member', joinedAt: isoDaysFromNow(-12) },
    { workspaceId: 'ws-team', userId: 'u-sara', role: 'viewer', joinedAt: isoDaysFromNow(-10) },
    { workspaceId: 'ws-outsider', userId: 'u-bilal', role: 'owner', joinedAt: isoDaysFromNow(-15) },
  ]

  const labels: Label[] = [
    { id: 'l-frontend', workspaceId: 'ws-team', name: 'Frontend', color: 'blue' },
    { id: 'l-backend', workspaceId: 'ws-team', name: 'Backend', color: 'violet' },
    { id: 'l-bug', workspaceId: 'ws-team', name: 'Bug', color: 'red' },
    { id: 'l-design', workspaceId: 'ws-team', name: 'Design', color: 'pink' },
    { id: 'l-docs', workspaceId: 'ws-team', name: 'Docs', color: 'teal' },
    { id: 'l-marketing', workspaceId: 'ws-outsider', name: 'Marketing', color: 'orange' },
  ]

  const projects: DbProject[] = [
    { id: 'p-mvp', workspaceId: 'ws-team', name: 'Taskloom MVP', description: 'Everything needed for the semester demo.', createdAt: isoDaysFromNow(-18) },
    { id: 'p-report', workspaceId: 'ws-team', name: 'Semester Report', description: 'Write-up and presentation.', createdAt: isoDaysFromNow(-9) },
    { id: 'p-secret', workspaceId: 'ws-outsider', name: 'Secret Launch', description: 'Not visible to other workspaces.', createdAt: isoDaysFromNow(-14) },
  ]

  const columns: Column[] = [
    { id: 'c-mvp-todo', projectId: 'p-mvp', name: 'To Do', position: 0 },
    { id: 'c-mvp-doing', projectId: 'p-mvp', name: 'In Progress', position: 1 },
    { id: 'c-mvp-review', projectId: 'p-mvp', name: 'Review', position: 2 },
    { id: 'c-mvp-done', projectId: 'p-mvp', name: 'Done', position: 3 },
    { id: 'c-rep-todo', projectId: 'p-report', name: 'To Do', position: 0 },
    { id: 'c-rep-doing', projectId: 'p-report', name: 'Writing', position: 1 },
    { id: 'c-rep-done', projectId: 'p-report', name: 'Done', position: 2 },
    { id: 'c-sec-todo', projectId: 'p-secret', name: 'To Do', position: 0 },
    { id: 'c-sec-done', projectId: 'p-secret', name: 'Done', position: 1 },
  ]

  let n = 0
  const task = (
    id: string,
    projectId: string,
    columnId: string,
    title: string,
    opts: { desc?: string; assignee?: string | null; due?: number | null; priority?: Priority; labels?: string[]; by?: string; ws?: string },
  ): Task => {
    n += 1
    return {
      id,
      workspaceId: opts.ws ?? 'ws-team',
      projectId,
      columnId,
      title,
      description: opts.desc ?? '',
      assigneeId: opts.assignee ?? null,
      dueDate: opts.due === undefined || opts.due === null ? null : dateDaysFromNow(opts.due),
      priority: opts.priority ?? 'medium',
      labelIds: opts.labels ?? [],
      position: n * 1000,
      createdBy: opts.by ?? 'u-azib',
      createdAt: isoDaysFromNow(-10 + n * 0.5),
      updatedAt: isoDaysFromNow(-5 + n * 0.3),
      version: 1,
    }
  }

  const tasks: Task[] = [
    task('t-1', 'p-mvp', 'c-mvp-todo', 'Design the login and register screens', { assignee: 'u-azib', due: 2, priority: 'high', labels: ['l-frontend', 'l-design'] }),
    task('t-2', 'p-mvp', 'c-mvp-todo', 'Add Google sign-in button', { assignee: 'u-ahmad', due: 5, labels: ['l-frontend'], by: 'u-ahmad' }),
    task('t-3', 'p-mvp', 'c-mvp-todo', 'Write invitation email template', { due: null, priority: 'low', labels: ['l-docs'] }),
    task('t-4', 'p-mvp', 'c-mvp-doing', 'Build Kanban board with drag and drop', { assignee: 'u-ahmad', due: 0, priority: 'high', labels: ['l-frontend'], desc: 'Columns can be renamed and added. Cards move within and across columns.', by: 'u-ahmad' }),
    task('t-5', 'p-mvp', 'c-mvp-doing', 'Search and combined filters', { assignee: 'u-hamza', due: 3, labels: ['l-frontend'], by: 'u-hamza' }),
    task('t-6', 'p-mvp', 'c-mvp-review', 'Fix dark mode contrast on cards', { assignee: 'u-azib', due: -1, priority: 'high', labels: ['l-bug', 'l-design'] }),
    task('t-7', 'p-mvp', 'c-mvp-review', 'Define REST and Socket.IO contracts', { assignee: 'u-ahmad', due: -2, labels: ['l-backend', 'l-docs'], by: 'u-ahmad' }),
    task('t-8', 'p-mvp', 'c-mvp-done', 'Set up Vite + React + TypeScript', { assignee: 'u-azib', priority: 'medium', labels: ['l-frontend'] }),
    task('t-9', 'p-mvp', 'c-mvp-done', 'Project proposal approved', { priority: 'low', labels: ['l-docs'] }),
    task('t-10', 'p-report', 'c-rep-todo', 'Collect screenshots of every journey', { assignee: 'u-hamza', due: 10, priority: 'low', by: 'u-hamza' }),
    task('t-11', 'p-report', 'c-rep-doing', 'Write architecture section', { assignee: 'u-azib', due: 8, labels: ['l-docs'] }),
    task('t-12', 'p-report', 'c-rep-done', 'Agree on report outline', { priority: 'low' }),
    task('t-13', 'p-secret', 'c-sec-todo', 'Confidential launch plan', { ws: 'ws-outsider', by: 'u-bilal', assignee: 'u-bilal', labels: ['l-marketing'] }),
    task('t-14', 'p-secret', 'c-sec-done', 'Hire designer', { ws: 'ws-outsider', by: 'u-bilal' }),
  ]

  const comments: DbComment[] = [
    { id: newId(), taskId: 't-4', authorId: 'u-azib', body: '@Ahmad Bin Tariq can we use keyboard dragging too?', mentionIds: ['u-ahmad'], createdAt: isoDaysFromNow(-2) },
    { id: newId(), taskId: 't-4', authorId: 'u-ahmad', body: 'Yes, the library supports it out of the box.', mentionIds: [], createdAt: isoDaysFromNow(-1.9) },
  ]

  const activity: DbActivity[] = tasks.map((t) => ({
    id: newId(),
    workspaceId: t.workspaceId,
    projectId: t.projectId,
    taskId: t.id,
    actorId: t.createdBy,
    type: 'task.created' as const,
    data: { title: t.title, column: columns.find((c) => c.id === t.columnId)?.name ?? '' },
    createdAt: t.createdAt,
  }))
  activity.push({
    id: newId(),
    workspaceId: 'ws-team',
    projectId: 'p-mvp',
    taskId: 't-4',
    actorId: 'u-ahmad',
    type: 'task.moved',
    data: { title: 'Build Kanban board with drag and drop', from: 'To Do', to: 'In Progress' },
    createdAt: isoDaysFromNow(-3),
  })

  const invitations: DbInvitation[] = [
    { id: newId(), workspaceId: 'ws-team', email: 'new.member@taskloom.dev', role: 'member', token: 'demo-valid-invite', invitedById: 'u-azib', createdAt: isoDaysFromNow(-0.1), expiresAt: isoDaysFromNow(1.9), status: 'pending' },
    { id: newId(), workspaceId: 'ws-team', email: 'late.person@taskloom.dev', role: 'viewer', token: 'demo-expired-invite', invitedById: 'u-ahmad', createdAt: isoDaysFromNow(-3), expiresAt: isoDaysFromNow(-1), status: 'pending' },
  ]

  return {
    users,
    sessions: [],
    workspaces,
    memberships,
    invitations,
    labels,
    projects,
    columns,
    tasks,
    comments,
    activity,
    outbox: [],
  }
}
