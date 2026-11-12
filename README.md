# RHU Queue Management System

Patient queueing for a rural health unit: ticket kiosks, operator consoles,
wall monitors with spoken announcements, and admin tools.

- **Server**: TypeScript, Express 5, Socket.IO (`server/`)
- **Client**: TypeScript, React 19, Vite (`client/`)
- **Database**: MongoDB (works on 4.4 and newer; no replica set needed)

## Setup

```sh
npm install
cp .env.example .env        # then set MONGO_URL and SESSION_SECRET
npm run seed                # departments, windows and a superadmin account
npm run build               # builds the React app into client/dist
npm start                   # serves the API, the socket and the app on PORT
```

`npm run seed` creates the account `superadmin` with the default password
`12345` (or `SEED_ADMIN_PASSWORD` if set). Sign in and change it.

For development, `npm run dev` runs the API with reload and the Vite dev
server on http://localhost:5173.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Server tests. Starts a throwaway `mongo:4.4` Docker container on port 27117. |
| `npm run typecheck` | Type-checks server and client. |
| `npm run backup -- --action=backup` | Takes a `mongodump` archive (also `verify --file=...`, `prune`). |

## Pages

| Path | Who | Purpose |
| --- | --- | --- |
| `/kiosk/waiting`, `/kiosk/abtc` | public | Ticket machines |
| `/live` | public | Wall monitor with announcements |
| `/` | staff | Operator console |
| `/choose-section/admission`, `/choose-section/waiting` | staff | Window chooser |
| `/server-history`, `/audit-trail` | staff | Reports |
| `/users`, `/departments` | admin | Management |
| `/queue-logs`, `/sections`, `/backup` | superadmin | Logs, windows, backups |

## Queue rules

- Serve order is emergency, then priority, then regular, each first come
  first served by arrival at the current department.
- "Today" means tickets issued on the current Manila calendar day.
- Ticket numbers restart at 001 each day per department and prefix
  (`R/P/E`, `AR/AP/AE` for ABTC, `DR/DP/DE` for dental).
- An operator holds at most one patient per department. A unique MongoDB
  index enforces this.
- Admission (id 3) and Waiting Area (id 15) work through windows. Clinics
  1, 2 and 3 (ids 1, 2, 4) form the mutual help pool. These ids are set in
  `server/src/config.ts` and can be overridden in `.env`.

## Deployment

`deploy/` has a systemd unit for the app, a nightly backup timer and an
nginx reverse proxy example. The realtime socket runs inside the app
process, so no separate socket server is needed.

Backups need the MongoDB Database Tools (`mongodump`, `mongorestore`) on the
server.
