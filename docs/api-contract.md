# Taskloom API contract

The agreed interface between the React client and the Express backend. The TypeScript source of truth for every shape below is [`client/src/api/types.ts`](../client/src/api/types.ts); the mock backend in `client/src/api/mock/` implements this contract today and the Express API must behave the same way.

## Conventions

- Base path `/api`. JSON in and out. Auth: `Authorization: Bearer <jwt>`.
- Every mutation runs in this order: **authenticate → authorize → validate → persist → write activity → emit Socket.IO event**.
- Resources in a workspace the caller does not belong to return **404** (never reveal they exist). Workspace endpoints themselves return **403**.
- Errors: `{ "error": { "code", "message", "fieldErrors": { "<field>": "<message>" } } }`

| Status | code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | missing/expired token, wrong credentials |
| 403 | `FORBIDDEN` | role not allowed, not a workspace member, invite for another email |
| 404 | `NOT_FOUND` | unknown id or resource in another workspace |
| 409 | `CONFLICT` | stale `version`, expired invitation, non-empty column delete |
| 422 | `VALIDATION` | invalid payload (`fieldErrors` filled) |
| 500 | `SERVER` | unexpected |

## Permissions

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View workspace, projects, tasks, comments, activity | ✓ | ✓ | ✓ | ✓ |
| Create / edit / move tasks, comment | ✓ | ✓ | ✓ | |
| Delete tasks | ✓ | ✓ | own tasks only | |
| Manage projects, columns, labels | ✓ | ✓ | | |
| Invite, remove, change roles | ✓ | Members and Viewers only | | |
| Rename workspace | ✓ | ✓ | | |
| Delete workspace | ✓ | | | |

Nobody changes their own role. The Owner cannot leave (delete instead). Implemented in `client/src/api/permissions.ts`; the server repeats every check.

## REST endpoints

| Method | Path | Body → Response |
|---|---|---|
| POST | `/auth/register` | `RegisterInput` → `AuthResult` |
| POST | `/auth/login` | `LoginInput` → `AuthResult` |
| POST | `/auth/google` | `{ idToken }` (Google Identity Services credential, verified server-side) → `AuthResult` |
| GET | `/auth/me` | → `User` |
| PATCH | `/auth/me` | `{ name?, theme? }` → `User` |
| POST | `/auth/logout` | → 204 |
| GET | `/workspaces` | → `Workspace[]` (only the caller's, with `myRole`) |
| POST | `/workspaces` | `{ name }` → `Workspace` (caller becomes Owner) |
| GET / PATCH / DELETE | `/workspaces/:workspaceId` | PATCH `{ name }` → `Workspace` |
| POST | `/workspaces/:workspaceId/leave` | → 204 |
| GET | `/workspaces/:workspaceId/members` | → `Member[]` |
| PATCH / DELETE | `/workspaces/:workspaceId/members/:userId` | PATCH `{ role }` → `Member` |
| GET / POST | `/workspaces/:workspaceId/invitations` | POST `{ email, role }` → `Invitation` (emails a link, expires in 48 h) |
| DELETE | `/workspaces/:workspaceId/invitations/:invitationId` | → 204 |
| GET | `/invitations/:token` | public → `InvitationPreview` |
| POST | `/invitations/:token/accept` | → `Workspace` (signed-in email must match) |
| GET / POST | `/workspaces/:workspaceId/labels` | POST `{ name, color }` → `Label` |
| DELETE | `/workspaces/:workspaceId/labels/:labelId` | → 204 |
| GET / POST | `/workspaces/:workspaceId/projects` | POST `{ name, description }` → `Project` (creates To Do / In Progress / Review / Done) |
| PATCH / DELETE | `/projects/:projectId` | PATCH `{ name, description }` → `Project` |
| GET | `/projects/:projectId/board` | → `Board` |
| POST | `/projects/:projectId/columns` | `{ name }` → `Column` (max 10) |
| PATCH / DELETE | `/columns/:columnId` | PATCH `{ name }`; DELETE fails with 409 if it has tasks |
| POST | `/projects/:projectId/tasks` | `{ columnId, ...TaskInput }` → `Task` |
| GET / PATCH / DELETE | `/tasks/:taskId` | PATCH `{ ...TaskInput, version }` → `Task` (409 if `version` is stale) |
| POST | `/tasks/:taskId/move` | `{ columnId, afterTaskId, version }` → `Task` |
| GET | `/workspaces/:workspaceId/tasks/search` | query `text, assigneeId, labelId, priority, due` (AND) → `SearchResult[]` (max 50) |
| GET / POST | `/tasks/:taskId/comments` | POST `{ body, mentionIds }` → `Comment` |
| GET | `/projects/:projectId/activity`, `/tasks/:taskId/activity` | → `Activity[]` (newest first, max 100) |

**Validation limits:** name 2–60, workspace name 2–50, project name 2–60, description ≤ 500, column 1–30, task title 1–120, task description ≤ 5000, comment 1–2000, label 1–24 (unique per workspace), password ≥ 8. The assignee must be a non-Viewer member; labels and mentions must belong to the workspace.

**Emails:** invitation (with link), new assignment (when the assignee is not the actor), @mention.

## Socket.IO

- **Connect:** `io(url, { auth: { token } })`. The server verifies the JWT in the handshake and rejects the connection otherwise.
- **Join:** the client emits `workspace:join` with a workspace id and an ack callback. The server checks membership in the database and joins room `workspace:<id>`, or acks `{ error: 'FORBIDDEN' }`. The server never trusts a room name supplied by the client.
- **Leave:** `workspace:leave`. When a member is removed, the server removes their sockets from the room and sends them `workspace:access-revoked`.
- **Reconnect:** the client re-joins its rooms and refetches visible data (missed events are not replayed).

**Events** (server → room), envelope `RealtimeEvent { eventId, type, workspaceId, projectId, actorId, at, data }`:

| type | data |
|---|---|
| `task:created`, `task:updated`, `task:moved` | `{ task }` (clients keep the higher `version`) |
| `task:deleted` | `{ taskId }` |
| `column:changed`, `project:changed` | `{}` (clients refetch) |
| `comment:created` | `{ comment, taskId }` |
| `activity:created` | `{ activity }` |
| `member:changed` | `{ userId? }` |
| `workspace:access-revoked` | `{ userId? }` (absent = workspace deleted) |

Clients drop any `eventId` they have already handled. One backend instance; no Redis adapter.
