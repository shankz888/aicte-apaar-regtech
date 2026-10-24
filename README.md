<<<<<<< HEAD
# AICTE Student Data Verification Platform

The repository is split into independently runnable applications:

- `frontend/`: Next.js 14 App Router foundation (no product UI implemented yet).
- `backend/`: FastAPI, PostgreSQL, SQLAlchemy models, Alembic migration, and
  synthetic seed data.

## Start the frontend

```sh
cd frontend
npm run dev
```

## Set up the backend

See [backend/README.md](backend/README.md) for environment, migration, seed, and
API commands. The backend expects a local PostgreSQL database named
`aicte_verification` by default.
=======
﻿# AICTE APAAR RegTech - SIH 2026

An academic-governance prototype for institution enrolment submissions, intake-compliance review, synthetic validation benchmarks, and privacy-preserving student-record verification.

This repository contains a Next.js frontend and a FastAPI/PostgreSQL backend. The project is a Smart India Hackathon prototype; the demo sign-in is a client-side role switch and is not production authentication.

## Project structure

```text
frontend/   Next.js App Router interface and shared visual components
backend/    FastAPI API, SQLAlchemy models, Alembic migrations, seed/demo data
docs/       Project documentation and design material
```

## Frontend capabilities

- Landing experience at `/login` with the SIH/APAAR RegTech introduction, compliance architecture, and role-based demo portal.
- Responsive glass UI with a cursor-reactive MicroSlats background across the landing page and workspace routes.
- Scroll-triggered blur reveals that keep headings readable if browser motion APIs are unavailable.
- Floating, hover-tilting dashboard illustration; specular CTA buttons and consistent hover, pressed, and keyboard-focus feedback.
- Animated, keyboard-accessible role picker with staggered list-item motion, selected-state feedback, outside-click dismissal, and Escape/arrow-key support.
- Shared glass workspace header and line-style sidebar for Institute, Compliance, Benchmark, and Verification.
- Local GlassIcon component for the sidebar icon tiles. Effects and components are implemented in the project; no `react-bits` package is installed.
- Reduced-motion handling and mobile layouts for the navigation, sign-in profile choices, and role list.

### Workspace routes

| Route | Purpose |
| --- | --- |
| `/login` | Project introduction and role-based demo access |
| `/institution/submit` | Upload and pre-check institution CSV batches |
| `/institution/batches/[id]` | Inspect a submitted batch and its validation results |
| `/admin/overview` | Compliance, sanctioned capacity, exceptions, and disputes |
| `/admin/benchmark` | Run synthetic validation scenarios and review metrics |
| `/verify/[token]` | Purpose-bound student-record verification gateway |

The root route `/` redirects to `/login`.

## Run the frontend

Requirements: Node.js 18.17 or newer and npm.

```sh
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is occupied, start Next.js on another port, for example `npm run dev -- --port 3004`.

The frontend rewrites `/api/*` to `http://127.0.0.1:8000/api/*` by default. Set `NEXT_PUBLIC_API_URL` before starting the frontend to use another backend URL.

Build and lint/type-check the frontend with:

```sh
npm run build
npm run lint
```

## Run the backend

Requirements: Python 3.11 or newer and PostgreSQL.

```sh
cd backend
python -m venv .venv
```

Activate the virtual environment (Windows PowerShell: `.venv\Scripts\Activate.ps1`; macOS/Linux: `source .venv/bin/activate`), then install and configure:

```sh
pip install -e ".[dev]"
Copy-Item .env.example .env  # Windows PowerShell
```

Update `DATABASE_URL` in `backend/.env` for your local PostgreSQL database, then run:

```sh
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`; interactive API docs are at `/docs`. The frontend's live upload, benchmark, overview, and verification data actions require this backend and its database to be running. Without it, those requests can show connection or API errors while the frontend itself still loads.

Backend API groups are `/api/batches`, `/api/admin`, `/api/benchmark`, and `/api/verify`. Synthetic CSV fixtures and generation scripts are in `backend/data` and `backend/scripts`.

## Validation

Backend tests are configured with `pytest` from `backend/`. Frontend production compilation, lint, and TypeScript checks run as part of `npm run build` from `frontend/`.

## Contributor notes

- Keep visual changes in reusable components and shared styles where possible; preserve responsive and reduced-motion behavior.
- Keep demo-only credentials and synthetic records separate from production authentication or real student data.
- Do not commit `.env`, virtual environments, `node_modules`, `.next`, or uploaded production records.
- For a fresh AI assistant session, start with this README, inspect the current route/component files, check `git status`, and confirm whether the backend is running before diagnosing API-dependent screens.
>>>>>>> teammate/main
