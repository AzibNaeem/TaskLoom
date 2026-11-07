# Taskloom

A lightweight project management app for small teams: workspaces, projects, Kanban boards with drag and drop, roles, invitations, comments with @mentions, activity history, search and live collaboration. Built with the MERN stack for the Web Programming semester project by M. Azib Naeem (23L-2541) and Ahmad Bin Tariq (23L-2510).

## Status

**Frontend phase.** The complete client runs on realistic mock services, including simulated real-time events. The Express + MongoDB + Socket.IO backend starts only after the frontend is approved. The contract it must follow is in [docs/api-contract.md](docs/api-contract.md).

## Run the client

Requires Node.js 24 LTS.

```bash
cd client
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
```

## Demo (mock mode)

All demo accounts use the password `password123`. You can also pick them from the login page.

| Account | Role in "Taskloom Team" |
|---|---|
| azib@taskloom.dev | Owner |
| ahmad@taskloom.dev | Admin |
| hamza@taskloom.dev | Member |
| sara@taskloom.dev | Viewer (read-only) |
| bilal@taskloom.dev | Not a member (owns "Outsider Studio") |

**Real-time:** sign in as two different users in two tabs of the same browser and open the same board. Creating, moving or editing tasks and posting comments update the other tab instantly. The mock data lives in this browser's `localStorage`, so use tabs rather than two different browsers until the backend exists.

**Mock tools** (bottom-left button) can:

- add latency, random failures, or a forced 401/403/422/500/network error;
- take the connection offline and back, or simulate a sleeping free-tier server;
- make a teammate act, replay a duplicate event, or make the board stale (409 on the next move);
- open a workspace you are not a member of;
- expire invitations;
- read the email outbox (invitations, assignments, mentions);
- reset all demo data.

## Structure

```
client/src/
  api/          contract types, permissions, filters, service selection
    mock/       in-browser mock backend, simulated Socket.IO, mock tools
  app/          auth session, toasts, formatting
  components/   shared UI (states, modal, avatar, icons)
  features/     auth, workspaces, members, board, tasks, realtime, settings
  styles/       theme tokens (light/dark) and base styles
docs/api-contract.md   REST + Socket.IO contract for the backend phase
```

## Swapping mocks for the real API

The UI talks only to the `Api` and `RealtimeClient` interfaces exported from `client/src/api/index.ts`. The backend phase adds an HTTP + `socket.io-client` implementation of the same interfaces there, selected with `VITE_API_MODE=http`. No page or component changes.
