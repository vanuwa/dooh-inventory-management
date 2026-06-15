# DOOH Inventory Management Portal

An inventory management portal for Digital Out-of-Home (DOOH) ad inventory managed through an SSP platform.

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
- Publisher detail page with four tabs (URL-reflected):
  - **Placements** — server-side paginated/searchable grid sorted by ID descending; create a new DOOH placement via modal (orchestrates inventory + zone + placement creation in the backend)
  - **Bulk Upload Jobs** — lists jobs, shows per-task breakdown and error messages in a detail modal, upload a new file
  - **Users** — list publisher users; create or edit a user (Console/API access types, role presets) via modal
  - **Reporting** — generate and download a CSV performance report for the publisher
- Placement detail page with two tabs (URL-reflected):
  - **Screens** — server-side paginated grid; click any row to open a view/edit modal with full screen details; download all screens as CSV
  - **Reporting** — generate and download a CSV performance report for the placement
- Automatic token refresh — handled client-side via response headers, sessions stay alive without re-login

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
| `GET` | `/api/publishers/{id}/placements` | Paginated placements for a publisher (sorted `-id`) |
| `POST` | `/api/publishers/{id}/placements` | Create a DOOH placement (orchestrates inventory + zone + placement upstream) |
| `GET` | `/api/publishers/{publisherId}/placements/{placementId}/dooh-settings` | Paginated screens for a placement (`page`, `limit`, `search`, `sort`) |
| `POST` | `/api/report/placement/{publisherId}/{placementId}` | Synchronous report preview (up to 500 rows) |
| `POST` | `/api/report/generate/placement/{publisherId}/{placementId}` | Start async CSV report generation |
| `GET` | `/api/report/status/{reportGenerationId}` | Poll generation status until `FINISHED_OK` |
| `GET` | `/api/publishers/{publisherId}/bulk-upload-jobs` | List bulk upload jobs for a publisher |
| `POST` | `/api/publishers/{publisherId}/bulk-upload-jobs` | Upload a new bulk job file (multipart, max 50 MB) |

| `GET` | `/api/publishers/{id}/users` | List users for a publisher |
| `POST` | `/api/publishers/{id}/users` | Create a publisher user |
| `GET` | `/api/publishers/{id}/users/{userId}` | Get publisher user details |
| `PUT` | `/api/publishers/{id}/users/{userId}` | Update a publisher user |
| `POST` | `/api/report/publisher/{publisherId}` | Synchronous publisher report preview |
| `POST` | `/api/report/generate/publisher/{publisherId}` | Start async publisher CSV report generation |

Write-capable endpoints (all others are read-only, non-GET returns 405): auth, placement creation, user create/update, DOOH settings edit, report generation, and bulk upload. Token refresh is handled client-side; a 401 triggers a refresh + retry before logging out.
