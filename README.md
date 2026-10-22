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
