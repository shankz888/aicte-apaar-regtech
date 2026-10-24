# APAAR RegTech frontend

This Next.js 14 App Router application provides the SIH 2026 project landing page and role-based demo workspaces. The repository overview, route map, backend setup, and contributor handoff notes are in the root [README](../README.md).

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The UI expects the FastAPI backend at `http://127.0.0.1:8000` for live API-driven data and actions. Configure `NEXT_PUBLIC_API_URL` before starting Next.js to change that target.

## Check changes

```sh
npm run build
npm run lint
```

## Shared UI components

- `components/backgrounds/global-effects.tsx`: site-wide cursor-reactive MicroSlats background and safe scroll reveals.
- `components/backgrounds/micro-slats.tsx`: WebGL slat background renderer.
- `components/layout/app-header.tsx`: shared workspace header and line sidebar.
- `components/ui/animated-role-list.tsx`: accessible animated role selector.
- `components/ui/glass-icon.tsx`: glass treatment for workspace icons.
