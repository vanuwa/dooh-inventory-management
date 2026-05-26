# DOOH Inventory Management Portal

A read-only inventory browsing portal for Digital Out-of-Home (DOOH) ad inventory managed through an SSP platform.

## What it does

The portal lets operations teams browse the DOOH supply hierarchy without needing direct access to the SSP admin UI:

```
Publishers  →  Publisher detail + Placements  →  Placement detail + Screens (DOOH settings)
```

### Entities

| Entity | Description |
|---|---|
| **Publisher** | A media owner supplying DOOH inventory. Attributes include business unit, seller type (direct / reseller), and active status. |
| **Placement** | A logical ad slot belonging to a publisher. Has a creative type (display, video, etc.) and an active/inactive status. |
| **Screen (DOOH Setting)** | A physical screen linked to a placement. Carries location data (country, city, region, address, GPS), technical specs (resolution, orientation, physical size), venue type, slot duration, CPM, and average weekly audience. |

### Features

- Login with SSP credentials (OAuth2 password grant)
- Paginated, searchable publishers list with active/inactive filter
- Publisher detail page showing metadata and all linked placements (filterable/searchable client-side)
- Placement detail page showing all linked screens in a wide scrollable grid with server-side search and pagination
- Automatic token refresh — sessions stay alive without re-login

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Go 1.26 (stdlib `net/http`, no frameworks) |
| Frontend | React 19 + React Router 7 + Vite 6 |
| Upstream API | SSP REST API |
| Container | Docker Compose (nginx SPA + Go binary) |

---

## Running locally

### Prerequisites

- Docker and Docker Compose
- SSP API credentials (`client_id` and `client_secret`)

### 1. Create a `.env` file

```bash
cp .env.example .env   # if available, otherwise create it manually
```

`.env` contents:

```env
IMPROVE_CLIENT_ID=your_client_id
IMPROVE_CLIENT_SECRET=your_client_secret
```

### 2. Start everything

```bash
make up
```

This builds and starts two containers:

| Container | URL |
|---|---|
| React SPA (nginx) | http://localhost:3000 |
| Go API | http://localhost:8080 |

Open http://localhost:3000 and log in with your SSP username and password.

### 3. Stop

```bash
make down
```

---

## Development

### Backend (Go)

```bash
cd backend
go test ./...        # run tests
go build ./...       # compile check
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # dev server on http://localhost:5173 (proxies /api → localhost:8080)
```

> The Vite dev server proxies `/api/*` to `localhost:8080`, so the Go backend must be running (either via Docker or `go run .` directly).

### Partial rebuilds (Docker)

```bash
make rebuild-api   # rebuild only the Go backend container
make rebuild-ui    # rebuild only the frontend container
```

---

## API routes (backend)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | OAuth2 password grant → returns access + refresh tokens |
| `GET` | `/api/user/details` | Authenticated user profile |
| `GET` | `/api/publishers` | Paginated publishers list (`page`, `limit`, `search`, `active`) |
| `GET` | `/api/publishers/{id}` | Single publisher detail |
| `GET` | `/api/publishers/{id}/placements` | All placements for a publisher |
| `GET` | `/api/publishers/{publisherId}/placements/{placementId}/dooh-settings` | Paginated screens for a placement (`page`, `limit`, `search`) |

All proxy endpoints are read-only (non-GET requests are rejected with 405). Token refresh is handled transparently by the backend on every request.
